// Leading characters that make spreadsheet apps evaluate a cell as a formula
// (CSV/formula injection, OWASP). Such cells get a leading apostrophe.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function toCsvCell(value: unknown): string {
  let text =
    value == null
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  // Numbers (e.g. -5) are safe and must stay numeric.
  if (typeof value === 'string' && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(
  properties: Array<{ id: string; name: string }>,
  rows: Array<{ cells: unknown }>,
): string {
  const lines = [properties.map((p) => toCsvCell(p.name)).join(',')];
  for (const row of rows) {
    const cells = (row.cells ?? {}) as Record<string, unknown>;
    lines.push(properties.map((p) => toCsvCell(cells[p.id])).join(','));
  }
  return lines.join('\n');
}
