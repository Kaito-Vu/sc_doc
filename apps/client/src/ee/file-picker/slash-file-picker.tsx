import { useEffect, useRef } from "react";
import { ReactRenderer, type Editor } from "@tiptap/react";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import { Button, Group, Paper, Text } from "@mantine/core";
import { IconUpload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

type UploadFn = (
  file: File,
  editor: Editor,
  pos: number,
  pageId: string,
  ...rest: any[]
) => void;

export interface PickFileOptions {
  accept: string;
  multiple: boolean;
  upload: UploadFn;
  /** Extra trailing argument for `upload` (e.g. attachment's allowMedia). */
  extra?: boolean;
}

/*
 * Chrome on Windows honours the OS "Hide pointer while typing" setting: typing
 * hides the pointer until the mouse moves inside Chrome's own window. A native
 * file dialog opened before that move (e.g. `/image` + Enter) never receives
 * that move, so the pointer stays invisible for the dialog's whole life.
 * Track whether the pointer may be hidden, and if so don't open the dialog yet.
 */
let pointerMaybeHidden = false;
if (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")) {
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        pointerMaybeHidden = true;
      }
    },
    true,
  );
  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.movementX || e.movementY) pointerMaybeHidden = false;
    },
    true,
  );
}

function uploadFiles(
  editor: Editor,
  pageId: string,
  files: FileList | null,
  opts: PickFileOptions,
) {
  const list = Array.from(files ?? []).slice(0, opts.multiple ? undefined : 1);
  for (const file of list) {
    const pos = editor.view.state.selection.from;
    if (opts.extra !== undefined) {
      opts.upload(file, editor, pos, pageId, opts.extra);
    } else {
      opts.upload(file, editor, pos, pageId);
    }
  }
}

function openFilePicker(
  editor: Editor,
  pageId: string,
  opts: PickFileOptions,
  onDone?: () => void,
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = opts.accept;
  input.multiple = opts.multiple;
  input.style.display = "none";
  document.body.appendChild(input);
  const done = () => {
    input.remove();
    onDone?.();
  };
  input.onchange = () => {
    uploadFiles(editor, pageId, input.files, opts);
    done();
  };
  input.addEventListener("cancel", done);
  input.click();
}

interface PopoverProps {
  editor: Editor;
  pageId: string;
  opts: PickFileOptions;
  close: () => void;
}

function FilePickerPopover({ editor, pageId, opts, close }: PopoverProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const picking = useRef(false);

  const finish = () => {
    close();
    editor.commands.focus();
  };

  const pick = () => {
    if (picking.current) return;
    picking.current = true;
    openFilePicker(editor, pageId, opts, finish);
  };

  useEffect(() => {
    buttonRef.current?.focus();

    // First real mouse move = pointer visible again. Open the dialog right away
    // while the Enter keypress still grants user activation (~5s in Chrome);
    // after that the user clicks the button instead.
    const onMove = (e: PointerEvent) => {
      if ((e.movementX || e.movementY) && navigator.userActivation?.isActive) {
        pick();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <Paper
      ref={rootRef}
      shadow="md"
      p="xs"
      withBorder
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        uploadFiles(editor, pageId, e.dataTransfer.files, opts);
        finish();
      }}
    >
      <Group gap="sm" wrap="nowrap">
        <Button
          ref={buttonRef}
          size="xs"
          leftSection={<IconUpload size={14} />}
          onClick={pick}
        >
          {t("Choose file")}
        </Button>
        <Text size="xs" c="dimmed">
          {t("or drop it here · Esc to cancel")}
        </Text>
      </Group>
    </Paper>
  );
}

function showFilePickerPopover(
  editor: Editor,
  pageId: string,
  opts: PickFileOptions,
) {
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "absolute",
    top: "0",
    left: "0",
    zIndex: "199",
  });
  document.body.appendChild(host);

  const { from } = editor.state.selection;
  const reference = {
    getBoundingClientRect: () => {
      const c = editor.view.coordsAtPos(from);
      return new DOMRect(c.left, c.top, 0, c.bottom - c.top);
    },
  };
  const stopAutoUpdate = autoUpdate(reference, host, () => {
    computePosition(reference, host, {
      placement: "bottom-start",
      middleware: [offset(4), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      host.style.left = `${x}px`;
      host.style.top = `${y}px`;
    });
  });

  let renderer: ReactRenderer | null = null;
  const close = () => {
    if (!renderer) return;
    renderer.destroy();
    renderer = null;
    stopAutoUpdate();
    host.remove();
    editor.off("destroy", close);
  };

  renderer = new ReactRenderer(FilePickerPopover, {
    editor,
    props: { editor, pageId, opts, close },
  });
  host.appendChild(renderer.element);
  editor.on("destroy", close);
}

/**
 * File picker for slash commands. Opens the native dialog directly unless the
 * pointer may be hidden by typing; then shows a small popover that opens the
 * dialog on the first mouse move (pointer visible), Enter, or accepts a drop.
 */
export function pickFileFromSlash(editor: Editor, opts: PickFileOptions) {
  // @ts-ignore — editor.storage.pageId is set by PageEditor.onCreate
  const pageId = editor.storage?.pageId as string | undefined;
  if (!pageId) return;

  if (pointerMaybeHidden) {
    showFilePickerPopover(editor, pageId, opts);
  } else {
    openFilePicker(editor, pageId, opts);
  }
}
