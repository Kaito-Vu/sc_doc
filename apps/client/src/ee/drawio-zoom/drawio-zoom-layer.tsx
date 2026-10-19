import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { ActionIcon, Group, Paper, Text, Tooltip } from "@mantine/core";
import { IconEdit, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const MIN = 0.25;
const MAX = 8;
const SELECTOR = '[data-resize-container][data-node="drawio"]';

type View = { s: number; tx: number; ty: number };
const zoomed = (v: View) => v.s !== 1 || v.tx !== 0 || v.ty !== 0;

/**
 * Pan/zoom + hover toolbar for rendered draw.io diagrams, without touching the node view:
 * Ctrl/Cmd + wheel zooms at the cursor, drag pans (while zoomed), toolbar has zoom/edit.
 */
export function DrawioZoomLayer({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const views = useRef(new WeakMap<HTMLElement, View>());
  const hideTimer = useRef<number | undefined>(undefined);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [, force] = useState(0);

  const getView = (c: HTMLElement) => {
    let v = views.current.get(c);
    if (!v) views.current.set(c, (v = { s: 1, tx: 0, ty: 0 }));
    return v;
  };
  const imgOf = (c: HTMLElement) => c.querySelector("img");
  const apply = (c: HTMLElement) => {
    const img = imgOf(c);
    if (!img) return;
    const v = getView(c);
    const wrapper = img.parentElement as HTMLElement;
    // Clip only while zoomed so resize handles stay reachable at 100%.
    wrapper.style.overflow = zoomed(v) ? "hidden" : "";
    img.style.transformOrigin = "0 0";
    img.style.transform = zoomed(v)
      ? `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`
      : "";
    force((n) => n + 1);
  };
  const zoom = (c: HTMLElement, factor: number, clientX: number, clientY: number) => {
    const img = imgOf(c);
    if (!img) return;
    const v = getView(c);
    const r = img.getBoundingClientRect(); // top-left = untransformed origin + translate
    const cx = clientX - (r.left - v.tx);
    const cy = clientY - (r.top - v.ty);
    const next = Math.min(MAX, Math.max(MIN, v.s * factor));
    v.tx = cx - ((cx - v.tx) * next) / v.s;
    v.ty = cy - ((cy - v.ty) * next) / v.s;
    v.s = next;
    apply(c);
  };
  const zoomCenter = (c: HTMLElement, factor: number) => {
    const r = c.getBoundingClientRect();
    zoom(c, factor, r.left + r.width / 2, r.top + r.height / 2);
  };
  const reset = (c: HTMLElement) => {
    views.current.set(c, { s: 1, tx: 0, ty: 0 });
    apply(c);
  };
  const edit = (c: HTMLElement) => {
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "drawio" && editor.view.nodeDOM(pos) === c) {
        editor.chain().setNodeSelection(pos).run();
        // Open the diagram editor via the bubble menu's own Edit button.
        setTimeout(() => {
          document
            .querySelector<HTMLElement>('button[aria-label="Edit"]')
            ?.click();
        }, 100);
      }
      return false;
    });
  };

  useEffect(() => {
    const dom = editor.view.dom;
    const containerOf = (e: Event) =>
      (e.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
    const updateRect = (c: HTMLElement) => setRect(c.getBoundingClientRect());

    const onOver = (e: MouseEvent) => {
      const c = containerOf(e);
      if (!c) return;
      clearTimeout(hideTimer.current);
      setTarget(c);
      updateRect(c);
    };
    const onOut = (e: MouseEvent) => {
      if (!containerOf(e)) return;
      hideTimer.current = window.setTimeout(() => setTarget(null), 200);
    };
    const onWheel = (e: WheelEvent) => {
      const c = containerOf(e);
      if (!c || (!e.ctrlKey && !e.metaKey)) return;
      e.preventDefault();
      zoom(c, e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      const c = containerOf(e);
      if (!c || e.button !== 0 || !(e.target as Element).closest("img")) return;
      const v = getView(c);
      if (!zoomed(v)) return;
      e.stopPropagation();
      e.preventDefault();
      let x = e.clientX,
        y = e.clientY;
      const move = (m: PointerEvent) => {
        v.tx += m.clientX - x;
        v.ty += m.clientY - y;
        x = m.clientX;
        y = m.clientY;
        apply(c);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    };
    // While zoomed, clicks must not select the node or open the lightbox.
    const swallow = (e: MouseEvent) => {
      const c = containerOf(e);
      if (c && (e.target as Element).closest("img") && zoomed(getView(c))) {
        e.stopPropagation();
      }
    };
    const onDbl = (e: MouseEvent) => {
      const c = containerOf(e);
      if (c && zoomed(getView(c))) reset(c);
    };
    const onScroll = () => target && updateRect(target);

    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseout", onOut);
    dom.addEventListener("wheel", onWheel, { passive: false, capture: true });
    dom.addEventListener("pointerdown", onDown, true);
    dom.addEventListener("mousedown", swallow, true);
    dom.addEventListener("click", swallow, true);
    dom.addEventListener("dblclick", onDbl, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseout", onOut);
      dom.removeEventListener("wheel", onWheel, true);
      dom.removeEventListener("pointerdown", onDown, true);
      dom.removeEventListener("mousedown", swallow, true);
      dom.removeEventListener("click", swallow, true);
      dom.removeEventListener("dblclick", onDbl, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [editor, target]);

  if (!target || !rect || !target.isConnected) return null;
  const v = getView(target);

  return createPortal(
    <Paper
      withBorder
      shadow="sm"
      p={2}
      onMouseEnter={() => clearTimeout(hideTimer.current)}
      onMouseLeave={() => setTarget(null)}
      style={{
        position: "fixed",
        top: rect.top + 4,
        left: rect.right - 4,
        transform: "translateX(-100%)",
        zIndex: 150,
      }}
    >
      <Group gap={2} wrap="nowrap">
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => zoomCenter(target, 1 / 1.25)}>
          <IconZoomOut size={16} />
        </ActionIcon>
        <Tooltip label={t("Reset zoom")} withArrow>
          <Text size="xs" w={40} ta="center" style={{ cursor: "pointer" }} onClick={() => reset(target)}>
            {Math.round(v.s * 100)}%
          </Text>
        </Tooltip>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => zoomCenter(target, 1.25)}>
          <IconZoomIn size={16} />
        </ActionIcon>
        {editor.isEditable && (
          <Tooltip label={t("Edit")} withArrow>
            <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => edit(target)}>
              <IconEdit size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    </Paper>,
    document.body,
  );
}
