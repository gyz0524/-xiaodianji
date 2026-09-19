export type ShelfLifeUnit = 'days' | 'months' | 'years';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function calendarDate(value: string): { year: number; month: number; day: number; time: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`非法日期：${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`非法日期：${value}`);
  }
  return { year, month, day, time: date.getTime() };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isCalendarDate(value: string): boolean {
  try {
    calendarDate(value);
    return true;
  } catch {
    return false;
  }
}

export function today(): string {
  const now = new Date();
  return formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function daysUntil(date: string, from = today()): number {
  return Math.round((calendarDate(date).time - calendarDate(from).time) / DAY_MS);
}

export function addShelfLife(date: string, amount: number, unit: ShelfLifeUnit): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('保质期数量必须是非负整数');
  const source = calendarDate(date);

  if (unit === 'days') {
    const result = new Date(source.time + amount * DAY_MS);
    return formatDate(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
  }

  if (unit === 'months') {
    const monthIndex = source.year * 12 + source.month - 1 + amount;
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return formatDate(year, month, Math.min(source.day, daysInMonth(year, month)));
  }

  if (unit === 'years') {
    const year = source.year + amount;
    return formatDate(year, source.month, Math.min(source.day, daysInMonth(year, source.month)));
  }

  throw new Error('不支持的保质期单位');
}
