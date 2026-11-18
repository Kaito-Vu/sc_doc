// Pure parsing of the command palette "spaces mode" prefix ("s " + search term).
export function parseSpacesMode(query: string): {
  spacesMode: boolean;
  term: string;
} {
  const m = /^s\s(.*)$/is.exec(query);
  return m
    ? { spacesMode: true, term: m[1].trim() }
    : { spacesMode: false, term: query.trim() };
}
