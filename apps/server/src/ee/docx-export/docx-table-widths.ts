const emptyCell = (type: string) => ({
  type,
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [{ type: 'paragraph' }],
});

/**
 * Walks the table grid (colspan/rowspan aware), calling `onCell(row, cell, col)`
 * for every cell and `onRowEnd(row, nextFreeCol, isFree)` after each row.
 */
function walkGrid(
  rows: any[],
  onCell: (r: number, cell: any, col: number) => void,
  onRowEnd: (r: number, col: number, isFree: (c: number) => boolean) => void,
) {
  const spanLeft: number[] = [];
  rows.forEach((row, r) => {
    let col = 0;
    for (const cell of row.content ?? []) {
      while ((spanLeft[col] ?? 0) > 0) col++;
      const cs = cell.attrs?.colspan ?? 1;
      const rs = cell.attrs?.rowspan ?? 1;
      onCell(r, cell, col);
      if (rs > 1) for (let i = 0; i < cs; i++) spanLeft[col + i] = rs;
      col += cs;
    }
    onRowEnd(r, col, (c) => !(spanLeft[c] > 0));
    for (let i = 0; i < spanLeft.length; i++)
      if (spanLeft[i] > 0) spanLeft[i]--;
  });
}

/**
 * Two fixes so the DOCX table matches what the editor shows:
 * 1. Short rows are padded with empty cells. The editor repairs ragged tables on
 *    load, but stored content may still lack those cells, so they would vanish.
 * 2. editor-ext sizes columns from the FIRST row's `colwidth` only, while a column
 *    resize may be stored on other rows' cells. Widths are collected from every row
 *    and written onto the first row.
 */
export function withColumnWidths(table: any): any {
  const rows: any[] = table.content ?? [];
  if (!rows.length) return table;

  // Pass 1: grid width and per-column widths.
  let gridWidth = 0;
  const widths: number[] = [];
  walkGrid(
    rows,
    (_r, cell, col) => {
      const cs = cell.attrs?.colspan ?? 1;
      gridWidth = Math.max(gridWidth, col + cs);
      for (let i = 0; i < cs; i++) {
        const w = cell.attrs?.colwidth?.[i];
        if (w > 0 && !(widths[col + i] > 0)) widths[col + i] = w;
      }
    },
    () => undefined,
  );

  // Pass 2: pad short rows.
  const padded = rows.map((row) => ({
    ...row,
    content: [...(row.content ?? [])],
  }));
  walkGrid(
    rows,
    () => undefined,
    (r, col, isFree) => {
      const type = rows[r].content?.at(-1)?.type ?? 'tableCell';
      for (let c = col; c < gridWidth; c++) {
        if (isFree(c)) padded[r].content.push(emptyCell(type));
      }
    },
  );

  // Pass 3: write the collected widths onto the first row.
  if (widths.some((w) => w > 0)) {
    const starts: number[] = [];
    walkGrid(
      padded,
      (r, _cell, col) => {
        if (r === 0) starts.push(col);
      },
      () => undefined,
    );
    padded[0].content = padded[0].content.map((cell: any, i: number) => {
      const cs = cell.attrs?.colspan ?? 1;
      const colwidth = Array.from(
        { length: cs },
        (_, k) => widths[starts[i] + k] ?? 0,
      );
      return { ...cell, attrs: { ...cell.attrs, colwidth } };
    });
  }
  return { ...table, content: padded };
}
