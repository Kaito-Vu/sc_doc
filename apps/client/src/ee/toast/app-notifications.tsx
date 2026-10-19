import { useEffect } from "react";
import { Notifications } from "@mantine/notifications";
import "@/ee/styles/sc-toast.css";

const ROOT = "mantine-Notification-root";

// Mantine renders toasts from a store with no slot for extra content, so the
// show-time is stamped onto the DOM once per toast (WeakSet keeps it idempotent).
function useToastTimestamps() {
  useEffect(() => {
    const stamped = new WeakSet<Element>();
    // Live collection: the observer fires on every DOM mutation in the app
    // (editor typing included), so the no-toast case must stay O(1).
    const roots = document.getElementsByClassName(ROOT);

    const stamp = () => {
      if (!roots.length) return;
      Array.from(roots).forEach((el) => {
        if (stamped.has(el)) return;
        const body = el.querySelector(".mantine-Notification-body");
        if (!body) return;
        stamped.add(el);
        const time = document.createElement("time");
        time.className = "sc-toast-time";
        const now = new Date();
        time.dateTime = now.toISOString();
        time.textContent = now.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        body.appendChild(time);
      });
    };

    const observer = new MutationObserver(stamp);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
}

export function AppNotifications() {
  useToastTimestamps();
  return (
    <Notifications
      position="bottom-center"
      limit={3}
      zIndex={10000}
      autoClose={15000}
    />
  );
}
