import clsx from "clsx";
import styles from "./docs.module.css";

export default function DocsFooterBranding({
  className,
  refSource = "public-space",
}: {
  className?: string;
  refSource?: string;
}) {
  return (
    <footer className={clsx(styles.footer, className)}>
      <a
        className={styles.footerBranding}
        href="https://doc.etc.vn"
        target="_blank"
        rel="noreferrer"
      >
        Copyright © 2026 DocManagement. All rights reserved.
      </a>
    </footer>
  );
}
