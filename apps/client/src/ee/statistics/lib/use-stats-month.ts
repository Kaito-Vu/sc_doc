import { useState } from "react";
import { localMonthKey } from "@/ee/statistics/lib/month";

/**
 * Selected stats month. Until the user navigates, it follows the server's `currentMonth`
 * (stats time zone); local time is only a fallback while that has not loaded.
 */
export function useStatsMonth(serverCurrentMonth?: string) {
  const [picked, setPicked] = useState<string | null>(null);
  const current = serverCurrentMonth ?? localMonthKey();
  return { month: picked ?? current, currentMonth: current, setMonth: setPicked };
}
