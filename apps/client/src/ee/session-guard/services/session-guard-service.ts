import api from "@/lib/api-client";

export type SessionGuardStatusValue =
  | "pending"
  | "revoked"
  | "kept"
  | "resolved"
  | "none";
export type SessionGuardRole = "existing" | "new";

export interface SessionGuardStatus {
  status: SessionGuardStatusValue;
  conflictId?: string;
  role?: SessionGuardRole;
  deadline?: number;
  reason?: string;
  canRespond?: boolean;
  peerIp?: string;
  peerDevice?: string;
}

export interface SessionGuardConflictResponse {
  ok: boolean;
  outcome: "denied" | "allowed";
}

function unwrap<T>(response: unknown): T {
  const wrapped = response as { data?: T } | null;
  if (
    wrapped &&
    typeof wrapped === "object" &&
    "data" in wrapped &&
    wrapped.data !== undefined
  ) {
    return wrapped.data;
  }
  return response as T;
}

export async function getSessionGuardStatus(): Promise<SessionGuardStatus> {
  const response = await api.get<SessionGuardStatus>(
    "/plugins/session-guard/status",
  );
  return unwrap<SessionGuardStatus>(response);
}

export async function denySessionConflict(
  conflictId: string,
): Promise<SessionGuardConflictResponse> {
  const response = await api.post<SessionGuardConflictResponse>(
    `/plugins/session-guard/conflicts/${encodeURIComponent(conflictId)}/deny`,
  );
  return unwrap<SessionGuardConflictResponse>(response);
}

export async function allowSessionConflict(
  conflictId: string,
): Promise<SessionGuardConflictResponse> {
  const response = await api.post<SessionGuardConflictResponse>(
    `/plugins/session-guard/conflicts/${encodeURIComponent(conflictId)}/allow`,
  );
  return unwrap<SessionGuardConflictResponse>(response);
}
