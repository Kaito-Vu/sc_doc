import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  allowSessionConflict,
  denySessionConflict,
  getSessionGuardStatus,
  SessionGuardRole,
  SessionGuardStatus,
} from "@/ee/session-guard/services/session-guard-service";

interface PendingConflict {
  conflictId: string;
  role: SessionGuardRole;
  deadline: number;
  peerIp?: string;
  peerDevice?: string;
  canRespond: boolean;
}

interface SessionConflictEvent {
  conflictId: string;
  role: SessionGuardRole;
  deadline: number;
  peerIp?: string;
  peerDevice?: string;
  canRespond?: boolean;
}

interface SessionRevokedEvent {
  conflictId: string;
  reason?: string;
}

interface SessionConflictResolvedEvent {
  conflictId: string;
  outcome: "kept" | "denied" | "allowed" | "cancelled" | "superseded" | string;
  reason?: string;
}

const AUTH_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/password-reset",
  "/setup",
  "/verify-email",
  "/invites",
  "/oauth/consent",
  "/select",
  "/create",
];

// Polling returns a stored status; derive the same outcome the socket event carries.
function outcomeFromStatus(status: SessionGuardStatus): string {
  if (status.status === "resolved") return "cancelled";
  switch (status.reason) {
    case "denied_by_existing":
    case "existing_online":
      return "denied";
    case "superseded":
    case "new_session_gone":
      return "cancelled";
    default:
      return "allowed";
  }
}

