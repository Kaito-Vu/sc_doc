import { useEffect, useRef, useState } from "react";
import { ActionIcon, Affix, Transition } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

const SHOW_AFTER_PX = 400;

// Floating "back to top" button for the page editor. The scroll container
// differs by layout (window vs. an overflow div), so listen to scroll events
// in the capture phase and keep the one that contains the editor.
export function BackToTopFab() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const scroller = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onScroll = (e: Event) => {
      const target = e.target;
      let el: HTMLElement;
      let top: number;
      if (target instanceof Document) {
        el = document.documentElement;
        top = window.scrollY;
      } else if (
        target instanceof HTMLElement &&
        target.contains(document.querySelector(".ProseMirror"))
      ) {
        el = target;
        top = target.scrollTop;
      } else {
        return;
      }
      scroller.current = el;
      setVisible(top > SHOW_AFTER_PX);
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  const toTop = () => {
    const el = scroller.current;
    if (el === document.documentElement) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      el?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <Affix position={{ bottom: 24, right: 24 }} zIndex={100}>
      <Transition transition="slide-up" mounted={visible}>
        {(styles) => (
          <ActionIcon
            style={styles}
            size="lg"
            radius="xl"
            variant="default"
            className="print-hide"
            aria-label={t("Back to top")}
            onClick={toTop}
          >
            <IconArrowUp size={20} />
          </ActionIcon>
        )}
      </Transition>
    </Affix>
  );
}
