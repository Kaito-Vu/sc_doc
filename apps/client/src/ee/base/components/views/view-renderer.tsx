import { FilterGroup } from "@/ee/base/types/base.types";
import { BaseTable, BaseTableProps } from "@/ee/base/components/base-table";
import { BaseKanban } from "@/ee/base/components/kanban/base-kanban";

type ViewRendererProps = BaseTableProps & {
  editable: boolean;
  kanbanFilter?: FilterGroup | undefined;
};

export function ViewRenderer(props: ViewRendererProps) {
  const viewType = props.effectiveView?.type ?? "table";

  if (viewType === "kanban") {
    return (
      <BaseKanban
        base={props.base}
        view={props.effectiveView!}
        pageId={props.pageId}
        embedded={props.embedded}
        editable={props.editable}
        viewFilter={props.kanbanFilter}
      />
    );
  }

  return <BaseTable {...props} />;
}
