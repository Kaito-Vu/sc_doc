import { useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import clsx from "clsx";
import { IconChevronDown } from "@tabler/icons-react";
import SubpageItem from "@/features/editor/components/subpages/subpage-item";
import { useSubpages } from "@/features/editor/components/subpages/use-subpages";
import classes from "./page-subpages-section.module.css";

// Web-only list of a page's children, rendered between title and body but
// outside the document, so it never reaches export/print/copy.
export function PageSubpagesSection({ pageId }: { pageId: string }) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const { subpages } = useSubpages(pageId, "default");

  if (!subpages.length) return null;

  return (
    <section
      className={clsx(classes.section, collapsed && classes.collapsed)}
      aria-label={t("Subpages")}
      data-export-ignore
    >
      <button
        type="button"
        className={classes.header}
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <IconChevronDown size={14} className={classes.chevron} />
        {t("Subpages")}
        <span className={classes.count}>{subpages.length}</span>
      </button>

      {!collapsed && (
        <div role="list" className={classes.list}>
          {subpages.map((page) => (
            <SubpageItem
              key={page.id}
              page={page}
              depth={0}
              sortBy="default"
              showUpdatedAt
              isPublicSpaceRoute={false}
              spaceSlug={spaceSlug}
            />
          ))}
        </div>
      )}
    </section>
  );
}
