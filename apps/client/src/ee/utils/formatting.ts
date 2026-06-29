/**
 * Formatting utilities for Detail Info Panel
 */

/**
 * Format a date to a readable string
 * @example formatDate(new Date('2026-06-09')) => 'Jun 09, 2026'
 */
export const formatDate = (date: Date | string): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(dateObj);
};

/**
 * Format a date to a full datetime string
 * @example formatDateTime(new Date()) => 'Jun 09, 2026, 9:18 PM'
 */
export const formatDateTime = (date: Date | string): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(dateObj);
};

/**
 * Format a date as relative time
 * @example formatRelativeTime(new Date(Date.now() - 30000)) => '30 seconds ago'
 */
export const formatRelativeTime = (date: Date | string): string => {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffMonths / 12);

  if (diffSeconds < 60) {
    return diffSeconds === 0 ? 'just now' : `${diffSeconds} seconds ago`;
  } else if (diffMinutes < 60) {
    return diffMinutes === 1 ? '1 minute ago' : `${diffMinutes} minutes ago`;
  } else if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  } else if (diffDays < 30) {
    return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  } else if (diffMonths < 12) {
    return diffMonths === 1 ? '1 month ago' : `${diffMonths} months ago`;
  } else {
    return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
  }
};

/**
 * Format a number with thousand separators
 * @example formatNumber(1000) => '1,000'
 */
export const formatNumber = (num: number): string => {
  if (typeof num !== 'number') return '';

  return new Intl.NumberFormat('en-US').format(num);
};

/**
 * Truncate text to a maximum length
 * @example truncate('Hello World', 5) => 'Hello...'
 */
export const truncate = (text: string, length: number): string => {
  if (!text || text.length <= length) return text;

  return `${text.substring(0, length)}...`;
};
