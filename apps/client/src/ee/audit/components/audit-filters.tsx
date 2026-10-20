import { useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  MultiSelect,
  Popover,
  Select,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconCalendar,
  IconFilter,
  IconFilterOff,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { subDays } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  actorTypeLabels,
  eventFilterOptions,
  getResourceTypeLabel,
} from "@/ee/audit/lib/audit-event-labels";
import { IAuditFacets } from "@/ee/audit/types/audit.types";

export type AuditFilterState = {
  search: string;
  events: string[];
  resourceType: string | null;
  actorId: string | null;
  spaceId: string | null;
  actorTypes: string[];
  ipAddress: string;
  startDate: string | null;
  endDate: string | null;
  period: string;
};

export const emptyAuditFilters: AuditFilterState = {
  search: "",
  events: [],
  resourceType: null,
  actorId: null,
  spaceId: null,
  actorTypes: [],
  ipAddress: "",
  startDate: null,
  endDate: null,
  period: "all",
};

export function applyPeriod(
  filters: AuditFilterState,
  period: string,
): AuditFilterState {
  const now = new Date();
  let startDate: string | null = null;

  switch (period) {
    case "24h":
      startDate = subDays(now, 1).toISOString();
      break;
    case "7d":
      startDate = subDays(now, 7).toISOString();
      break;
    case "30d":
      startDate = subDays(now, 30).toISOString();
      break;
    case "90d":
      startDate = subDays(now, 90).toISOString();
      break;
    default:
      break;
  }

  return {
    ...filters,
    period,
    startDate,
    endDate: startDate ? now.toISOString() : null,
  };
}

type AuditFiltersProps = {
  value: AuditFilterState;
  facets?: IAuditFacets;
  onChange: (next: AuditFilterState) => void;
  onReset: () => void;
};

