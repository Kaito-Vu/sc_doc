import { IconX } from "@tabler/icons-react";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import cellClasses from "@/ee/base/styles/cells.module.css";

/** Removable person chip shown in the person pickers' tag area. */
export function PersonTag({
  id,
  user,
  onRemove,
}: {
  id: string;
  user: { name?: string | null; avatarUrl?: string | null } | undefined;
  onRemove: (id: string) => void;
}) {
  const name = user?.name ?? id.substring(0, 8);
  return (
    <span className={cellClasses.personTag}>
      <CustomAvatar
        avatarUrl={user?.avatarUrl ?? ""}
        name={name}
        size={18}
        radius="xl"
      />
      <span className={cellClasses.personTagName}>{name}</span>
      <button
        type="button"
        className={cellClasses.personTagRemove}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(id);
        }}
      >
        <IconX size={10} />
      </button>
    </span>
  );
}
