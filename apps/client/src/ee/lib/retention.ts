export type RetentionUnit = "days" | "months" | "years";

/** Picks the largest unit that divides `days` evenly (365-day years, 30-day months). */
export function daysToRetention(days: number): {
  amount: number;
  unit: RetentionUnit;
} {
  if (days >= 365 && days % 365 === 0) {
    return { amount: days / 365, unit: "years" };
  }
  if (days >= 30 && days % 30 === 0) {
    return { amount: days / 30, unit: "months" };
  }
  return { amount: days, unit: "days" };
}

export function retentionToDays(amount: number, unit: RetentionUnit): number {
  if (unit === "years") return amount * 365;
  if (unit === "months") return amount * 30;
  return amount;
}
