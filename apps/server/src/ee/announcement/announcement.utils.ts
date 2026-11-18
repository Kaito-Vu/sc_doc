import { BadRequestException } from '@nestjs/common';

export const ANNOUNCEMENT_TYPES = [
  'info',
  'success',
  'warning',
  'critical',
  'neutral',
] as const;
export const ANNOUNCEMENT_COLORS = [
  'blue',
  'green',
  'yellow',
  'red',
  'purple',
  'gray',
  'black',
] as const;
// 'members' = signed-in users only, 'everyone' = also the public (logged-out) surface
export const ANNOUNCEMENT_AUDIENCES = ['members', 'everyone'] as const;
export const ANNOUNCEMENT_MAX_TITLE_LENGTH = 100;
export const ANNOUNCEMENT_MAX_TEXT_LENGTH = 500;
export const ANNOUNCEMENT_MAX_VISIBLE = 1;

export type AnnouncementStatus = 'scheduled' | 'active' | 'archived';

const SAFE_LINK_PROTOCOLS = ['https:', 'http:', 'mailto:'];
const UNSAFE_CHARACTERS = /[\p{Cc}\p{Cs}]/u;
const SIMPLE_MARKS = ['bold', 'italic', 'underline'];

// mirrors the client's isSafeAnnouncementHref
export function isSafeHref(href: unknown): boolean {
  if (typeof href !== 'string') return false;
  const value = href.trim();
  if (UNSAFE_CHARACTERS.test(value)) return false;
  if (value.startsWith('/')) {
    return !value.startsWith('//') && !value.startsWith('/\\');
  }
  try {
    return SAFE_LINK_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function extractText(content: any): string {
  return (content?.content ?? [])
    .flatMap((p: any) => p?.content ?? [])
    .map((n: any) => n.text ?? '')
    .join('');
}

/**
 * Accepts only the editor shape the client produces: a doc with exactly one
 * paragraph of text nodes carrying bold/italic/underline/link marks.
 * Returns the plain text.
 */
export function validateContent(content: any): string {
  const bad = (msg: string) =>
    new BadRequestException(`Invalid content: ${msg}`);
  if (content?.type !== 'doc' || !Array.isArray(content.content)) {
    throw bad('expected a doc');
  }
  if (
    content.content.length !== 1 ||
    content.content[0]?.type !== 'paragraph'
  ) {
    throw bad('expected a single paragraph');
  }
  const nodes = content.content[0].content ?? [];
  if (!Array.isArray(nodes)) throw bad('expected text nodes');
  for (const node of nodes) {
    if (node?.type !== 'text' || typeof node.text !== 'string') {
      throw bad('only text nodes are allowed');
    }
    for (const mark of node.marks ?? []) {
      if (mark?.type === 'link') {
        if (!isSafeHref(mark.attrs?.href)) throw bad('unsafe link');
      } else if (!SIMPLE_MARKS.includes(mark?.type)) {
        throw bad('unsupported mark');
      }
    }
  }
  return extractText(content);
}

type Timed = { archivedAt: Date | null; startsAt: Date; endsAt: Date | null };

// An announcement whose end time has passed counts as archived (the client does the same)
export function deriveStatus(a: Timed, now: Date): AnnouncementStatus {
  if (a.archivedAt || (a.endsAt && a.endsAt <= now)) return 'archived';
  return a.startsAt > now ? 'scheduled' : 'active';
}

export function isVisibleAt(a: Timed, now: Date): boolean {
  return deriveStatus(a, now) === 'active';
}

export type Window = { startsAt: Date; endsAt: Date | null };

export type Takeover = { id: string; title: string; at: string };

/**
 * Splits announcements overlapping the candidate window into those the
 * candidate takes over from (they started earlier) and those that take over
 * from it (they start later). Equal start times cannot be resolved: clashes.
 */
export function classifyOverlaps(
  candidate: Window,
  others: Array<Window & { id: string; title: string }>,
) {
  const replaces: Takeover[] = [];
  const replacedBy: Takeover[] = [];
  const clashes: Array<{ id: string; title: string }> = [];
  for (const o of others) {
    const diff = o.startsAt.getTime() - candidate.startsAt.getTime();
    if (diff < 0) {
      replaces.push({
        id: o.id,
        title: o.title,
        at: candidate.startsAt.toISOString(),
      });
    } else if (diff > 0) {
      replacedBy.push({
        id: o.id,
        title: o.title,
        at: o.startsAt.toISOString(),
      });
    } else {
      clashes.push({ id: o.id, title: o.title });
    }
  }
  return { replaces, replacedBy, clashes };
}