function isAuthPath() {
  const { pathname } = window.location;
  return AUTH_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function SessionGuardOverlay() {
  const { t } = useTranslation();
  const [socket] = useAtom(socketAtom);
  const [pending, setPending] = useState<PendingConflict | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [responding, setResponding] = useState(false);

  const handledRef = useRef<Set<string>>(new Set());
  const redirectingRef = useRef(false);
  const redirectTimerRef = useRef<number | null>(null);
  const statusSeqRef = useRef(0);
  const lastEventAtRef = useRef(0);
  const hadPendingRef = useRef(false);

  const markHandled = useCallback((type: string, conflictId?: string) => {
    if (!conflictId) return true;
    const key = `${type}:${conflictId}`;
    if (handledRef.current.has(key)) return false;
    handledRef.current.add(key);
    return true;
  }, []);

  const revokedReasonMessage = useCallback(
    (reason?: string) => {
      if (reason === "denied_by_existing") {
        return t("Your session ended because the new login was rejected.");
      }
      if (reason === "existing_online") {
        return t(
          "Your login was rejected because this account is active on another device.",
        );
      }
      return t("Your session ended because another device signed in.");
    },
    [t],
  );

  const resolvedMessage = useCallback(
    (outcome: string) => {
      switch (outcome) {
        case "allowed":
        case "kept":
          return t("New login approved");
        case "denied":
          return t("New login rejected");
        default:
          return t("The login conflict was cancelled.");
      }
    },
    [t],
  );

  // One mapping for both delivery paths (socket event and status polling).
  const notifyResolved = useCallback(
    (outcome: string) => {
      notifications.show({
        message: resolvedMessage(outcome),
        color:
          outcome === "denied"
            ? "red"
            : outcome === "allowed" || outcome === "kept"
              ? "green"
              : "yellow",
      });
    },
    [resolvedMessage],
  );

  const handleRevoked = useCallback(
    (conflictId?: string, reason?: string) => {
      if (conflictId && !markHandled("revoked", conflictId)) return;
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      hadPendingRef.current = false;
      setPending(null);
      notifications.show({
        message: revokedReasonMessage(reason),
        color: "red",
        autoClose: 1500,
      });
      redirectTimerRef.current = window.setTimeout(() => {
        redirectTimerRef.current = null;
        if (isAuthPath()) {
          redirectingRef.current = false;
          return;
        }
        window.location.replace("/login?session=revoked");
      }, 1200);
    },
    [markHandled, revokedReasonMessage],
  );

  const applyStatus = useCallback(
    (status: SessionGuardStatus | null | undefined) => {
      if (!status || status.status === "none") {
        setPending(null);
        return;
      }

      if (status.status === "pending" && status.conflictId) {
        hadPendingRef.current = true;
        const conflictId = status.conflictId;
        setPending((current) => {
          const prev = current?.conflictId === conflictId ? current : null;
          const role = status.role ?? prev?.role ?? "new";
          return {
            conflictId,
            role,
            deadline: status.deadline ?? prev?.deadline ?? Date.now(),
            peerIp: status.peerIp ?? prev?.peerIp,
            peerDevice: status.peerDevice ?? prev?.peerDevice,
            canRespond: status.canRespond ?? false,
          };
        });
        return;
      }

      if (status.status === "revoked") {
        handleRevoked(status.conflictId, status.reason);
        return;
      }

      if (status.status === "resolved" || status.status === "kept") {
        setPending(null);
        const shouldNotify = hadPendingRef.current;
        hadPendingRef.current = false;
        if (
          shouldNotify &&
          status.conflictId &&
          markHandled("resolved", status.conflictId)
        ) {
          notifyResolved(outcomeFromStatus(status));
        }
      }
    },
    [handleRevoked, markHandled, notifyResolved],
  );

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (isAuthPath()) return;
      const seq = ++statusSeqRef.current;
      const startedAt = Date.now();
      try {
        const status = await getSessionGuardStatus();
        // Ignore a response that a newer request or a realtime event
        // superseded while this request was in flight.
        if (cancelled || seq !== statusSeqRef.current) return;
        if (lastEventAtRef.current > startedAt) return;
        applyStatus(status);
      } catch {
        return;
      }
    };

    if (socket?.connected) void refresh();

    if (!socket) {
      return () => {
        cancelled = true;
      };
    }

    const onConnect = () => {
      void refresh();
    };

    socket.on("connect", onConnect);
    socket.io.on("reconnect", onConnect);

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
      socket.io.off("reconnect", onConnect);
    };
  }, [socket, applyStatus]);

  useEffect(() => {
    if (!socket) return;

    const handleConflict = (payload: SessionConflictEvent) => {
      if (!payload?.conflictId) return;
      lastEventAtRef.current = Date.now();
      hadPendingRef.current = true;
      const conflictId = payload.conflictId;
      setPending((current) => {
        const prev = current?.conflictId === conflictId ? current : null;
        const role = payload.role ?? prev?.role ?? "new";
        return {
          conflictId,
          role,
          deadline: payload.deadline ?? prev?.deadline ?? Date.now(),
          peerIp: payload.peerIp ?? prev?.peerIp,
          peerDevice: payload.peerDevice ?? prev?.peerDevice,
          canRespond: payload.canRespond ?? prev?.canRespond ?? false,
        };
      });
    };

    const handleRevokedEvent = (payload: SessionRevokedEvent) => {
      if (!payload?.conflictId) return;
      lastEventAtRef.current = Date.now();
      handleRevoked(payload.conflictId, payload.reason);
    };

    const handleResolved = (payload: SessionConflictResolvedEvent) => {
      if (!payload?.conflictId) return;
      lastEventAtRef.current = Date.now();
      const conflictId = payload.conflictId;
      if (!markHandled("resolved", conflictId)) return;
      hadPendingRef.current = false;
      setPending((prev) => (prev?.conflictId === conflictId ? null : prev));
      notifyResolved(payload.outcome);
    };

    socket.on("security:session-conflict", handleConflict);
    socket.on("security:session-revoked", handleRevokedEvent);
    socket.on("security:session-conflict-resolved", handleResolved);

    return () => {
      socket.off("security:session-conflict", handleConflict);
      socket.off("security:session-revoked", handleRevokedEvent);
      socket.off("security:session-conflict-resolved", handleResolved);
    };
  }, [socket, handleRevoked, markHandled, notifyResolved]);

  const pendingConflictId = pending?.conflictId;
  const pendingDeadline = pending?.deadline;

  useEffect(() => {
    if (!pendingConflictId || !pendingDeadline) return;

    let cancelled = false;
    let timer: number | undefined;
    const stopAt = pendingDeadline + 30_000;

    const poll = async () => {
      if (cancelled) return;
      const seq = ++statusSeqRef.current;
      const startedAt = Date.now();
      try {
        const status = await getSessionGuardStatus();
        if (cancelled) return;
        // Skip stale/superseded results but keep polling until the deadline.
        if (seq === statusSeqRef.current && lastEventAtRef.current <= startedAt) {
          applyStatus(status);
        }
      } catch {
        // Network error: fall through and reschedule below.
      }
      if (cancelled) return;
      if (Date.now() >= stopAt) return;
      timer = window.setTimeout(poll, 2000);
    };

    timer = window.setTimeout(poll, 2000);

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pendingConflictId, pendingDeadline, applyStatus]);

  useEffect(() => {
    if (!pendingConflictId) return;
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [pendingConflictId, pendingDeadline]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // Nothing resolved the conflict by the deadline (missed event, restart):
  // reconcile once with the server instead of leaving a stuck modal.
  const expired = !!pendingConflictId && pendingDeadline! <= now;
  useEffect(() => {
    if (!expired) return;
    const timer = window.setTimeout(async () => {
      try {
        applyStatus(await getSessionGuardStatus());
      } catch {
        // fall through to closing the modal
      }
    }, 3000);
    const closer = window.setTimeout(() => setPending(null), 33_000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(closer);
    };
  }, [expired, pendingConflictId, applyStatus]);

  const respond = async (action: "allow" | "deny") => {
    if (!pending?.conflictId || responding) return;
    const conflictId = pending.conflictId;
    setResponding(true);
    try {
      if (action === "allow") {
        await allowSessionConflict(conflictId);
      } else {
        await denySessionConflict(conflictId);
      }
      setPending(null);
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } })?.response
        ?.status;
      if (statusCode === 400) {
        notifications.show({
          message: t("The request expired."),
          color: "yellow",
        });
        try {
          const status = await getSessionGuardStatus();
          applyStatus(status);
        } catch {
          // Ignore refresh failures; the modal is closed below either way.
        }
        setPending(null);
      } else {
        notifications.show({
          message: getApiErrorMessage(err, t("Something went wrong")),
          color: "red",
        });
      }
    } finally {
      setResponding(false);
    }
  };

  const secondsLeft = pendingDeadline
    ? Math.max(0, Math.ceil((pendingDeadline - now) / 1000))
    : 0;
  const canRespond = pending?.role === "existing" && pending.canRespond;
  const peerIp = pending?.peerIp || t("Unknown IP");
  const peerDevice = pending?.peerDevice || t("Unknown device");

  return (
    <Modal
      opened={!!pending}
      onClose={() => undefined}
      title={
        pending?.role === "existing"
          ? t("New login detected")
          : t("Waiting for approval from your other device")
      }
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
    >
      {pending && (
        <Stack gap="md">
          {canRespond ? (
            <Text size="sm">
              {t(
                "A new login was detected from {{ip}} ({{device}}). You will be signed out in {{seconds}}s unless you reject it.",
                {
                  ip: peerIp,
                  device: peerDevice,
                  seconds: secondsLeft,
                },
              )}
            </Text>
          ) : pending.role === "existing" ? (
            <Text size="sm">
              {t(
                "A new login was detected from {{ip}}. This session will be signed out in {{seconds}}s.",
                { ip: peerIp, seconds: secondsLeft },
              )}
            </Text>
          ) : (
            <Stack gap="xs">
              <Group gap="sm" wrap="nowrap">
                <Loader size="sm" />
                <Text size="sm">
                  {t(
                    "This account is already signed in from {{ip}}. Waiting for approval on that device.",
                    { ip: peerIp },
                  )}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {t("Device: {{device}}", { device: peerDevice })}
              </Text>
              <Text size="xs" c="dimmed">
                {t("Time remaining: {{seconds}}s", { seconds: secondsLeft })}
              </Text>
            </Stack>
          )}

          {canRespond && (
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => respond("deny")}
                disabled={responding}
              >
                {t("Reject new login")}
              </Button>
              <Button
                color="red"
                onClick={() => respond("allow")}
                loading={responding}
              >
                {t("Allow and sign out this device")}
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
