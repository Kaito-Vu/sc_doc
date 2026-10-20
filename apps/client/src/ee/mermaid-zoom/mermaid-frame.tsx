import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActionIcon, Group, Paper, Text, Tooltip } from "@mantine/core";
import { IconEdit, IconZoomIn, IconZoomOut, IconZoomReset } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const MIN = 0.25;
const MAX = 8;

/**
 * Wraps a rendered mermaid <svg> with pan/zoom (Ctrl/Cmd + wheel, drag, toolbar buttons)
 * and a toolbar. Clicks never reach ProseMirror, so the code block only opens via Edit.
 */
export function MermaidFrame({
  children,
  onEdit,
}: {
  children: ReactNode;
  onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const frameRef = useRef<HTMLDivElement>(null);
  const view = useRef({ s: 1, tx: 0, ty: 0 });
  const [scale, setScale] = useState(1);

  const svg = () => frameRef.current?.querySelector("svg") as SVGElement | null;
  const apply = () => {
    const v = svg();
    if (!v) return;
    const { s, tx, ty } = view.current;
    v.style.transformOrigin = "0 0";
    v.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  };
  // Zooms keeping the given client point fixed.
  const zoom = (factor: number, clientX: number, clientY: number) => {
    const v = svg();
    if (!v) return;
    const c = view.current;
    const r = v.getBoundingClientRect(); // top-left = untransformed origin + translate
    const cx = clientX - (r.left - c.tx);
    const cy = clientY - (r.top - c.ty);
    const next = Math.min(MAX, Math.max(MIN, c.s * factor));
    c.tx = cx - ((cx - c.tx) * next) / c.s;
    c.ty = cy - ((cy - c.ty) * next) / c.s;
    c.s = next;
    setScale(next);
    apply();
  };
  const zoomCenter = (factor: number) => {
    const r = frameRef.current!.getBoundingClientRect();
    zoom(factor, r.left + r.width / 2, r.top + r.height / 2);
  };
  const reset = () => {
    view.current = { s: 1, tx: 0, ty: 0 };
    setScale(1);
    apply();
  };

  useEffect(() => {
    const el = frameRef.current!;
    // The svg is replaced on re-render; keep the transform on the new one.
    const mo = new MutationObserver(apply);
    mo.observe(el, { childList: true, subtree: true });
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      mo.disconnect();
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (e.button !== 0 || (e.target as Element).closest("[data-mz-toolbar]")) return;
    // Leave the native resize grip (bottom-right corner) alone.
    const b = el.getBoundingClientRect();
    if (e.clientX > b.right - 20 && e.clientY > b.bottom - 20) return;
    const c = view.current;
    if (c.s === 1 && c.tx === 0 && c.ty === 0) return;
    let x = e.clientX, y = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.style.cursor = "grabbing";
    const move = (m: PointerEvent) => {
      c.tx += m.clientX - x;
      c.ty += m.clientY - y;
      x = m.clientX;
      y = m.clientY;
      apply();
    };
    const up = () => {
      el.style.cursor = "";
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={frameRef}
      style={{ position: "relative", overflow: "hidden", resize: "both", minHeight: 80, minWidth: 120, maxWidth: "100%", margin: "0 auto" }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
    >
      {children}
      <Paper
          data-mz-toolbar
          withBorder
          shadow="sm"
          p={2}
          style={{ position: "absolute", bottom: 4, right: 4, zIndex: 2 }}
        >
          <Group gap={2} wrap="nowrap">
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => zoomCenter(1 / 1.25)}>
              <IconZoomOut size={16} />
            </ActionIcon>
            <Text size="xs" w={40} ta="center">
              {Math.round(scale * 100)}%
            </Text>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => zoomCenter(1.25)}>
              <IconZoomIn size={16} />
            </ActionIcon>
            <Tooltip label={t("Reset zoom")} withArrow>
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={reset}>
                <IconZoomReset size={16} />
              </ActionIcon>
            </Tooltip>
            {onEdit && (
              <Tooltip label={t("Edit")} withArrow>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={onEdit}>
                  <IconEdit size={16} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
      </Paper>
    </div>
  );
}