export function AuditFilters({
  value,
  facets,
  onChange,
  onReset,
}: AuditFiltersProps) {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const countByEvent = new Map(
    (facets?.events ?? []).map((item) => [item.event, item.count]),
  );
  const eventData = eventFilterOptions.map((group) => ({
    group: t(group.group),
    items: group.items.map((item) => ({
      value: item.value,
      label: `${t(item.label)}${
        countByEvent.has(item.value) ? ` (${countByEvent.get(item.value)})` : ""
      }`,
    })),
  }));
  const knownEvents = new Set(
    eventFilterOptions.flatMap((g) => g.items.map((i) => i.value)),
  );
  const extraEvents = (facets?.events ?? [])
    .filter((item) => !knownEvents.has(item.event))
    .map((item) => ({
      value: item.event,
      label: `${item.event} (${item.count})`,
    }));
  if (extraEvents.length > 0) {
    eventData.push({ group: t("Other"), items: extraEvents });
  }

  const resourceData = (facets?.resourceTypes ?? []).map((item) => ({
    value: item.resourceType,
    label: `${t(getResourceTypeLabel(item.resourceType))} (${item.count})`,
  }));

  const actorData = (facets?.actors ?? []).map((item) => ({
    value: item.actorId,
    label: `${item.name ?? item.email ?? item.actorId}${
      item.email && item.name ? ` · ${item.email}` : ""
    }`,
  }));

  const spaceData = (facets?.spaces ?? []).map((item) => ({
    value: item.spaceId,
    label: `${item.name ?? item.spaceId} (${item.count})`,
  }));

  const activeFilterCount =
    (value.events.length > 0 ? 1 : 0) +
    (value.resourceType ? 1 : 0) +
    (value.actorId ? 1 : 0) +
    (value.spaceId ? 1 : 0) +
    (value.actorTypes.length > 0 ? 1 : 0) +
    (value.ipAddress ? 1 : 0) +
    (value.startDate ? 1 : 0) +
    (value.search ? 1 : 0);

  return (
    <Group gap="sm" align="flex-end" mb="md" wrap="wrap">
      <TextInput
        placeholder={t("Search actor, resource, IP, metadata or event code…")}
        leftSection={<IconSearch size={16} />}
        rightSection={
          value.search ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={() => onChange({ ...value, search: "" })}
              aria-label={t("Clear search")}
            >
              <IconX size={14} />
            </ActionIcon>
          ) : null
        }
        value={value.search}
        onChange={(event) =>
          onChange({ ...value, search: event.currentTarget.value })
        }
        style={{ flex: "1 1 280px", minWidth: 220 }}
      />

      <MultiSelect
        placeholder={t("All actions")}
        data={eventData}
        value={value.events}
        onChange={(events) => onChange({ ...value, events })}
        clearable
        searchable
        hidePickedOptions
        w={220}
        comboboxProps={{ withinPortal: true }}
      />

      <Select
        placeholder={t("All resource types")}
        data={resourceData}
        value={value.resourceType}
        onChange={(resourceType) => onChange({ ...value, resourceType })}
        clearable
        searchable
        w={190}
      />

      <Select
        placeholder={t("All actors")}
        data={actorData}
        value={value.actorId}
        onChange={(actorId) => onChange({ ...value, actorId })}
        clearable
        searchable
        limit={50}
        w={210}
      />

      <Select
        placeholder={t("All spaces")}
        data={spaceData}
        value={value.spaceId}
        onChange={(spaceId) => onChange({ ...value, spaceId })}
        clearable
        searchable
        limit={50}
        w={180}
      />

      <Select
        data={[
          { value: "all", label: t("Any time") },
          { value: "24h", label: t("Last 24 hours") },
          { value: "7d", label: t("Last 7 days") },
          { value: "30d", label: t("Last 30 days") },
          { value: "90d", label: t("Last 90 days") },
          { value: "custom", label: t("Custom range") },
        ]}
        value={value.period}
        onChange={(period) => onChange(applyPeriod(value, period ?? "all"))}
        leftSection={<IconCalendar size={16} />}
        w={160}
        allowDeselect={false}
      />

      <Popover
        opened={advancedOpen}
        onChange={setAdvancedOpen}
        position="bottom-start"
        shadow="md"
        width={300}
        withArrow
      >
        <Popover.Target>
          <Tooltip label={t("More filters")}>
            <Button
              variant={activeFilterCount > 0 ? "light" : "default"}
              leftSection={<IconFilter size={16} />}
              onClick={() => setAdvancedOpen((opened) => !opened)}
            >
              {activeFilterCount > 0
                ? t("Filters ({{count}})", { count: activeFilterCount })
                : t("Filters")}
            </Button>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <MultiSelect
            label={t("Actor type")}
            data={Object.entries(actorTypeLabels).map(([value, label]) => ({
              value,
              label: t(label),
            }))}
            value={value.actorTypes}
            onChange={(actorTypes) => onChange({ ...value, actorTypes })}
            clearable
            mb="sm"
          />
          <TextInput
            label={t("IP address")}
            placeholder="203.0.113.10"
            value={value.ipAddress}
            onChange={(event) =>
              onChange({ ...value, ipAddress: event.currentTarget.value })
            }
            mb="sm"
          />
          <Group grow gap="xs">
            <TextInput
              label={t("From")}
              type="date"
              value={value.startDate ? value.startDate.slice(0, 10) : ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  startDate: event.currentTarget.value
                    ? `${event.currentTarget.value}T00:00:00.000Z`
                    : null,
                  period: "custom",
                })
              }
            />
            <TextInput
              label={t("To")}
              type="date"
              value={value.endDate ? value.endDate.slice(0, 10) : ""}
              onChange={(event) =>
                onChange({
                  ...value,
                  endDate: event.currentTarget.value
                    ? `${event.currentTarget.value}T23:59:59.999Z`
                    : null,
                  period: "custom",
                })
              }
            />
          </Group>
          <Group justify="flex-end" mt="md">
            <Button
              variant="default"
              size="xs"
              leftSection={<IconFilterOff size={14} />}
              onClick={() => {
                onReset();
                setAdvancedOpen(false);
              }}
            >
              {t("Reset filters")}
            </Button>
          </Group>
        </Popover.Dropdown>
      </Popover>

      {activeFilterCount > 0 && (
        <Tooltip label={t("Clear all filters")}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            onClick={onReset}
            aria-label={t("Clear all filters")}
          >
            <IconFilterOff size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
