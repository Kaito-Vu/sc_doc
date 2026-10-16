// docx requires a 6-digit hex color (no leading #). Convert #rgb, #rrggbb,
// and rgb()/rgba() inputs to 6-digit hex; return undefined for anything else
// (named colors, hsl, etc.) so the caller omits the color rather than letting
// docx throw "Invalid hex value".
export function toDocxColor(input?: string): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  const hex = value.startsWith('#') ? value.slice(1) : value;
  if (/^[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return hex
      .split('')
      .map((ch) => ch + ch)
      .join('');
  }
  const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const channel = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10)))
        .toString(16)
        .padStart(2, '0');
    return channel(rgb[1]) + channel(rgb[2]) + channel(rgb[3]);
  }
  return undefined;
}
