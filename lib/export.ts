import type { EarlyUser } from './types';

function escapeCsvValue(value: string | null | undefined): string {
  const raw = value ?? '';
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function usersToCsv(users: EarlyUser[]): string {
  const headers = [
    'Название / Имя', 'Сегмент', 'Город', 'Отрасль', 'Контакт', 'Условия', 'Этап', 'Следующий шаг',
    'Дата следующего контакта', 'Приоритет', 'Источник', 'Комментарий', 'Создан', 'Обновлен',
  ];

  const rows = users.map((user) => [
    user.name,
    user.profile_role === 'map' ? 'Пользователь карты' : 'Пользователь CRM',
    user.city,
    user.industry,
    user.contact,
    user.terms,
    user.stage,
    user.next_step,
    user.next_contact_date,
    user.priority,
    user.source,
    user.notes,
    user.created_at,
    user.updated_at,
  ].map(escapeCsvValue).join(','));

  return [headers.map(escapeCsvValue).join(','), ...rows].join('\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
