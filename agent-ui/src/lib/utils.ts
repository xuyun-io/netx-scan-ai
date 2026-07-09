import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTimeWithTimezone(value?: string | Date): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const datePart = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);

  const timePart = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const offsetHours = Math.floor(Math.abs(offset) / 60);
  const offsetMinutes = Math.abs(offset) % 60;
  const tzPart = `(UTC${sign}${offsetHours}:${String(offsetMinutes).padStart(2, '0')})`;

  return `${datePart} ${timePart} ${tzPart}`;
}

export function formatTime(value?: string) {
  return formatDateTimeWithTimezone(value);
}

export function formatShortTime(value?: string) {
  return formatDateTimeWithTimezone(value);
}

export function humanizeToken(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || '-';
}

export function formatPriority(priority?: string) {
  return humanizeToken(priority || 'normal');
}
