import { STAGES } from './constants';
import type { EarlyUser, Filters, Stage } from './types';

export function isToday(date: string | null, now = new Date()): boolean {
  if (!date) return false;
  const target = new Date(`${date}T00:00:00`);
  return target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
}

export function isOverdue(date: string | null, now = new Date()): boolean {
  if (!date) return false;
  const target = new Date(`${date}T23:59:59`);
  return target.getTime() < now.getTime();
}

export function filterUsers(users: EarlyUser[], filters: Filters): EarlyUser[] {
  const search = filters.search.trim().toLowerCase();

  return users.filter((user) => {
    if (filters.onlyToday && !isToday(user.next_contact_date)) return false;
    if (filters.city && user.city !== filters.city) return false;
    if (filters.industry && user.industry !== filters.industry) return false;
    if (filters.terms && user.terms !== filters.terms) return false;
    if (filters.stage && user.stage !== filters.stage) return false;
    if (filters.priority && user.priority !== filters.priority) return false;

    if (!search) return true;
    const haystack = [
      user.name,
      user.city,
      user.industry,
      user.contact ?? '',
      user.terms,
      user.stage,
      user.next_step ?? '',
      user.notes ?? '',
      user.source ?? '',
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())))).sort((a, b) => a.localeCompare(b, 'ru'));
}

export function countBy<T extends string>(users: EarlyUser[], selector: (user: EarlyUser) => T): Record<T, number> {
  return users.reduce((acc, user) => {
    const key = selector(user);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<T, number>);
}

export function stageCounts(users: EarlyUser[]): Record<Stage, number> {
  const base = STAGES.reduce((acc, stage) => {
    acc[stage] = 0;
    return acc;
  }, {} as Record<Stage, number>);

  for (const user of users) {
    base[user.stage] += 1;
  }

  return base;
}

export function topCounts(users: EarlyUser[], field: 'city' | 'industry' | 'terms', limit = 6) {
  const counts = countBy(users, (user) => user[field]);
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'))
    .slice(0, limit);
}

export function dashboardMetrics(users: EarlyUser[]) {
  const active = users.filter((user) => !user.is_archived);
  return {
    total: active.length,
    free: active.filter((user) => user.terms.toLowerCase().includes('бесплат')).length,
    discounted: active.filter((user) => user.terms.includes('%') || user.terms.toLowerCase().includes('понижен')).length,
    connected: active.filter((user) => ['Подключён', 'Активно пользуется'].includes(user.stage)).length,
    today: active.filter((user) => isToday(user.next_contact_date)).length,
    overdue: active.filter((user) => isOverdue(user.next_contact_date)).length,
  };
}
