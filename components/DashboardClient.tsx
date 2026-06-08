'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { CONDITIONS, DEFAULT_CITIES, DEFAULT_INDUSTRIES, PRIORITIES, STAGES } from '@/lib/constants';
import { demoQuestions, demoUsers } from '@/lib/demo-data';
import { downloadTextFile, usersToCsv } from '@/lib/export';
import { dashboardMetrics, filterUsers, isOverdue, isToday, stageCounts, topCounts, uniqueSorted } from '@/lib/stats';
import type {
  EarlyUser,
  EarlyUserEvent,
  EarlyUserInput,
  Filters,
  MarketingQuestion,
  MarketingQuestionInput,
  Priority,
  QuestionTargetRole,
  QuestionType,
  Stage,
  UserRole,
  UserAnswer,
} from '@/lib/types';
import { createClient } from '@/lib/supabase/browser';

type Props = {
  initialUsers: EarlyUser[];
  initialQuestions: MarketingQuestion[];
  initialAnswers: UserAnswer[];
  initialError: string | null;
};

type ViewMode = 'growth' | 'geo' | 'table' | 'stages' | 'analytics' | 'questions';
type SortMode = 'score' | 'due' | 'updated' | 'name';
type FocusPreset = 'all' | 'urgent' | 'hot' | 'needsInterview' | 'connected';
type MarketingPillarKey =
  | 'audience'
  | 'competitors'
  | 'packaging'
  | 'positioning'
  | 'offer'
  | 'content'
  | 'ads'
  | 'sales'
  | 'analytics'
  | 'retention'
  | 'reputation'
  | 'brand';
type MarketingWorkStatus = 'todo' | 'doing' | 'done';
type MarketingWorkPriority = 'low' | 'medium' | 'high';
type MarketingWorkItem = {
  id: string;
  pillar: MarketingPillarKey;
  title: string;
  status: MarketingWorkStatus;
  priority: MarketingWorkPriority;
  dueDate: string;
};
type MarketingPillar = {
  key: MarketingPillarKey;
  label: string;
  phase: string;
  description: string;
  output: string;
  metrics: string[];
  questions: string[];
  dependsOn: MarketingPillarKey[];
  next: MarketingPillarKey[];
};
type MarketingGoalPriority = 'critical' | 'high' | 'medium';
type MarketingGoalStatus = 'active' | 'paused' | 'done';
type MarketingGoal = {
  id: string;
  pillar: MarketingPillarKey;
  title: string;
  description: string;
  current: number;
  target: number;
  unit: string;
  deadline: string;
  priority: MarketingGoalPriority;
  status: MarketingGoalStatus;
  planText: string;
  achievementsText: string;
  createdAt: string;
  updatedAt: string;
};
type MarketingGoalInput = Omit<MarketingGoal, 'id' | 'createdAt' | 'updatedAt'>;
type MarketingPillarNote = {
  pillar: MarketingPillarKey;
  summary: string;
  output: string;
  questionsText: string;
  metricsText: string;
  updatedAt: string;
};
type CityMapStatus = 'none' | 'watch' | 'target' | 'active' | 'priority';
type CityMapMark = {
  city: string;
  status: CityMapStatus;
  note: string;
  updatedAt: string;
};
type BelarusCityPoint = {
  city: string;
  region: string;
  x: number;
  y: number;
};
type SavedView = {
  id: string;
  name: string;
  filters: Filters;
  userRoleTab: 'all' | UserRole;
  questionRoleTab: 'all' | UserRole;
  focusPreset?: FocusPreset;
  sortMode?: SortMode;
};

type ContactQueueItem = {
  user: EarlyUser;
  dayOffset: number;
};

const viewModeLabel: Record<ViewMode, string> = {
  growth: 'План роста',
  geo: 'Карта РБ',
  table: 'Пользователи',
  stages: 'Воронка',
  analytics: 'Аналитика',
  questions: 'Интервью',
};

const viewModeDescription: Record<ViewMode, string> = {
  growth: 'Цели, планы, достижения и маркетинговые направления в одном рабочем разделе',
  geo: 'Интерактивная карта Беларуси: загрузка по городам, zoom и ручные пометки',
  table: 'Отслеживание первых клиентов перед запуском компании',
  stages: 'Доска этапов по всей маркетинговой воронке',
  analytics: 'Метрики по каналам, сегментам и качеству интервью',
  questions: 'Единый список вопросов, которые нужно узнать у каждого клиента',
};

const navigationItems: Array<{ mode: ViewMode; label: string; icon: string }> = [
  { mode: 'growth', label: 'План роста', icon: '00' },
  { mode: 'geo', label: 'Карта РБ', icon: '01' },
  { mode: 'table', label: 'Пользователи', icon: '02' },
  { mode: 'questions', label: 'Интервью', icon: '03' },
  { mode: 'stages', label: 'Воронка', icon: '04' },
  { mode: 'analytics', label: 'Аналитика', icon: '05' },
];

const sortModeLabel: Record<SortMode, string> = {
  score: 'Сначала высокий score',
  due: 'Сначала ближайший контакт',
  updated: 'Сначала обновленные',
  name: 'По названию',
};

const focusPresetLabel: Record<FocusPreset, string> = {
  all: 'Все',
  urgent: 'Срочные',
  hot: 'Горячие',
  needsInterview: 'Без интервью',
  connected: 'Подключены',
};

const baseFilters: Filters = {
  search: '',
  profileRole: '',
  city: '',
  industry: '',
  terms: '',
  stage: '',
  priority: '',
  onlyToday: false,
};

const marketingPillars: MarketingPillar[] = [
  {
    key: 'audience',
    label: 'Изучение аудитории',
    phase: 'Исследование',
    description: 'Сегменты, роли покупателей, боли, Jobs To Be Done, критерии выбора и реальные формулировки клиентов.',
    output: 'ICP, сегменты, карта болей, список гипотез и интервью.',
    metrics: ['Количество интервью', 'Доля заполненных анкет', 'Повторяемость болей'],
    questions: ['Кто покупает и кто влияет?', 'Какая боль повторяется чаще всего?', 'Почему решение нужно сейчас?'],
    dependsOn: [],
    next: ['positioning', 'offer', 'content'],
  },
  {
    key: 'competitors',
    label: 'Анализ конкурентов',
    phase: 'Исследование',
    description: 'Прямые и косвенные альтернативы, цены, обещания, каналы, слабые места и причины переключения.',
    output: 'Матрица конкурентов, отличия, антиофферы и аргументы продаж.',
    metrics: ['Заполненные конкуренты', 'Найденные отличия', 'Проверенные возражения'],
    questions: ['С чем нас сравнивают?', 'Где конкуренты сильнее?', 'Что мы делаем проще или выгоднее?'],
    dependsOn: ['audience'],
    next: ['positioning', 'packaging'],
  },
  {
    key: 'packaging',
    label: 'Упаковка продукта',
    phase: 'Стратегия',
    description: 'Название модулей, тарифы, лендинг, демо, кейсы, визуальная подача и понятная структура ценности.',
    output: 'Лендинг/презентация, тарифы, демо-сценарий, proof-блоки.',
    metrics: ['Готовые материалы', 'Конверсия демо', 'Понятность первого экрана'],
    questions: ['Что человек понимает за 10 секунд?', 'Какие доказательства доверия есть?', 'Какая версия продукта продается первой?'],
    dependsOn: ['audience', 'competitors', 'positioning'],
    next: ['offer', 'content', 'ads'],
  },
  {
    key: 'positioning',
    label: 'Позиционирование',
    phase: 'Стратегия',
    description: 'Категория, главный контекст покупки, кому продукт подходит, кому не подходит и чем отличается.',
    output: 'Позиционирование, narrative, тезисы против конкурентов.',
    metrics: ['Ясность сегмента', 'Ясность отличия', 'Скорость объяснения'],
    questions: ['Для кого мы номер один?', 'Какую категорию занимаем?', 'Как одним предложением объяснить отличие?'],
    dependsOn: ['audience', 'competitors'],
    next: ['offer', 'brand', 'sales'],
  },
  {
    key: 'offer',
    label: 'Создание оффера',
    phase: 'Go-to-market',
    description: 'Конкретное обещание, условия входа, риск-реверс, дедлайн, бонусы и следующий шаг.',
    output: 'Оффер пилота, условия, CTA, скрипт объяснения ценности.',
    metrics: ['Acceptance rate', 'Количество горячих лидов', 'Доля отказов по цене'],
    questions: ['Что получает клиент и когда?', 'Почему предложение выгодно сейчас?', 'Как снимаем риск?'],
    dependsOn: ['audience', 'positioning', 'packaging'],
    next: ['ads', 'sales', 'content'],
  },
  {
    key: 'content',
    label: 'Контент',
    phase: 'Go-to-market',
    description: 'Темы, форматы, контент-матрица, доказательства, кейсы, экспертность и прогрев спроса.',
    output: 'Контент-план, рубрики, библиотека сообщений и proof-посты.',
    metrics: ['Публикации', 'Вовлеченность', 'Лиды из контента'],
    questions: ['Какие боли объясняем?', 'Какие кейсы показываем?', 'Что ведет к заявке?'],
    dependsOn: ['audience', 'positioning', 'offer'],
    next: ['ads', 'reputation', 'brand'],
  },
  {
    key: 'ads',
    label: 'Реклама',
    phase: 'Go-to-market',
    description: 'Каналы, гипотезы, креативы, аудитории, бюджеты, UTM и связь с CRM.',
    output: 'Медиаплан, креативы, гипотезы, правила тестов и бюджет.',
    metrics: ['CPL', 'CAC', 'Конверсия в разговор', 'ROMI'],
    questions: ['Кого таргетируем?', 'Какая гипотеза тестируется?', 'Куда попадает лид после клика?'],
    dependsOn: ['offer', 'content', 'analytics'],
    next: ['sales', 'analytics'],
  },
  {
    key: 'sales',
    label: 'Продажи',
    phase: 'Доход',
    description: 'Воронка, квалификация, скрипты, обработка возражений, следующий шаг и дисциплина касаний.',
    output: 'Pipeline, скрипт, причины отказа, правила follow-up.',
    metrics: ['Конверсия этапов', 'Скорость ответа', 'Подключенные клиенты'],
    questions: ['Какой следующий шаг у каждого лида?', 'Где теряются сделки?', 'Какие возражения повторяются?'],
    dependsOn: ['offer', 'positioning', 'ads'],
    next: ['retention', 'analytics', 'reputation'],
  },
  {
    key: 'analytics',
    label: 'Аналитика',
    phase: 'Управление',
    description: 'Единые метрики, дашборды, источники, конверсии, cohort-view и решения на основе данных.',
    output: 'North Star, KPI, dashboard, правила еженедельного анализа.',
    metrics: ['Заполненность источников', 'Конверсия', 'Retention', 'ROMI'],
    questions: ['Какая метрика главная?', 'Какие решения принимаем каждую неделю?', 'Где нет данных?'],
    dependsOn: ['audience'],
    next: ['ads', 'sales', 'retention'],
  },
  {
    key: 'retention',
    label: 'Удержание клиентов',
    phase: 'Доход',
    description: 'Onboarding, активация, причины ухода, повторная ценность, регулярные касания и health score.',
    output: 'Onboarding-путь, чек-лист активации, причины churn, план повторных касаний.',
    metrics: ['Activation rate', 'Повторные действия', 'Churn risk', 'NPS'],
    questions: ['Что считается активацией?', 'Где клиент застревает?', 'Как возвращаем ценность через 7/30 дней?'],
    dependsOn: ['sales', 'analytics'],
    next: ['reputation', 'brand'],
  },
  {
    key: 'reputation',
    label: 'Работа с репутацией',
    phase: 'Доверие',
    description: 'Отзывы, публичные кейсы, ответы на негатив, социальное доказательство и мониторинг упоминаний.',
    output: 'Банк отзывов, кейсы, правила ответа, список площадок.',
    metrics: ['Отзывы', 'Кейсы', 'Рейтинг', 'Скорость ответа'],
    questions: ['Где нас обсуждают?', 'Какие отзывы можно запросить?', 'Как отвечаем на негатив?'],
    dependsOn: ['sales', 'retention', 'content'],
    next: ['brand', 'content'],
  },
  {
    key: 'brand',
    label: 'Бренд',
    phase: 'Доверие',
    description: 'Смысл, тон общения, визуальная система, обещание бренда и последовательность во всех каналах.',
    output: 'Brand platform, tone of voice, визуальные правила, message house.',
    metrics: ['Узнаваемость', 'Consistency score', 'Доверие', 'Brand search'],
    questions: ['За что бренд должен запомниться?', 'Какой тон нельзя нарушать?', 'Как бренд поддерживает продажи?'],
    dependsOn: ['positioning', 'content', 'reputation'],
    next: ['content', 'retention'],
  },
];

const pillarByKey = marketingPillars.reduce((acc, pillar) => {
  acc[pillar.key] = pillar;
  return acc;
}, {} as Record<MarketingPillarKey, MarketingPillar>);

const marketingWorkSeed: MarketingWorkItem[] = [];
const marketingWorkStorageKey = 'pilotbase_marketing_work_v2';
const marketingGoalsStorageKey = 'pilotbase_marketing_goals_v2';
const marketingPillarNotesStorageKey = 'pilotbase_marketing_pillar_notes_v1';
const cityMapMarksStorageKey = 'pilotbase_city_map_marks_v1';

const workStatusLabel: Record<MarketingWorkStatus, string> = {
  todo: 'План',
  doing: 'В работе',
  done: 'Готово',
};

const workPriorityLabel: Record<MarketingWorkPriority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

const goalPriorityLabel: Record<MarketingGoalPriority, string> = {
  critical: 'Критично',
  high: 'Высокий',
  medium: 'Средний',
};

const goalStatusLabel: Record<MarketingGoalStatus, string> = {
  active: 'Активна',
  paused: 'Пауза',
  done: 'Достигнута',
};

const cityMapStatusLabel: Record<CityMapStatus, string> = {
  none: 'Без метки',
  watch: 'Наблюдать',
  target: 'Целевой город',
  active: 'В работе',
  priority: 'Приоритет',
};

const cityMapStatusOptions: CityMapStatus[] = ['none', 'watch', 'target', 'active', 'priority'];

const belarusCityPoints: BelarusCityPoint[] = [
  { city: 'Минск', region: 'Минская область', x: 50, y: 48 },
  { city: 'Гомель', region: 'Гомельская область', x: 78, y: 78 },
  { city: 'Брест', region: 'Брестская область', x: 17, y: 77 },
  { city: 'Гродно', region: 'Гродненская область', x: 18, y: 42 },
  { city: 'Витебск', region: 'Витебская область', x: 72, y: 22 },
  { city: 'Могилёв', region: 'Могилёвская область', x: 68, y: 53 },
  { city: 'Барановичи', region: 'Брестская область', x: 36, y: 61 },
  { city: 'Бобруйск', region: 'Могилёвская область', x: 59, y: 66 },
  { city: 'Пинск', region: 'Брестская область', x: 38, y: 85 },
  { city: 'Орша', region: 'Витебская область', x: 74, y: 39 },
];

const emptyGoalInput: MarketingGoalInput = {
  pillar: 'audience',
  title: '',
  description: '',
  current: 0,
  target: 100,
  unit: '%',
  deadline: '',
  priority: 'high',
  status: 'active',
  planText: '',
  achievementsText: '',
};

const emptyMarketingGoals: MarketingGoal[] = [];
const emptyMarketingPillarNotes: MarketingPillarNote[] = [];
const emptyCityMapMarks: CityMapMark[] = [];
const localStorageUpdateEventPrefix = 'pilotbase-local-storage';

type LocalStateUpdate<T> = T | ((current: T) => T);

function createStoredArrayReader<T>(key: string, fallback: T[]) {
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;

  return function readStoredArray() {
    if (typeof window === 'undefined') return fallback;

    const raw = window.localStorage.getItem(key);
    if (raw === cachedRaw) return cachedValue;

    cachedRaw = raw;
    if (!raw) {
      cachedValue = fallback;
      return cachedValue;
    }

    try {
      const parsed = JSON.parse(raw) as T[];
      cachedValue = Array.isArray(parsed) && parsed.length > 0 ? parsed : fallback;
    } catch {
      cachedValue = fallback;
    }
    return cachedValue;
  };
}

const readStoredMarketingWorkItems = createStoredArrayReader<MarketingWorkItem>(marketingWorkStorageKey, marketingWorkSeed);
const readStoredMarketingGoals = createStoredArrayReader<MarketingGoal>(marketingGoalsStorageKey, emptyMarketingGoals);
const readStoredMarketingPillarNotes = createStoredArrayReader<MarketingPillarNote>(marketingPillarNotesStorageKey, emptyMarketingPillarNotes);
const readStoredCityMapMarks = createStoredArrayReader<CityMapMark>(cityMapMarksStorageKey, emptyCityMapMarks);

function subscribeStorageKey(key: string, callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;

  const customEventName = `${localStorageUpdateEventPrefix}:${key}`;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === key) callback();
  };
  const handleCustomUpdate = () => callback();

  window.addEventListener('storage', handleStorage);
  window.addEventListener(customEventName, handleCustomUpdate);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(customEventName, handleCustomUpdate);
  };
}

function writeStoredArray<T>(key: string, value: T[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(`${localStorageUpdateEventPrefix}:${key}`));
}

function resolveLocalStateUpdate<T>(update: LocalStateUpdate<T>, current: T) {
  return typeof update === 'function' ? (update as (value: T) => T)(current) : update;
}

const emptyInput: EarlyUserInput = {
  profile_role: 'crm',
  name: '',
  city: 'Минск',
  industry: 'Барбершоп',
  contact: '',
  terms: 'Бесплатно 1 месяц',
  stage: 'Найден',
  next_step: '',
  next_contact_date: '',
  priority: 'medium',
  source: '',
  notes: '',
  is_archived: false,
};

const emptyQuestionInput: MarketingQuestionInput = {
  target_role: 'all',
  text: '',
  category: 'Общее',
  type: 'long_text',
  optionsText: '',
  is_required: false,
  is_active: true,
  sort_order: 1,
};

const priorityLabel: Record<Priority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

const priorityWeight: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const questionTypeLabel: Record<QuestionType, string> = {
  short_text: 'Короткий ответ',
  long_text: 'Развёрнутый ответ',
  number: 'Число',
  yes_no: 'Да / Нет',
  single_choice: 'Выбор варианта',
};

const userRoleLabel: Record<UserRole, string> = {
  map: 'Пользователи карты',
  crm: 'Пользователи CRM',
};

const questionRoleLabel: Record<QuestionTargetRole, string> = {
  all: 'Для всех',
  map: 'Для карты',
  crm: 'Для CRM',
};

const roleTabs: Array<{ value: 'all' | UserRole; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'map', label: 'Карта' },
  { value: 'crm', label: 'CRM' },
];

const savedViewsStorageKey = 'pilotbase_saved_views_v1';

function normalizeUserRole(value: string | null | undefined): UserRole {
  return value === 'map' ? 'map' : 'crm';
}

function normalizeQuestionRole(value: string | null | undefined): QuestionTargetRole {
  if (value === 'map' || value === 'crm') return value;
  return 'all';
}

function sanitizeUser(user: EarlyUser): EarlyUser {
  return { ...user, profile_role: normalizeUserRole((user as { profile_role?: string | null }).profile_role) };
}

function sanitizeQuestion(question: MarketingQuestion): MarketingQuestion {
  return { ...question, target_role: normalizeQuestionRole((question as { target_role?: string | null }).target_role) };
}

function normalizeInput(input: EarlyUserInput) {
  return {
    ...input,
    profile_role: normalizeUserRole(input.profile_role),
    name: input.name.trim(),
    city: input.city.trim(),
    industry: input.industry.trim(),
    contact: input.contact.trim() || null,
    terms: input.terms.trim(),
    next_step: input.next_step.trim() || null,
    next_contact_date: input.next_contact_date || null,
    source: input.source.trim() || null,
    notes: input.notes.trim() || null,
  };
}

function normalizeQuestionInput(input: MarketingQuestionInput) {
  const options = input.optionsText
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter(Boolean);

  return {
    target_role: normalizeQuestionRole(input.target_role),
    text: input.text.trim(),
    category: input.category.trim() || 'Общее',
    type: input.type,
    options: input.type === 'single_choice' ? options : [],
    is_required: input.is_required,
    is_active: input.is_active,
    sort_order: Number.isFinite(input.sort_order) ? input.sort_order : 0,
  };
}

function formatDate(date: string | null) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU').format(new Date(`${date}T00:00:00`));
}

function formatDateTime(date: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysStamp(date: string | null, days: number) {
  const start = date ? new Date(`${date}T00:00:00`) : new Date();
  start.setDate(start.getDate() + days);
  return localDateStamp(start);
}

function dayOffsetFromToday(date: string | null, now = new Date()) {
  if (!date) return null;
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(`${date}T00:00:00`);
  return Math.round((target.getTime() - startToday.getTime()) / 86_400_000);
}

function queueLabel(offset: number) {
  if (offset < 0) return `Просрочено ${Math.abs(offset)} дн`;
  if (offset === 0) return 'Сегодня';
  if (offset === 1) return 'Завтра';
  return `Через ${offset} дн`;
}

function queueClass(offset: number) {
  if (offset < 0) return 'overdue';
  if (offset === 0) return 'today';
  return 'planned';
}

function classForStage(stage: string) {
  if (['Подключён', 'Активно пользуется'].includes(stage)) return 'green';
  if (['Интерес есть', 'Связались', 'Отправлены условия'].includes(stage)) return 'blue';
  if (['Согласован', 'Подключение', 'Переговоры'].includes(stage)) return 'purple';
  if (['Пауза'].includes(stage)) return 'orange';
  if (['Отказ', 'Архив'].includes(stage)) return 'red';
  return 'gray';
}

function classForTerms(terms: string) {
  const lower = terms.toLowerCase();
  if (lower.includes('бесплат')) return 'green';
  if (terms.includes('%') || lower.includes('понижен')) return 'orange';
  if (lower.includes('индивиду')) return 'purple';
  if (lower.includes('обыч')) return 'gray';
  return 'blue';
}

function leadScore(user: EarlyUser, answerCount: number, totalQuestions: number) {
  let score = 8;

  const stageWeights: Partial<Record<Stage, number>> = {
    Найден: 4,
    Связались: 7,
    'Интерес есть': 13,
    'Отправлены условия': 17,
    Переговоры: 21,
    Согласован: 24,
    Подключение: 26,
    Подключён: 28,
    'Активно пользуется': 24,
    Пауза: 3,
    Отказ: -18,
    Архив: -20,
  };

  score += stageWeights[user.stage] ?? 0;
  if (user.priority === 'high') score += 15;
  if (user.priority === 'medium') score += 8;
  if (user.priority === 'low') score += 3;
  if (user.next_contact_date && isOverdue(user.next_contact_date)) score -= 10;
  if (totalQuestions > 0) score += Math.round((answerCount / totalQuestions) * 25);
  if (user.terms.toLowerCase().includes('бесплат')) score += 5;
  if (user.is_archived || user.stage === 'Архив') score -= 20;

  return Math.max(0, Math.min(100, score));
}

function scoreClass(score: number) {
  if (score >= 75) return 'green';
  if (score >= 55) return 'blue';
  if (score >= 35) return 'orange';
  return 'red';
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function splitGoalLines(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatGoalValue(value: number, unit: string) {
  const formattedValue = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit.trim() === '%' ? `${formattedValue}%` : `${formattedValue} ${unit.trim() || 'ед.'}`;
}

function goalProgress(goal: Pick<MarketingGoal, 'current' | 'target' | 'status'>) {
  if (goal.status === 'done') return 100;
  if (goal.target <= 0) return 0;
  return clampScore((goal.current / goal.target) * 100);
}

export default function DashboardClient({ initialUsers, initialQuestions, initialAnswers, initialError }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const selectionRequestRef = useRef(0);
  const selectedUserIdRef = useRef<string | null>(null);
  const [users, setUsers] = useState<EarlyUser[]>(() => initialUsers.map(sanitizeUser));
  const [events, setEvents] = useState<EarlyUserEvent[]>([]);
  const [questions, setQuestions] = useState<MarketingQuestion[]>(() => initialQuestions.map(sanitizeQuestion));
  const [answers, setAnswers] = useState<UserAnswer[]>(initialAnswers);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<EarlyUser | null>(null);
  const [editing, setEditing] = useState<EarlyUser | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<MarketingQuestion | null>(null);
  const [form, setForm] = useState<EarlyUserInput>(emptyInput);
  const [questionForm, setQuestionForm] = useState<MarketingQuestionInput>(emptyQuestionInput);
  const [modalOpen, setModalOpen] = useState(false);
  const [questionModalOpen, setQuestionModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(initialError);
  const [viewMode, setViewMode] = useState<ViewMode>('growth');
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [focusPreset, setFocusPreset] = useState<FocusPreset>('all');
  const [userRoleTab, setUserRoleTab] = useState<'all' | UserRole>('all');
  const [questionRoleTab, setQuestionRoleTab] = useState<'all' | UserRole>('all');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkStage, setBulkStage] = useState<Stage>(STAGES[0]);
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(savedViewsStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedView[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [savedViewName, setSavedViewName] = useState('');
  const [filters, setFilters] = useState<Filters>(baseFilters);
  const [activePillar, setActivePillar] = useState<MarketingPillarKey>('audience');
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [newWorkPriority, setNewWorkPriority] = useState<MarketingWorkPriority>('medium');
  const [goalForm, setGoalForm] = useState<MarketingGoalInput>(() => ({ ...emptyGoalInput }));
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [selectedBelarusCity, setSelectedBelarusCity] = useState(belarusCityPoints[0].city);
  const [belarusMapZoom, setBelarusMapZoom] = useState(1);
  const [belarusMapOffset, setBelarusMapOffset] = useState({ x: 0, y: 0 });
  const marketingGoals = useSyncExternalStore(
    (callback) => subscribeStorageKey(marketingGoalsStorageKey, callback),
    readStoredMarketingGoals,
    () => emptyMarketingGoals,
  );
  const marketingWorkItems = useSyncExternalStore(
    (callback) => subscribeStorageKey(marketingWorkStorageKey, callback),
    readStoredMarketingWorkItems,
    () => marketingWorkSeed,
  );
  const marketingPillarNotes = useSyncExternalStore(
    (callback) => subscribeStorageKey(marketingPillarNotesStorageKey, callback),
    readStoredMarketingPillarNotes,
    () => emptyMarketingPillarNotes,
  );
  const cityMapMarks = useSyncExternalStore(
    (callback) => subscribeStorageKey(cityMapMarksStorageKey, callback),
    readStoredCityMapMarks,
    () => emptyCityMapMarks,
  );
  const setMarketingGoals = useCallback((update: LocalStateUpdate<MarketingGoal[]>) => {
    const next = resolveLocalStateUpdate(update, readStoredMarketingGoals());
    writeStoredArray(marketingGoalsStorageKey, next);
  }, []);
  const setMarketingWorkItems = useCallback((update: LocalStateUpdate<MarketingWorkItem[]>) => {
    const next = resolveLocalStateUpdate(update, readStoredMarketingWorkItems());
    writeStoredArray(marketingWorkStorageKey, next);
  }, []);
  const setMarketingPillarNotes = useCallback((update: LocalStateUpdate<MarketingPillarNote[]>) => {
    const next = resolveLocalStateUpdate(update, readStoredMarketingPillarNotes());
    writeStoredArray(marketingPillarNotesStorageKey, next);
  }, []);
  const setCityMapMarks = useCallback((update: LocalStateUpdate<CityMapMark[]>) => {
    const next = resolveLocalStateUpdate(update, readStoredCityMapMarks());
    writeStoredArray(cityMapMarksStorageKey, next);
  }, []);

  const questionsSorted = useMemo(
    () => [...questions].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [questions],
  );
  const questionOrderIndex = useMemo(
    () => new Map(questionsSorted.map((question, index) => [question.id, index])),
    [questionsSorted],
  );
  const activeQuestions = useMemo(() => questionsSorted.filter((question) => question.is_active), [questionsSorted]);
  const visibleQuestions = useMemo(() => {
    if (questionRoleTab === 'all') return questionsSorted;
    return questionsSorted.filter((question) => question.target_role === 'all' || question.target_role === questionRoleTab);
  }, [questionsSorted, questionRoleTab]);
  const visibleActiveQuestions = useMemo(() => visibleQuestions.filter((question) => question.is_active), [visibleQuestions]);
  const selectedQuestions = useMemo(() => {
    if (!selected) return visibleActiveQuestions;
    return activeQuestions.filter((question) => question.target_role === 'all' || question.target_role === selected.profile_role);
  }, [activeQuestions, selected, visibleActiveQuestions]);
  const questionCategories = useMemo(() => uniqueSorted(visibleQuestions.map((question) => question.category)), [visibleQuestions]);
  const activeQuestionIdsByRole = useMemo(() => ({
    map: new Set(activeQuestions.filter((question) => question.target_role === 'all' || question.target_role === 'map').map((question) => question.id)),
    crm: new Set(activeQuestions.filter((question) => question.target_role === 'all' || question.target_role === 'crm').map((question) => question.id)),
  }), [activeQuestions]);
  const answerStats = useMemo(() => {
    const byUserQuestion = new Map<string, string>();
    const byQuestion = new Map<string, number>();
    let totalAnswered = 0;

    for (const answer of answers) {
      const answerText = answer.answer_text ?? '';
      byUserQuestion.set(`${answer.early_user_id}:${answer.question_id}`, answerText);

      if (!answerText.trim()) continue;

      totalAnswered += 1;
      byQuestion.set(answer.question_id, (byQuestion.get(answer.question_id) ?? 0) + 1);
    }

    return { byUserQuestion, byQuestion, totalAnswered };
  }, [answers]);
  const getAnswer = useCallback((userId: string, questionId: string) => (
    answerStats.byUserQuestion.get(`${userId}:${questionId}`) ?? ''
  ), [answerStats]);
  const getAnswerCount = useCallback((userId: string, role: UserRole) => {
    const roleQuestionIds = activeQuestionIdsByRole[role];
    let filled = 0;
    roleQuestionIds.forEach((questionId) => {
      if (answerStats.byUserQuestion.get(`${userId}:${questionId}`)?.trim()) filled += 1;
    });
    return filled;
  }, [activeQuestionIdsByRole, answerStats]);
  const getTotalQuestionsForRole = useCallback((role: UserRole) => (
    activeQuestionIdsByRole[role].size
  ), [activeQuestionIdsByRole]);
  const getQuestionsForRole = useCallback((role: UserRole) => (
    activeQuestions.filter((question) => question.target_role === 'all' || question.target_role === role)
  ), [activeQuestions]);
  const getQuestionAnswerCount = useCallback((questionId: string) => (
    answerStats.byQuestion.get(questionId) ?? 0
  ), [answerStats]);
  const usersAfterFilters = useMemo(() => filterUsers(users, filters), [users, filters]);
  const roleFilteredUsers = useMemo(
    () => (userRoleTab === 'all' ? usersAfterFilters : usersAfterFilters.filter((user) => user.profile_role === userRoleTab)),
    [usersAfterFilters, userRoleTab],
  );
  const filteredUsers = useMemo(() => roleFilteredUsers.filter((user) => {
    if (focusPreset === 'urgent') return isToday(user.next_contact_date) || isOverdue(user.next_contact_date);
    if (focusPreset === 'hot') {
      const answered = getAnswerCount(user.id, user.profile_role);
      const total = getTotalQuestionsForRole(user.profile_role);
      return user.priority === 'high' || leadScore(user, answered, total) >= 70;
    }
    if (focusPreset === 'needsInterview') {
      const total = getTotalQuestionsForRole(user.profile_role);
      return total > 0 && getAnswerCount(user.id, user.profile_role) < total;
    }
    if (focusPreset === 'connected') return ['Подключён', 'Активно пользуется'].includes(user.stage);
    return true;
  }), [roleFilteredUsers, focusPreset, getAnswerCount, getTotalQuestionsForRole]);
  const sortedUsers = useMemo(() => [...filteredUsers].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name, 'ru');
    if (sortMode === 'updated') return b.updated_at.localeCompare(a.updated_at);
    if (sortMode === 'due') {
      const aDate = a.next_contact_date ?? '9999-12-31';
      const bDate = b.next_contact_date ?? '9999-12-31';
      return aDate.localeCompare(bDate) || priorityWeight[a.priority] - priorityWeight[b.priority];
    }

    const aScore = leadScore(a, getAnswerCount(a.id, a.profile_role), getTotalQuestionsForRole(a.profile_role));
    const bScore = leadScore(b, getAnswerCount(b.id, b.profile_role), getTotalQuestionsForRole(b.profile_role));
    return bScore - aScore || priorityWeight[a.priority] - priorityWeight[b.priority] || a.name.localeCompare(b.name, 'ru');
  }), [filteredUsers, sortMode, getAnswerCount, getTotalQuestionsForRole]);
  const metrics = useMemo(() => dashboardMetrics(filteredUsers), [filteredUsers]);
  const stages = useMemo(() => stageCounts(filteredUsers), [filteredUsers]);
  const cityStats = useMemo(() => topCounts(filteredUsers, 'city', 7), [filteredUsers]);
  const industryStats = useMemo(() => topCounts(filteredUsers, 'industry', 7), [filteredUsers]);
  const termsStats = useMemo(() => topCounts(filteredUsers, 'terms', 7), [filteredUsers]);
  const todayUsers = useMemo(
    () => filteredUsers
      .filter((user) => !user.is_archived && !['Отказ', 'Архив'].includes(user.stage))
      .filter((user) => isToday(user.next_contact_date) || isOverdue(user.next_contact_date))
      .sort((a, b) => (a.next_contact_date ?? '').localeCompare(b.next_contact_date ?? '')),
    [filteredUsers],
  );
  const contactQueue = useMemo(
    () => filteredUsers
      .filter((user) => !user.is_archived && !['Отказ', 'Архив'].includes(user.stage))
      .map((user) => {
        const dayOffset = dayOffsetFromToday(user.next_contact_date);
        if (dayOffset === null) return null;
        return { user, dayOffset };
      })
      .filter((item): item is ContactQueueItem => Boolean(item && item.dayOffset <= 7))
      .sort((a, b) => (
        a.dayOffset - b.dayOffset
        || priorityWeight[a.user.priority] - priorityWeight[b.user.priority]
        || a.user.name.localeCompare(b.user.name, 'ru')
      )),
    [filteredUsers],
  );
  const queueCounters = useMemo(() => ({
    overdue: contactQueue.filter((item) => item.dayOffset < 0).length,
    today: contactQueue.filter((item) => item.dayOffset === 0).length,
    upcoming: contactQueue.filter((item) => item.dayOffset > 0).length,
  }), [contactQueue]);

  const cityOptions = useMemo(() => uniqueSorted([...DEFAULT_CITIES, ...users.map((user) => user.city)]), [users]);
  const industryOptions = useMemo(() => uniqueSorted([...DEFAULT_INDUSTRIES, ...users.map((user) => user.industry)]), [users]);
  const termsOptions = useMemo(() => uniqueSorted([...CONDITIONS, ...users.map((user) => user.terms)]), [users]);
  const focusPresetItems = useMemo(() => {
    const countByPreset = (preset: FocusPreset) => roleFilteredUsers.filter((user) => {
      if (preset === 'urgent') return isToday(user.next_contact_date) || isOverdue(user.next_contact_date);
      if (preset === 'hot') {
        const answered = getAnswerCount(user.id, user.profile_role);
        const total = getTotalQuestionsForRole(user.profile_role);
        return user.priority === 'high' || leadScore(user, answered, total) >= 70;
      }
      if (preset === 'needsInterview') {
        const total = getTotalQuestionsForRole(user.profile_role);
        return total > 0 && getAnswerCount(user.id, user.profile_role) < total;
      }
      if (preset === 'connected') return ['Подключён', 'Активно пользуется'].includes(user.stage);
      return true;
    }).length;

    return (Object.keys(focusPresetLabel) as FocusPreset[]).map((preset) => ({
      value: preset,
      label: focusPresetLabel[preset],
      count: countByPreset(preset),
    }));
  }, [roleFilteredUsers, getAnswerCount, getTotalQuestionsForRole]);
  const filteredUserIds = useMemo(() => new Set(filteredUsers.map((user) => user.id)), [filteredUsers]);
  const selectedFilteredUserIds = useMemo(
    () => selectedUserIds.filter((id) => filteredUserIds.has(id)),
    [selectedUserIds, filteredUserIds],
  );
  const selectedUserSet = useMemo(() => new Set(selectedFilteredUserIds), [selectedFilteredUserIds]);
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedUserSet.has(user.id));
  const activeFilterCount = useMemo(() => (
    Object.values(filters).filter(Boolean).length
    + (userRoleTab === 'all' ? 0 : 1)
    + (focusPreset === 'all' ? 0 : 1)
  ), [filters, userRoleTab, focusPreset]);

  useEffect(() => {
    window.localStorage.setItem(savedViewsStorageKey, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (modalOpen) {
        setModalOpen(false);
        return;
      }
      if (questionModalOpen) {
        setQuestionModalOpen(false);
        return;
      }
      if (selected) {
        selectedUserIdRef.current = null;
        setSelected(null);
        setEvents([]);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, questionModalOpen, selected]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetWorkspaceFilters() {
    setFilters(baseFilters);
    setUserRoleTab('all');
    setFocusPreset('all');
    setSelectedUserIds([]);
  }

  function openCityUsers(city: string) {
    setFilters({ ...baseFilters, city });
    setUserRoleTab('all');
    setFocusPreset('all');
    setSelectedUserIds([]);
    setViewMode('table');
    setNotice(`Открыта база по городу: ${city}`);
  }

  function updateMarketingWorkItem(id: string, patch: Partial<MarketingWorkItem>) {
    setMarketingWorkItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateMarketingPillarNote(pillar: MarketingPillarKey, patch: Partial<Omit<MarketingPillarNote, 'pillar' | 'updatedAt'>>) {
    setMarketingPillarNotes((current) => {
      const existing = current.find((item) => item.pillar === pillar);
      const next: MarketingPillarNote = {
        pillar,
        summary: existing?.summary ?? '',
        output: existing?.output ?? '',
        questionsText: existing?.questionsText ?? '',
        metricsText: existing?.metricsText ?? '',
        updatedAt: new Date().toISOString(),
        ...patch,
      };
      const hasContent = [next.summary, next.output, next.questionsText, next.metricsText].some((value) => value.trim());
      if (!hasContent) return current.filter((item) => item.pillar !== pillar);
      if (existing) return current.map((item) => (item.pillar === pillar ? next : item));
      return [next, ...current];
    });
  }

  function updateCityMapMark(city: string, patch: Partial<Omit<CityMapMark, 'city' | 'updatedAt'>>) {
    setCityMapMarks((current) => {
      const existing = current.find((item) => item.city === city);
      const next: CityMapMark = {
        city,
        status: existing?.status ?? 'none',
        note: existing?.note ?? '',
        updatedAt: new Date().toISOString(),
        ...patch,
      };
      const hasContent = next.status !== 'none' || next.note.trim().length > 0;
      if (!hasContent) return current.filter((item) => item.city !== city);
      if (existing) return current.map((item) => (item.city === city ? next : item));
      return [next, ...current];
    });
  }

  function resetBelarusMapView() {
    setBelarusMapZoom(1);
    setBelarusMapOffset({ x: 0, y: 0 });
  }

  function changeBelarusMapZoom(delta: number) {
    setBelarusMapZoom((current) => Math.max(1, Math.min(2.8, Number((current + delta).toFixed(1)))));
  }

  function nudgeBelarusMap(dx: number, dy: number) {
    setBelarusMapOffset((current) => ({
      x: Math.max(-28, Math.min(28, current.x + dx)),
      y: Math.max(-24, Math.min(24, current.y + dy)),
    }));
  }

  function updateGoalForm<K extends keyof MarketingGoalInput>(key: K, value: MarketingGoalInput[K]) {
    setGoalForm((current) => ({ ...current, [key]: value }));
  }

  function resetGoalForm(pillar: MarketingPillarKey = activePillar) {
    setEditingGoalId(null);
    setGoalForm({ ...emptyGoalInput, pillar });
  }

  function saveMarketingGoal() {
    const title = goalForm.title.trim();
    if (!title) {
      setNotice('Укажи название цели.');
      return;
    }

    const target = Number.isFinite(goalForm.target) && goalForm.target > 0 ? goalForm.target : 0;
    if (target <= 0) {
      setNotice('Целевое значение должно быть больше нуля.');
      return;
    }

    const now = new Date().toISOString();
    const normalized: MarketingGoalInput = {
      ...goalForm,
      title,
      description: goalForm.description.trim(),
      current: Math.max(0, Number.isFinite(goalForm.current) ? goalForm.current : 0),
      target,
      unit: goalForm.unit.trim() || 'ед.',
      deadline: goalForm.deadline,
      planText: goalForm.planText.trim(),
      achievementsText: goalForm.achievementsText.trim(),
    };

    if (editingGoalId) {
      setMarketingGoals((current) => current.map((goal) => (
        goal.id === editingGoalId ? { ...goal, ...normalized, updatedAt: now } : goal
      )));
      setNotice(`Цель «${title}» обновлена.`);
    } else {
      setMarketingGoals((current) => [{
        ...normalized,
        id: `goal-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      }, ...current]);
      setNotice(`Цель «${title}» добавлена.`);
    }

    resetGoalForm();
  }

  function editMarketingGoal(goal: MarketingGoal) {
    setEditingGoalId(goal.id);
    setActivePillar(goal.pillar);
    setGoalForm({
      pillar: goal.pillar,
      title: goal.title,
      description: goal.description,
      current: goal.current,
      target: goal.target,
      unit: goal.unit,
      deadline: goal.deadline,
      priority: goal.priority,
      status: goal.status,
      planText: goal.planText,
      achievementsText: goal.achievementsText,
    });
  }

  function completeMarketingGoal(id: string) {
    setMarketingGoals((current) => current.map((goal) => (
      goal.id === id
        ? { ...goal, status: 'done', current: Math.max(goal.current, goal.target), updatedAt: new Date().toISOString() }
        : goal
    )));
  }

  function deleteMarketingGoal(id: string) {
    const goal = marketingGoals.find((item) => item.id === id);
    const ok = confirm(`Удалить цель${goal ? ` «${goal.title}»` : ''}?`);
    if (!ok) return;
    setMarketingGoals((current) => current.filter((item) => item.id !== id));
    if (editingGoalId === id) resetGoalForm();
    setNotice('Цель удалена.');
  }

  function addMarketingWorkItem() {
    const title = newWorkTitle.trim();
    if (!title) {
      setNotice('Укажи название задачи для плана роста.');
      return;
    }

    const item: MarketingWorkItem = {
      id: `${activePillar}-${Date.now()}`,
      pillar: activePillar,
      title,
      status: 'todo',
      priority: newWorkPriority,
      dueDate: '',
    };
    setMarketingWorkItems((current) => [item, ...current]);
    setNewWorkTitle('');
    setNotice(`Задача добавлена в блок «${pillarByKey[activePillar].label}».`);
  }

  function clearGrowthPlan() {
    const ok = confirm('Очистить цели и задачи плана роста в этом браузере?');
    if (!ok) return;
    setMarketingGoals([]);
    setMarketingWorkItems([]);
    setMarketingPillarNotes([]);
    setActivePillar('audience');
    setNewWorkTitle('');
    resetGoalForm('audience');
    setNotice('План роста очищен.');
  }

  function saveCurrentView() {
    const name = savedViewName.trim();
    if (!name) {
      setNotice('Укажи название для сохранённого фильтра.');
      return;
    }

    const view: SavedView = {
      id: `${Date.now()}`,
      name,
      filters,
      userRoleTab,
      questionRoleTab,
      focusPreset,
      sortMode,
    };
    setSavedViews((current) => [view, ...current].slice(0, 12));
    setSavedViewName('');
    setNotice(`Фильтр «${name}» сохранён.`);
  }

  async function sendTelegramReminders() {
    const urgent = todayUsers.slice(0, 25);
    if (urgent.length === 0) {
      setNotice('Срочных контактов нет, отправка не требуется.');
      return;
    }

    const lines = urgent.map((user, index) => {
      const when = formatDate(user.next_contact_date);
      const step = user.next_step || 'Без шага';
      const contact = user.contact || 'контакт не указан';
      return `${index + 1}. <b>${user.name}</b> • ${user.city}\n${when} • ${step}\n${contact}`;
    });
    const text = [
      `<b>PilotBase: задачи на сегодня (${localDateStamp()})</b>`,
      '',
      ...lines,
    ].join('\n');

    setLoading(true);
    try {
      const response = await fetch('/api/reminders/telegram', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Не удалось отправить напоминание.');
      setNotice('Напоминания отправлены в Telegram.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Ошибка отправки в Telegram.');
    } finally {
      setLoading(false);
    }
  }

  function applySavedView(view: SavedView) {
    setFilters(view.filters);
    setUserRoleTab(view.userRoleTab);
    setQuestionRoleTab(view.questionRoleTab);
    setFocusPreset(view.focusPreset ?? 'all');
    setSortMode(view.sortMode ?? 'score');
    setNotice(`Применён фильтр: ${view.name}`);
  }

  function removeSavedView(id: string) {
    setSavedViews((current) => current.filter((item) => item.id !== id));
  }

  function toggleUserSelection(userId: string) {
    setSelectedUserIds((current) => (current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]));
  }

  function toggleSelectAllFiltered() {
    if (allFilteredSelected) {
      setSelectedUserIds((current) => current.filter((id) => !filteredUsers.some((user) => user.id === id)));
      return;
    }

    setSelectedUserIds((current) => {
      const next = new Set(current);
      filteredUsers.forEach((user) => next.add(user.id));
      return Array.from(next);
    });
  }

  function buildAnswerDrafts(userId: string, sourceAnswers = answers, sourceQuestions = selectedQuestions) {
    return sourceQuestions.reduce<Record<string, string>>((acc, question) => {
      acc[question.id] = sourceAnswers.find((answer) => answer.early_user_id === userId && answer.question_id === question.id)?.answer_text ?? '';
      return acc;
    }, {});
  }

  function setSelectedUser(user: EarlyUser | null) {
    selectedUserIdRef.current = user?.id ?? null;
    setSelected(user);
  }

  async function refreshUsers() {
    const { data, error } = await supabase
      .from('early_users')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      setNotice(error.message);
      return;
    }
    setUsers(((data ?? []) as EarlyUser[]).map(sanitizeUser));
  }

  async function refreshQuestionsAndAnswers() {
    const [questionsResult, answersResult] = await Promise.all([
      supabase.from('marketing_questions').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('user_question_answers').select('*'),
    ]);

    if (questionsResult.error || answersResult.error) {
      setNotice(questionsResult.error?.message ?? answersResult.error?.message ?? 'Не удалось обновить вопросы.');
      return;
    }
    setQuestions(((questionsResult.data ?? []) as MarketingQuestion[]).map(sanitizeQuestion));
    setAnswers((answersResult.data ?? []) as UserAnswer[]);
  }

  async function normalizeQuestionOrder(sourceQuestions: MarketingQuestion[]) {
    const sorted = [...sourceQuestions].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    const normalized = sorted.map((question, index) => ({ ...question, sort_order: index + 1 }));
    const initialOrderById = new Map(sourceQuestions.map((question) => [question.id, question.sort_order]));
    const changed = normalized.filter((question) => initialOrderById.get(question.id) !== question.sort_order);

    if (changed.length === 0) {
      setQuestions(normalized);
      return true;
    }

    const updateResults = await Promise.all(
      changed.map((question) => supabase
        .from('marketing_questions')
        .update({ sort_order: question.sort_order })
        .eq('id', question.id)),
    );
    const failed = updateResults.find((result) => result.error)?.error;

    if (failed) {
      setNotice(failed.message);
      return false;
    }

    setQuestions(normalized);
    return true;
  }

  async function loadEvents(userId: string, requestId = selectionRequestRef.current) {
    const { data, error } = await supabase
      .from('early_user_events')
      .select('*')
      .eq('early_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && requestId === selectionRequestRef.current && selectedUserIdRef.current === userId) {
      setEvents((data ?? []) as EarlyUserEvent[]);
    }
  }

  async function addEvent(userId: string, title: string, type: EarlyUserEvent['type'] = 'note', note?: string) {
    await supabase.from('early_user_events').insert({
      early_user_id: userId,
      title,
      type,
      note: note || null,
    });
  }

  function openCreateModal() {
    setEditing(null);
    setForm(emptyInput);
    setModalOpen(true);
  }

  function openEditModal(user: EarlyUser) {
    setEditing(user);
    setForm({
      profile_role: normalizeUserRole(user.profile_role),
      name: user.name,
      city: user.city,
      industry: user.industry,
      contact: user.contact ?? '',
      terms: user.terms,
      stage: user.stage,
      next_step: user.next_step ?? '',
      next_contact_date: user.next_contact_date ?? '',
      priority: user.priority,
      source: user.source ?? '',
      notes: user.notes ?? '',
      is_archived: user.is_archived,
    });
    setModalOpen(true);
  }

  function openCreateQuestionModal() {
    setEditingQuestion(null);
    setQuestionForm({ ...emptyQuestionInput, sort_order: questions.length + 1 });
    setQuestionModalOpen(true);
  }

  function openEditQuestionModal(question: MarketingQuestion) {
    setEditingQuestion(question);
    setQuestionForm({
      target_role: normalizeQuestionRole(question.target_role),
      text: question.text,
      category: question.category,
      type: question.type,
      optionsText: question.options.join(', '),
      is_required: question.is_required,
      is_active: question.is_active,
      sort_order: question.sort_order,
    });
    setQuestionModalOpen(true);
  }

  async function selectUser(user: EarlyUser) {
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    setSelectedUser(user);
    setEvents([]);
    setAnswerDrafts(buildAnswerDrafts(user.id, answers, getQuestionsForRole(user.profile_role)));
    await loadEvents(user.id, requestId);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const payload = normalizeInput(form);
    if (!payload.name || !payload.city || !payload.industry || !payload.terms) {
      setNotice('Заполни название, город, отрасль и условия.');
      return;
    }

    setLoading(true);
    try {
      if (editing) {
        const oldStage = editing.stage;
        const { data, error } = await supabase
          .from('early_users')
          .update(payload)
          .eq('id', editing.id)
          .select('*')
          .single();

        if (error) throw error;
        const updated = sanitizeUser(data as EarlyUser);
        setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
        if (selected?.id === updated.id) {
          setSelectedUser(updated);
          setAnswerDrafts(buildAnswerDrafts(updated.id, answers, getQuestionsForRole(updated.profile_role)));
        }
        await addEvent(updated.id, oldStage !== updated.stage ? `Этап изменён: ${oldStage} → ${updated.stage}` : 'Карточка обновлена', oldStage !== updated.stage ? 'stage_changed' : 'updated');
        if (selected?.id === updated.id) await loadEvents(updated.id);
      } else {
        const { data, error } = await supabase
          .from('early_users')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;
        const created = sanitizeUser(data as EarlyUser);
        setUsers((current) => [created, ...current]);
        setSelectedUser(created);
        setAnswerDrafts(buildAnswerDrafts(created.id, answers, getQuestionsForRole(created.profile_role)));
        await addEvent(created.id, 'Пользователь добавлен', 'created', payload.notes ?? undefined);
        await loadEvents(created.id);
      }
      setModalOpen(false);
      setForm(emptyInput);
      setEditing(null);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось сохранить пользователя.');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuestionSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const payload = normalizeQuestionInput(questionForm);
    if (!payload.text) {
      setNotice('Заполни текст вопроса.');
      return;
    }
    if (payload.type === 'single_choice' && payload.options.length === 0) {
      setNotice('Для вопроса с выбором варианта добавь варианты через запятую.');
      return;
    }

    setLoading(true);
    try {
      if (editingQuestion) {
        const { data, error } = await supabase
          .from('marketing_questions')
          .update(payload)
          .eq('id', editingQuestion.id)
          .select('*')
          .single();

        if (error) throw error;
        const updated = sanitizeQuestion(data as MarketingQuestion);
        setQuestions((current) => current.map((question) => (question.id === updated.id ? updated : question)));
      } else {
        const { data, error } = await supabase
          .from('marketing_questions')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;
        const created = sanitizeQuestion(data as MarketingQuestion);
        setQuestions((current) => [...current, created].sort((a, b) => a.sort_order - b.sort_order));
      }
      setQuestionModalOpen(false);
      setQuestionForm(emptyQuestionInput);
      setEditingQuestion(null);
      setNotice('Вопрос сохранён.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось сохранить вопрос.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(user: EarlyUser) {
    const ok = confirm(`Удалить ${user.name}? Это действие нельзя отменить.`);
    if (!ok) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('early_users').delete().eq('id', user.id);
      if (error) throw error;
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setAnswers((current) => current.filter((answer) => answer.early_user_id !== user.id));
      if (selected?.id === user.id) setSelectedUser(null);
      if (editing?.id === user.id) setEditing(null);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось удалить пользователя.');
    } finally {
      setLoading(false);
    }
  }

  async function bulkChangeStage(stage: Stage) {
    if (selectedFilteredUserIds.length === 0) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('early_users')
        .update({ stage })
        .in('id', selectedFilteredUserIds)
        .select('*');
      if (error) throw error;

      const updatedRows = ((data ?? []) as EarlyUser[]).map(sanitizeUser);
      const byId = new Map(updatedRows.map((item) => [item.id, item]));
      setUsers((current) => current.map((item) => byId.get(item.id) ?? item));
      if (selected && byId.has(selected.id)) setSelected(byId.get(selected.id) ?? selected);
      setNotice(`Этап обновлён у ${updatedRows.length} пользователей.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось массово обновить этап.');
    } finally {
      setLoading(false);
    }
  }

  async function bulkShiftContact(days: number) {
    if (selectedFilteredUserIds.length === 0) return;
    const selectedRows = users.filter((user) => selectedUserSet.has(user.id));
    if (selectedRows.length === 0) return;

    setLoading(true);
    try {
      const results = await Promise.all(
        selectedRows.map((user) => supabase
          .from('early_users')
          .update({ next_contact_date: addDaysStamp(user.next_contact_date, days) })
          .eq('id', user.id)
          .select('*')
          .single()),
      );

      const error = results.find((result) => result.error)?.error;
      if (error) throw error;

      const updatedRows = results
        .map((result) => result.data)
        .filter(Boolean)
        .map((row) => sanitizeUser(row as EarlyUser));
      const byId = new Map(updatedRows.map((item) => [item.id, item]));
      setUsers((current) => current.map((item) => byId.get(item.id) ?? item));
      if (selected && byId.has(selected.id)) setSelected(byId.get(selected.id) ?? selected);
      setNotice(`Дата контакта сдвинута на ${days} дн. для ${updatedRows.length} пользователей.`);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось массово обновить даты.');
    } finally {
      setLoading(false);
    }
  }

  async function bulkDeleteUsers() {
    if (selectedFilteredUserIds.length === 0) return;
    const ok = confirm(`Удалить ${selectedFilteredUserIds.length} пользователей? Действие необратимо.`);
    if (!ok) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('early_users').delete().in('id', selectedFilteredUserIds);
      if (error) throw error;

      setUsers((current) => current.filter((user) => !selectedUserSet.has(user.id)));
      setAnswers((current) => current.filter((answer) => !selectedUserSet.has(answer.early_user_id)));
      if (selected && selectedUserSet.has(selected.id)) setSelectedUser(null);
      setSelectedUserIds([]);
      setNotice('Выбранные пользователи удалены.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось массово удалить пользователей.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteQuestion(question: MarketingQuestion) {
    const ok = confirm(`Удалить вопрос «${question.text}»? Ответы по этому вопросу тоже удалятся.`);
    if (!ok) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('marketing_questions').delete().eq('id', question.id);
      if (error) throw error;
      const remainingQuestions = questions.filter((item) => item.id !== question.id);
      const normalized = await normalizeQuestionOrder(remainingQuestions);
      if (!normalized) {
        await refreshQuestionsAndAnswers();
      }
      setAnswers((current) => current.filter((answer) => answer.question_id !== question.id));
      setAnswerDrafts((current) => {
        const next = { ...current };
        delete next[question.id];
        return next;
      });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось удалить вопрос.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleQuestionActive(question: MarketingQuestion) {
    const { data, error } = await supabase
      .from('marketing_questions')
      .update({ is_active: !question.is_active })
      .eq('id', question.id)
      .select('*')
      .single();

    if (error) {
      setNotice(error.message);
      return;
    }
    const updated = sanitizeQuestion(data as MarketingQuestion);
    setQuestions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function moveQuestion(question: MarketingQuestion, direction: -1 | 1) {
    const currentIndex = questionOrderIndex.get(question.id);
    if (currentIndex === undefined) return;
    const neighborIndex = currentIndex + direction;
    if (neighborIndex < 0 || neighborIndex >= questionsSorted.length) return;

    const neighbor = questionsSorted[neighborIndex];
    const updates = [
      { id: question.id, sort_order: neighbor.sort_order },
      { id: neighbor.id, sort_order: question.sort_order },
    ];

    setLoading(true);
    try {
      const results = await Promise.all(
        updates.map((item) => supabase.from('marketing_questions').update({ sort_order: item.sort_order }).eq('id', item.id)),
      );
      const failed = results.find((result) => result.error)?.error;
      if (failed) throw failed;

      setQuestions((current) => current.map((item) => {
        if (item.id === question.id) return { ...item, sort_order: neighbor.sort_order };
        if (item.id === neighbor.id) return { ...item, sort_order: question.sort_order };
        return item;
      }));
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось изменить порядок вопроса.');
    } finally {
      setLoading(false);
    }
  }

  async function duplicateQuestion(question: MarketingQuestion) {
    const payload = {
      target_role: question.target_role,
      text: `${question.text} (копия)`,
      category: question.category,
      type: question.type,
      options: question.options,
      is_required: question.is_required,
      is_active: question.is_active,
      sort_order: questions.length + 1,
    };

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_questions')
        .insert(payload)
        .select('*')
        .single();
      if (error) throw error;

      const created = sanitizeQuestion(data as MarketingQuestion);
      const normalized = await normalizeQuestionOrder([...questions, created]);
      if (!normalized) await refreshQuestionsAndAnswers();
      setNotice('Вопрос скопирован.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось скопировать вопрос.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStageQuickChange(user: EarlyUser, stage: Stage) {
    if (user.stage === stage) return;
    const { data, error } = await supabase
      .from('early_users')
      .update({ stage })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      setNotice(error.message);
      return;
    }
    const updated = sanitizeUser(data as EarlyUser);
    setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)));
    setSelected((current) => (current?.id === user.id ? updated : current));
    await addEvent(user.id, `Этап изменён: ${user.stage} → ${stage}`, 'stage_changed');
    if (selected?.id === user.id) await loadEvents(user.id);
  }

  async function rescheduleNextContact(user: EarlyUser, days: number) {
    const nextDate = addDaysStamp(user.next_contact_date, days);
    const { data, error } = await supabase
      .from('early_users')
      .update({ next_contact_date: nextDate })
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) {
      setNotice(error.message);
      return;
    }

    const updated = sanitizeUser(data as EarlyUser);
    setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)));
    setSelected((current) => (current?.id === user.id ? updated : current));
    await addEvent(user.id, `Следующий контакт перенесён на ${formatDate(nextDate)}`, 'contact');
    if (selected?.id === user.id) await loadEvents(user.id);
  }

  async function handleSaveAnswers() {
    if (!selected) return;
    if (selectedQuestions.length === 0) {
      setNotice('Сначала добавь вопросы на странице «Вопросы».');
      return;
    }
    const missingRequired = selectedQuestions.filter((question) => question.is_required && !answerDrafts[question.id]?.trim());
    if (missingRequired.length > 0) {
      const missingPreview = missingRequired.slice(0, 2).map((question) => `«${question.text}»`).join(', ');
      const suffix = missingRequired.length > 2 ? ` и ещё ${missingRequired.length - 2}` : '';
      setNotice(`Заполни обязательные вопросы: ${missingPreview}${suffix}.`);
      return;
    }

    setLoading(true);
    try {
      const rows = selectedQuestions.map((question) => ({
        early_user_id: selected.id,
        question_id: question.id,
        answer_text: answerDrafts[question.id]?.trim() || null,
      }));

      const { data, error } = await supabase
        .from('user_question_answers')
        .upsert(rows, { onConflict: 'early_user_id,question_id' })
        .select('*');

      if (error) throw error;
      const saved = (data ?? []) as UserAnswer[];
      setAnswers((current) => {
        const savedKeys = new Set(saved.map((answer) => `${answer.early_user_id}:${answer.question_id}`));
        return [...current.filter((answer) => !savedKeys.has(`${answer.early_user_id}:${answer.question_id}`)), ...saved];
      });
      await addEvent(selected.id, 'Ответы на маркетинговые вопросы обновлены', 'updated');
      await loadEvents(selected.id);
      setNotice('Ответы сохранены.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось сохранить ответы.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadDemo() {
    if (users.length > 0 && !confirm('Добавить демо-данные к текущим записям?')) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from('early_users').insert(demoUsers.map(normalizeInput)).select('*');
      if (error) throw error;
      const created = ((data ?? []) as EarlyUser[]).map(sanitizeUser);
      setUsers((current) => [...created, ...current]);
      await Promise.all(created.map((user) => addEvent(user.id, 'Демо-пользователь добавлен', 'created')));
      setNotice('Демо-данные добавлены.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось загрузить демо-данные.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadDemoQuestions() {
    if (questions.length > 0 && !confirm('Добавить базовые вопросы к текущему списку?')) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('marketing_questions')
        .insert(demoQuestions.map(normalizeQuestionInput))
        .select('*');

      if (error) throw error;
      const created = ((data ?? []) as MarketingQuestion[]).map(sanitizeQuestion);
      setQuestions((current) => [...current, ...created].sort((a, b) => a.sort_order - b.sort_order));
      setNotice('Базовые маркетинговые вопросы добавлены.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось добавить вопросы.');
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    downloadTextFile(`pilotbase-users-${localDateStamp()}.csv`, usersToCsv(filteredUsers), 'text/csv;charset=utf-8');
  }

  function exportJson() {
    downloadTextFile(`pilotbase-users-${localDateStamp()}.json`, JSON.stringify(filteredUsers, null, 2), 'application/json;charset=utf-8');
  }

  function exportAnswersCsv() {
    const header = ['Пользователь', 'Сегмент', 'Город', 'Отрасль', 'Условия', 'Этап', ...visibleActiveQuestions.map((question) => question.text)];
    const rows = filteredUsers.map((user) => [
      user.name,
      userRoleLabel[user.profile_role],
      user.city,
      user.industry,
      user.terms,
      user.stage,
      ...visibleActiveQuestions.map((question) => getAnswer(user.id, question.id)),
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\n');
    downloadTextFile(`pilotbase-answers-${localDateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  async function exportStatsPng() {
    const element = document.getElementById('stats-export-area');
    if (!element) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, { backgroundColor: '#f6f8fb', scale: 2 });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `pilotbase-stats-${localDateStamp()}.png`;
    link.click();
  }

  const maxCity = Math.max(...cityStats.map((item) => item.count), 1);
  const maxIndustry = Math.max(...industryStats.map((item) => item.count), 1);
  const maxTerms = Math.max(...termsStats.map((item) => item.count), 1);
  const answeredTotal = answerStats.totalAnswered;
  const hotLeadCount = filteredUsers.filter((user) => {
    const answered = getAnswerCount(user.id, user.profile_role);
    const total = getTotalQuestionsForRole(user.profile_role);
    return leadScore(user, answered, total) >= 70;
  }).length;
  const conversionRate = metrics.total > 0 ? Math.round((metrics.connected / metrics.total) * 100) : 0;
  const totalQuestionSlots = filteredUsers.reduce((sum, user) => sum + getTotalQuestionsForRole(user.profile_role), 0);
  const answeredQuestionSlots = filteredUsers.reduce((sum, user) => sum + getAnswerCount(user.id, user.profile_role), 0);
  const questionCoverage = totalQuestionSlots > 0 ? Math.round((answeredQuestionSlots / totalQuestionSlots) * 100) : 0;
  const averageLeadScore = filteredUsers.length > 0
    ? Math.round(filteredUsers.reduce((sum, user) => sum + leadScore(user, getAnswerCount(user.id, user.profile_role), getTotalQuestionsForRole(user.profile_role)), 0) / filteredUsers.length)
    : 0;
  const marketingPillarStats = useMemo(() => {
    const workByPillar = new Map<MarketingPillarKey, MarketingWorkItem[]>();
    const goalsByPillar = new Map<MarketingPillarKey, MarketingGoal[]>();
    const notesByPillar = new Map(marketingPillarNotes.map((note) => [note.pillar, note]));
    marketingPillars.forEach((pillar) => workByPillar.set(pillar.key, []));
    marketingPillars.forEach((pillar) => goalsByPillar.set(pillar.key, []));
    marketingWorkItems.forEach((item) => workByPillar.get(item.pillar)?.push(item));
    marketingGoals.forEach((goal) => goalsByPillar.get(goal.pillar)?.push(goal));

    return marketingPillars.map((pillar) => {
      const workItems = workByPillar.get(pillar.key) ?? [];
      const goalItems = goalsByPillar.get(pillar.key) ?? [];
      const note = notesByPillar.get(pillar.key);
      const done = workItems.filter((item) => item.status === 'done').length;
      const doing = workItems.filter((item) => item.status === 'doing').length;
      const workScore = workItems.length > 0 ? percent(done + doing * 0.5, workItems.length) : 0;
      const noteFields = [note?.summary, note?.output, note?.questionsText, note?.metricsText].filter((value) => value?.trim()).length;
      const goalScore = goalItems.length > 0 ? 12 : 0;
      const taskScore = workItems.length > 0 ? 12 : 0;
      const noteScore = noteFields * 15;
      const progressScore = workItems.length > 0 ? Math.round(workScore * 0.16) : 0;
      const score = clampScore(noteScore + goalScore + taskScore + progressScore);
      const isFilled = score > 0;
      return {
        ...pillar,
        note,
        score,
        workScore,
        workTotal: workItems.length,
        workDone: done,
        workDoing: doing,
        workTodo: workItems.filter((item) => item.status === 'todo').length,
        goalsTotal: goalItems.length,
        goalsDone: goalItems.filter((goal) => goal.status === 'done').length,
        isFilled,
      };
    });
  }, [marketingWorkItems, marketingGoals, marketingPillarNotes]);
  const filledMarketingPillars = marketingPillarStats.filter((item) => item.isFilled).length;
  const marketingReadiness = percent(filledMarketingPillars, marketingPillarStats.length);
  const activePillarStat = marketingPillarStats.find((item) => item.key === activePillar) ?? marketingPillarStats[0];
  const activePillarNote = activePillarStat.note ?? {
    pillar: activePillar,
    summary: '',
    output: '',
    questionsText: '',
    metricsText: '',
    updatedAt: '',
  };
  const activePillarWorkItems = marketingWorkItems.filter((item) => item.pillar === activePillar);
  const emptyMarketingPillars = marketingPillarStats.filter((item) => !item.isFilled);
  const criticalMarketingGaps = emptyMarketingPillars.slice(0, 4);
  const nextMarketingStep = marketingWorkItems.find((item) => item.status !== 'done' && item.priority === 'high')
    ?? marketingWorkItems.find((item) => item.status !== 'done')
    ?? null;
  const marketingWorkDone = marketingWorkItems.filter((item) => item.status === 'done').length;
  const computedMarketingGoals = useMemo(() => marketingGoals.map((goal) => ({
    ...goal,
    progress: goalProgress(goal),
    gap: Math.max(0, goal.target - goal.current),
    planItems: splitGoalLines(goal.planText),
    achievementItems: splitGoalLines(goal.achievementsText),
  })), [marketingGoals]);
  const sortedMarketingGoals = useMemo(() => [...computedMarketingGoals].sort((a, b) => {
    const priorityWeightByGoal: Record<MarketingGoalPriority, number> = { critical: 0, high: 1, medium: 2 };
    const statusWeightByGoal: Record<MarketingGoalStatus, number> = { active: 0, paused: 1, done: 2 };
    return statusWeightByGoal[a.status] - statusWeightByGoal[b.status]
      || a.progress - b.progress
      || priorityWeightByGoal[a.priority] - priorityWeightByGoal[b.priority]
      || a.updatedAt.localeCompare(b.updatedAt);
  }), [computedMarketingGoals]);
  const achievedMarketingGoals = computedMarketingGoals.filter((goal) => goal.status === 'done' || goal.progress >= 100).length;
  const averageGoalProgress = computedMarketingGoals.length > 0
    ? Math.round(computedMarketingGoals.reduce((sum, goal) => sum + goal.progress, 0) / computedMarketingGoals.length)
    : 0;
  const immediateGoalPlan = sortedMarketingGoals.filter((goal) => goal.status !== 'done' && goal.progress < 100).slice(0, 3);
  const cityMapMarkByCity = useMemo(() => new Map(cityMapMarks.map((mark) => [mark.city, mark])), [cityMapMarks]);
  const cityPointByName = useMemo(() => new Map(belarusCityPoints.map((point) => [point.city, point])), []);
  const cityLoadItems = useMemo(() => belarusCityPoints.map((point) => {
    const cityUsers = users.filter((user) => user.city === point.city);
    const filteredCityUsers = filteredUsers.filter((user) => user.city === point.city);
    const activeCityUsers = cityUsers.filter((user) => !user.is_archived && !['Отказ', 'Архив'].includes(user.stage));
    const connectedCityUsers = cityUsers.filter((user) => ['Подключён', 'Активно пользуется'].includes(user.stage));
    const hotCityUsers = cityUsers.filter((user) => {
      const answered = getAnswerCount(user.id, user.profile_role);
      const total = getTotalQuestionsForRole(user.profile_role);
      return leadScore(user, answered, total) >= 70;
    });
    const mark = cityMapMarkByCity.get(point.city);

    return {
      ...point,
      total: cityUsers.length,
      filteredTotal: filteredCityUsers.length,
      active: activeCityUsers.length,
      connected: connectedCityUsers.length,
      hot: hotCityUsers.length,
      mark,
    };
  }), [users, filteredUsers, cityMapMarkByCity, getAnswerCount, getTotalQuestionsForRole]);
  const maxBelarusCityLoad = Math.max(...cityLoadItems.map((item) => item.total), 1);
  const markedCitiesCount = cityLoadItems.filter((item) => item.mark && (item.mark.status !== 'none' || item.mark.note.trim())).length;
  const selectedCityLoad = cityLoadItems.find((item) => item.city === selectedBelarusCity) ?? cityLoadItems[0];
  const sortedCityLoadItems = useMemo(() => [...cityLoadItems].sort((a, b) => (
    b.total - a.total || b.active - a.active || a.city.localeCompare(b.city, 'ru')
  )), [cityLoadItems]);
  const unknownCityLoads = useMemo(() => {
    const counts = new Map<string, number>();
    users.forEach((user) => {
      if (cityPointByName.has(user.city)) return;
      counts.set(user.city, (counts.get(user.city) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'ru'));
  }, [users, cityPointByName]);
  const belarusMapTransform = `translate(${50 + belarusMapOffset.x} ${50 + belarusMapOffset.y}) scale(${belarusMapZoom}) translate(-50 -50)`;
  const selectedAnswerCount = selected ? getAnswerCount(selected.id, selected.profile_role) : 0;
  const selectedTotalQuestions = selected ? getTotalQuestionsForRole(selected.profile_role) : 0;
  const selectedAnswerProgress = selectedTotalQuestions > 0 ? Math.round((selectedAnswerCount / selectedTotalQuestions) * 100) : 0;
  const selectedScore = selected
    ? leadScore(selected, getAnswerCount(selected.id, selected.profile_role), getTotalQuestionsForRole(selected.profile_role))
    : 0;

  function exportMarketingPlan() {
    const goalLines = sortedMarketingGoals.length === 0
      ? ['Целей пока нет.', '']
      : sortedMarketingGoals.flatMap((goal) => [
        `### ${goal.title} — ${goal.progress}%`,
        `Направление: ${pillarByKey[goal.pillar].label}`,
        `Статус: ${goalStatusLabel[goal.status]}`,
        `Приоритет: ${goalPriorityLabel[goal.priority]}`,
        `Факт: ${formatGoalValue(goal.current, goal.unit)}`,
        `Цель: ${formatGoalValue(goal.target, goal.unit)}`,
        `Срок: ${goal.deadline ? formatDate(goal.deadline) : 'не задан'}`,
        goal.description ? `Описание: ${goal.description}` : 'Описание: не добавлено',
        'План достижения:',
        ...(goal.planItems.length > 0 ? goal.planItems.map((step) => `- ${step}`) : ['- План пока не записан']),
        'Достижения:',
        ...(goal.achievementItems.length > 0 ? goal.achievementItems.map((item) => `- ${item}`) : ['- Достижений пока нет']),
        '',
      ]);
    const openWorkItems = marketingWorkItems.filter((item) => item.status !== 'done');
    const workLines = openWorkItems.length === 0
      ? ['Открытых задач пока нет.', '']
      : openWorkItems.map((item) => (
        `- [${workPriorityLabel[item.priority]}] ${pillarByKey[item.pillar].label}: ${item.title} (${workStatusLabel[item.status]})`
      ));
    const lines = [
      '# PilotBase: План роста',
      '',
      `Дата: ${localDateStamp()}`,
      `Заполнено направлений: ${filledMarketingPillars}/${marketingPillarStats.length} (${marketingReadiness}%)`,
      `Лидов в базе: ${users.length}`,
      `Заполненность интервью: ${questionCoverage}%`,
      '',
      '## Цели',
      '',
      ...goalLines,
      '',
      '## Направления',
      '',
      ...marketingPillarStats.flatMap((pillar) => [
        `### ${pillar.label} — ${pillar.isFilled ? 'заполнено' : 'пусто'}`,
        `Фаза: ${pillar.phase}`,
        `Описание: ${pillar.note?.summary.trim() || 'не заполнено'}`,
        `Результат: ${pillar.note?.output.trim() || 'не заполнено'}`,
        'Контрольные вопросы:',
        ...(splitGoalLines(pillar.note?.questionsText ?? '').length > 0
          ? splitGoalLines(pillar.note?.questionsText ?? '').map((item) => `- ${item}`)
          : ['- не заполнено']),
        'Метрики:',
        ...(splitGoalLines(pillar.note?.metricsText ?? '').length > 0
          ? splitGoalLines(pillar.note?.metricsText ?? '').map((item) => `- ${item}`)
          : ['- не заполнено']),
        `Зависит от: ${pillar.dependsOn.length > 0 ? pillar.dependsOn.map((key) => pillarByKey[key].label).join(', ') : 'нет зависимостей'}`,
        `Влияет на: ${pillar.next.length > 0 ? pillar.next.map((key) => pillarByKey[key].label).join(', ') : 'финальный блок'}`,
        `Задачи: ${pillar.workDone}/${pillar.workTotal} готово`,
        `Цели: ${pillar.goalsDone}/${pillar.goalsTotal} достигнуто`,
        '',
      ]),
      '## Открытые задачи',
      '',
      ...workLines,
      '',
    ];
    downloadTextFile(`pilotbase-plan-rosta-${localDateStamp()}.md`, lines.join('\n'), 'text/markdown;charset=utf-8');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">P</div>
          <div>
            <span>PilotBase</span>
            <small>Launch CRM</small>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Основное меню">
          {navigationItems.map((item) => (
            <button
              key={item.mode}
              className={viewMode === item.mode ? 'active' : ''}
              type="button"
              onClick={() => setViewMode(item.mode)}
            >
              <span className="nav-index">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-status">
          <span>Сегодня</span>
          <strong>{metrics.today}</strong>
          <small>Просрочено: {metrics.overdue}</small>
        </div>
        <div className="sidebar-footer">
          <div className="avatar">PB</div>
          <div className="sidebar-user">
            <strong>Общая база</strong>
            <span>{users.length} записей в workspace</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Операционный центр запуска</span>
            <h1>{viewModeLabel[viewMode]}</h1>
            <p>{viewModeDescription[viewMode]}</p>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <span aria-hidden="true">/</span>
              <input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Поиск по имени, городу, отрасли, заметкам" />
            </div>
            {viewMode === 'growth' ? (
              <button className="primary-button" onClick={exportMarketingPlan} type="button"><span aria-hidden="true">↓</span> Экспорт плана</button>
            ) : viewMode === 'questions' ? (
              <button className="primary-button" onClick={openCreateQuestionModal} type="button"><span aria-hidden="true">+</span> Добавить вопрос</button>
            ) : (
              <button className="primary-button" onClick={openCreateModal} type="button"><span aria-hidden="true">+</span> Добавить пользователя</button>
            )}
          </div>
        </header>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)}>Закрыть</button>
          </div>
        )}

        <section className="metrics-grid">
          {viewMode === 'growth' ? (
            <>
              <MetricCard label="Заполнено направлений" value={`${filledMarketingPillars}/${marketingPillarStats.length}`} icon="PL" />
              <MetricCard label="Прогресс целей" value={`${averageGoalProgress}%`} icon="GL" />
              <MetricCard label="Целей достигнуто" value={`${achievedMarketingGoals}/${computedMarketingGoals.length}`} icon="OK" />
              <MetricCard label="Задачи" value={`${marketingWorkDone}/${marketingWorkItems.length}`} icon="WK" />
              <MetricCard label="Пустые блоки" value={emptyMarketingPillars.length} icon="BL" tone={emptyMarketingPillars.length > 0 ? 'warning' : undefined} />
              <MetricCard label="Интервью" value={`${questionCoverage}%`} icon="QA" />
            </>
          ) : viewMode === 'geo' ? (
            <>
              <MetricCard label="Города на карте" value={cityLoadItems.length} icon="BY" />
              <MetricCard label="Пользователи" value={users.length} icon="US" />
              <MetricCard label="Активные города" value={cityLoadItems.filter((city) => city.total > 0).length} icon="CT" />
              <MetricCard label="Пометки" value={markedCitiesCount} icon="MK" />
              <MetricCard label="Горячие лиды" value={hotLeadCount} icon="HI" />
              <MetricCard label="Подключены" value={metrics.connected} icon="CV" />
            </>
          ) : (
            <>
              <MetricCard label="Активная база" value={metrics.total} icon="AB" />
              <MetricCard label="Горячие лиды" value={hotLeadCount} icon="HI" />
              <MetricCard label="Средний score" value={averageLeadScore} icon="SC" />
              <MetricCard label="Подключены" value={`${metrics.connected} · ${conversionRate}%`} icon="CV" />
              <MetricCard label="Срочные контакты" value={metrics.today + metrics.overdue} icon="DQ" tone="warning" />
              <MetricCard label="Анкета заполнена" value={`${questionCoverage}%`} icon="QA" />
            </>
          )}
        </section>

        {viewMode !== 'questions' && viewMode !== 'growth' && viewMode !== 'geo' && (
          <section className="ops-grid">
            <section className="filters-card">
              <div className="panel-heading compact">
                <div>
                  <h2>Фокус</h2>
                  <p>{activeFilterCount > 0 ? `Активных условий: ${activeFilterCount}` : 'Вся база без ограничений'}</p>
                </div>
                <button className="secondary-button icon-button" type="button" onClick={resetWorkspaceFilters} title="Сбросить фильтры">×</button>
              </div>
              <div className="focus-presets" role="tablist" aria-label="Фокус списка">
                {focusPresetItems.map((item) => (
                  <button
                    key={item.value}
                    className={focusPreset === item.value ? 'active' : ''}
                    onClick={() => setFocusPreset(item.value)}
                    type="button"
                  >
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </button>
                ))}
              </div>
              <div className="filters-grid">
                <select value={filters.city} onChange={(event) => updateFilter('city', event.target.value)}>
                  <option value="">Город</option>
                  {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                <select value={filters.industry} onChange={(event) => updateFilter('industry', event.target.value)}>
                  <option value="">Отрасль</option>
                  {industryOptions.map((industry) => <option key={industry} value={industry}>{industry}</option>)}
                </select>
                <select value={filters.terms} onChange={(event) => updateFilter('terms', event.target.value)}>
                  <option value="">Условия</option>
                  {termsOptions.map((terms) => <option key={terms} value={terms}>{terms}</option>)}
                </select>
                <select value={filters.stage} onChange={(event) => updateFilter('stage', event.target.value)}>
                  <option value="">Этап</option>
                  {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                </select>
                <select value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}>
                  <option value="">Приоритет</option>
                  {PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}
                </select>
                <select value={filters.profileRole} onChange={(event) => updateFilter('profileRole', event.target.value as Filters['profileRole'])}>
                  <option value="">Сегмент</option>
                  <option value="map">Пользователи карты</option>
                  <option value="crm">Пользователи CRM</option>
                </select>
                <label className="checkbox-filter">
                  <input checked={filters.onlyToday} onChange={(event) => updateFilter('onlyToday', event.target.checked)} type="checkbox" />
                  Только сегодня
                </label>
              </div>
            </section>

            <section className="quick-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Сегодня</h2>
                  <p>Срочные и просроченные касания</p>
                </div>
                <strong>{todayUsers.length}</strong>
              </div>
              <div className="quick-list">
                {todayUsers.length === 0 ? <span className="muted">Нет срочных контактов</span> : todayUsers.slice(0, 5).map((user) => (
                  <button className={isOverdue(user.next_contact_date) ? 'quick-item overdue' : 'quick-item'} key={user.id} onClick={() => selectUser(user)} type="button">
                    <strong>{user.name}</strong>
                    <span>{user.city} · {user.next_step || 'Следующий шаг не указан'}</span>
                    <b>{formatDate(user.next_contact_date)}</b>
                  </button>
                ))}
              </div>
            </section>

            <section className="queue-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>План на 7 дней</h2>
                  <p>Очередь касаний по текущей выборке</p>
                </div>
                <div className="queue-badges">
                  <span className="queue-badge overdue">{queueCounters.overdue}</span>
                  <span className="queue-badge today">{queueCounters.today}</span>
                  <span className="queue-badge planned">{queueCounters.upcoming}</span>
                </div>
              </div>
              <div className="queue-list">
                {contactQueue.length === 0 ? (
                  <span className="muted">В ближайшие 7 дней задач нет.</span>
                ) : (
                  contactQueue.slice(0, 12).map((item) => (
                    <button
                      key={`${item.user.id}:${item.user.next_contact_date}`}
                      className={`queue-item ${queueClass(item.dayOffset)}`}
                      onClick={() => selectUser(item.user)}
                      type="button"
                    >
                      <strong>{item.user.name}</strong>
                      <span>{item.user.city} · {item.user.next_step || 'Следующий шаг не указан'}</span>
                      <b>{queueLabel(item.dayOffset)} · {formatDate(item.user.next_contact_date)}</b>
                    </button>
                  ))
                )}
              </div>
            </section>
          </section>
        )}

        <div className="view-switch">
          <div className="section-tabs">
            {navigationItems.map((item) => (
              <button
                key={item.mode}
                className={viewMode === item.mode ? 'active' : ''}
                onClick={() => setViewMode(item.mode)}
                type="button"
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
          <div className="toolbar-actions">
            {viewMode !== 'questions' && viewMode !== 'growth' && viewMode !== 'geo' && (
              <label className="sort-control">
                <span>Сортировка</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                  {(Object.keys(sortModeLabel) as SortMode[]).map((mode) => <option key={mode} value={mode}>{sortModeLabel[mode]}</option>)}
                </select>
              </label>
            )}
            {viewMode === 'growth' ? (
              <div className="export-actions">
                <button className="secondary-button" onClick={exportMarketingPlan} type="button"><span aria-hidden="true">↓</span> Markdown</button>
                <button className="secondary-button" onClick={clearGrowthPlan} type="button"><span aria-hidden="true">×</span> Очистить</button>
              </div>
            ) : viewMode === 'geo' ? (
              <div className="export-actions">
                <button className="secondary-button" onClick={resetBelarusMapView} type="button"><span aria-hidden="true">⌂</span> Сбросить карту</button>
                <button className="secondary-button" onClick={openCreateModal} type="button"><span aria-hidden="true">+</span> Добавить пользователя</button>
              </div>
            ) : (
              <div className="export-actions">
                <button className="secondary-button" onClick={exportCsv} type="button"><span aria-hidden="true">↓</span> CSV</button>
                <button className="secondary-button" onClick={exportAnswersCsv} type="button"><span aria-hidden="true">↓</span> Ответы</button>
                <button className="secondary-button" onClick={exportJson} type="button"><span aria-hidden="true">↓</span> JSON</button>
                <button className="secondary-button" onClick={exportStatsPng} type="button"><span aria-hidden="true">▣</span> PNG</button>
                <button className="secondary-button" disabled={loading} onClick={sendTelegramReminders} type="button"><span aria-hidden="true">↗</span> Telegram</button>
                <button className="secondary-button" disabled={loading} onClick={handleLoadDemo} type="button"><span aria-hidden="true">+</span> Демо</button>
              </div>
            )}
          </div>
        </div>

        {viewMode !== 'growth' && viewMode !== 'geo' && (
          <section className="saved-views-bar">
            <div className="saved-views-create">
              <input
                value={savedViewName}
                onChange={(event) => setSavedViewName(event.target.value)}
                placeholder="Название фильтра (например: Карта / Срочные)"
              />
              <button className="secondary-button" onClick={saveCurrentView} type="button">Сохранить фильтр</button>
            </div>
            <div className="saved-views-list">
              {savedViews.length === 0 ? (
                <span className="muted">Сохранённых фильтров пока нет.</span>
              ) : (
                savedViews.map((view) => (
                  <div className="saved-view-item" key={view.id}>
                    <button className="saved-view-apply" onClick={() => applySavedView(view)} type="button">{view.name}</button>
                    <button className="saved-view-remove" onClick={() => removeSavedView(view.id)} type="button" title="Удалить фильтр">×</button>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {viewMode === 'growth' && activePillarStat && (
          <section className="growth-workspace">
            <section className="content-card growth-goals">
              <div className="card-heading">
                <div>
                  <h2>Цели и план достижения</h2>
                  <p>Записывай свои цели, план действий и уже полученные достижения. Прогресс считается по твоим значениям.</p>
                </div>
                <div className={`readiness-badge ${scoreClass(averageGoalProgress)}`}>
                  <span>Цели</span>
                  <strong>{averageGoalProgress}%</strong>
                </div>
              </div>

              <div className="goal-editor">
                <div className="goal-editor-head">
                  <div>
                    <h3>{editingGoalId ? 'Редактирование цели' : 'Новая цель'}</h3>
                    <p>Сформулируй результат, срок, план и фактические достижения.</p>
                  </div>
                  {editingGoalId && (
                    <button className="secondary-button" onClick={() => resetGoalForm()} type="button">Отмена</button>
                  )}
                </div>
                <div className="goal-form-grid">
                  <label>
                    <span>Название цели</span>
                    <input
                      value={goalForm.title}
                      onChange={(event) => updateGoalForm('title', event.target.value)}
                      placeholder="Например: Получить 15 заявок из контента"
                    />
                  </label>
                  <label>
                    <span>Направление</span>
                    <select value={goalForm.pillar} onChange={(event) => updateGoalForm('pillar', event.target.value as MarketingPillarKey)}>
                      {marketingPillars.map((pillar) => <option key={pillar.key} value={pillar.key}>{pillar.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Сейчас</span>
                    <input
                      min="0"
                      type="number"
                      value={goalForm.current}
                      onChange={(event) => updateGoalForm('current', Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Цель</span>
                    <input
                      min="1"
                      type="number"
                      value={goalForm.target}
                      onChange={(event) => updateGoalForm('target', Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>Единица</span>
                    <input
                      value={goalForm.unit}
                      onChange={(event) => updateGoalForm('unit', event.target.value)}
                      placeholder="%, лиды, заявки"
                    />
                  </label>
                  <label>
                    <span>Срок</span>
                    <input type="date" value={goalForm.deadline} onChange={(event) => updateGoalForm('deadline', event.target.value)} />
                  </label>
                  <label>
                    <span>Приоритет</span>
                    <select value={goalForm.priority} onChange={(event) => updateGoalForm('priority', event.target.value as MarketingGoalPriority)}>
                      {(Object.keys(goalPriorityLabel) as MarketingGoalPriority[]).map((priority) => (
                        <option key={priority} value={priority}>{goalPriorityLabel[priority]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Статус</span>
                    <select value={goalForm.status} onChange={(event) => updateGoalForm('status', event.target.value as MarketingGoalStatus)}>
                      {(Object.keys(goalStatusLabel) as MarketingGoalStatus[]).map((status) => (
                        <option key={status} value={status}>{goalStatusLabel[status]}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="goal-wide-field">
                  <span>Описание</span>
                  <textarea
                    rows={3}
                    value={goalForm.description}
                    onChange={(event) => updateGoalForm('description', event.target.value)}
                    placeholder="Почему эта цель важна и какой результат должен быть понятен в конце цикла"
                  />
                </label>
                <div className="goal-notes-grid">
                  <label>
                    <span>План достижения</span>
                    <textarea
                      rows={5}
                      value={goalForm.planText}
                      onChange={(event) => updateGoalForm('planText', event.target.value)}
                      placeholder="Каждый шаг с новой строки"
                    />
                  </label>
                  <label>
                    <span>Достижения</span>
                    <textarea
                      rows={5}
                      value={goalForm.achievementsText}
                      onChange={(event) => updateGoalForm('achievementsText', event.target.value)}
                      placeholder="Что уже сделано, проверено или получено"
                    />
                  </label>
                </div>
                <div className="goal-actions">
                  <button className="primary-button" onClick={saveMarketingGoal} type="button">
                    <span aria-hidden="true">{editingGoalId ? '✓' : '+'}</span>
                    {editingGoalId ? 'Сохранить цель' : 'Добавить цель'}
                  </button>
                  <span>{computedMarketingGoals.length === 0 ? 'Создай первую цель, и здесь появится рабочий цикл.' : `В плане целей: ${computedMarketingGoals.length}`}</span>
                </div>
              </div>

              <div className="goal-grid">
                {sortedMarketingGoals.length === 0 ? (
                  <div className="goal-empty">
                    <strong>Целей пока нет</strong>
                    <p>Добавь первую цель выше: например, по аудитории, офферу, продажам или удержанию. План и достижения будут храниться рядом с ней.</p>
                  </div>
                ) : sortedMarketingGoals.map((goal) => (
                  <article className={goal.status === 'done' ? 'goal-card done' : 'goal-card'} key={goal.id}>
                    <div className="goal-head">
                      <div>
                        <span>{pillarByKey[goal.pillar].label} · {goalPriorityLabel[goal.priority]}</span>
                        <h3>{goal.title}</h3>
                      </div>
                      <div className="goal-head-meta">
                        <b className={`score-pill ${scoreClass(goal.progress)}`}>{goal.progress}%</b>
                        <em className={`goal-status ${goal.status}`}>{goalStatusLabel[goal.status]}</em>
                      </div>
                    </div>
                    <p>{goal.description || 'Описание пока не добавлено.'}</p>
                    <div className="goal-values">
                      <strong>{formatGoalValue(goal.current, goal.unit)}</strong>
                      <span>из {formatGoalValue(goal.target, goal.unit)} · {goal.deadline ? `до ${formatDate(goal.deadline)}` : 'срок не задан'}</span>
                    </div>
                    <div className="progress-line"><span style={{ width: `${goal.progress}%` }} /></div>
                    <div className="goal-plan">
                      <strong>{goal.gap > 0 && goal.status !== 'done' ? `Осталось: ${formatGoalValue(goal.gap, goal.unit)}` : 'Цель достигнута'}</strong>
                      {goal.planItems.length > 0
                        ? goal.planItems.slice(0, 4).map((step) => <span key={step}>{step}</span>)
                        : <span>План пока не записан.</span>}
                    </div>
                    <div className="goal-plan achievements">
                      <strong>Достижения</strong>
                      {goal.achievementItems.length > 0
                        ? goal.achievementItems.slice(0, 3).map((item) => <span key={item}>{item}</span>)
                        : <span>Достижения пока не добавлены.</span>}
                    </div>
                    <div className="goal-card-actions">
                      <button className="secondary-button" onClick={() => editMarketingGoal(goal)} type="button">Изменить</button>
                      {goal.status !== 'done' && (
                        <button className="secondary-button" onClick={() => completeMarketingGoal(goal.id)} type="button">Достигнута</button>
                      )}
                      <button className="secondary-button danger" onClick={() => deleteMarketingGoal(goal.id)} type="button">Удалить</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="content-card goal-next-steps">
              <div className="card-heading">
                <div>
                  <h2>Что делать первым</h2>
                  <p>Сначала показываются активные цели с самым слабым прогрессом и высоким приоритетом.</p>
                </div>
              </div>
              <div className="next-step-list">
                {immediateGoalPlan.map((goal, index) => (
                  <article key={goal.id}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{goal.title}</strong>
                      <p>{goal.planItems[0] || 'Добавь первый шаг в плане достижения цели.'}</p>
                      <small>{pillarByKey[goal.pillar].label} · сейчас {formatGoalValue(goal.current, goal.unit)} из {formatGoalValue(goal.target, goal.unit)}</small>
                    </div>
                  </article>
                ))}
                {immediateGoalPlan.length === 0 && (
                  <span className="muted">{computedMarketingGoals.length === 0 ? 'Добавь первую цель, чтобы появился приоритетный план.' : 'Все активные цели закрыты. Можно ставить следующий цикл.'}</span>
                )}
              </div>
            </section>

            <section className="content-card growth-map">
              <div className="card-heading">
                <div>
                  <h2>Карта маркетинговой системы</h2>
                  <p>Это ручная карта. Пока ты не заполнил направление, оно остается пустым.</p>
                </div>
                <div className="readiness-badge blue">
                  <span>Заполнено</span>
                  <strong>{filledMarketingPillars}/{marketingPillarStats.length}</strong>
                </div>
              </div>

              <div className="growth-flow">
                {Array.from(new Set(marketingPillars.map((pillar) => pillar.phase))).map((phase) => {
                  const phaseItems = marketingPillarStats.filter((pillar) => pillar.phase === phase);
                  const phaseFilled = phaseItems.filter((pillar) => pillar.isFilled).length;
                  const phaseProgress = percent(phaseFilled, phaseItems.length);
                  return (
                    <article className="growth-phase" key={phase}>
                      <div>
                        <span>{phase}</span>
                        <strong>{phaseFilled}/{phaseItems.length}</strong>
                      </div>
                      <div className="progress-line"><span style={{ width: `${phaseProgress}%` }} /></div>
                    </article>
                  );
                })}
              </div>

              <div className="pillar-grid">
                {marketingPillarStats.map((pillar) => (
                  <button
                    className={activePillar === pillar.key ? 'pillar-card active' : 'pillar-card'}
                    key={pillar.key}
                    onClick={() => setActivePillar(pillar.key)}
                    type="button"
                  >
                    <span>{pillar.phase}</span>
                    <strong>{pillar.label}</strong>
                    <small>{pillar.note?.summary.trim() || 'Пока не заполнено. Открой блок и внеси свои данные.'}</small>
                    <div className="pillar-card-foot">
                      <b className={pillar.isFilled ? 'manual-state-pill filled' : 'manual-state-pill empty'}>
                        {pillar.isFilled ? 'Заполнено' : 'Пусто'}
                      </b>
                      <em>{pillar.goalsTotal} целей · {pillar.workTotal} задач</em>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="content-card growth-detail">
              <div className="card-heading">
                <div>
                  <h2>{activePillarStat.label}</h2>
                  <p>Заполни направление своими выводами, вопросами, метриками и задачами.</p>
                </div>
                <div className={activePillarStat.isFilled ? 'growth-score green' : 'growth-score red'}>
                  <strong>{activePillarStat.isFilled ? 'Есть' : 'Пусто'}</strong>
                  <span>данные</span>
                </div>
              </div>

              <div className="pillar-note-editor">
                <label>
                  <span>Описание направления</span>
                  <textarea
                    rows={4}
                    value={activePillarNote.summary}
                    onChange={(event) => updateMarketingPillarNote(activePillar, { summary: event.target.value })}
                    placeholder="Что уже понятно по этому направлению и какие выводы важны для роста"
                  />
                </label>
                <label>
                  <span>Результат / артефакты</span>
                  <textarea
                    rows={4}
                    value={activePillarNote.output}
                    onChange={(event) => updateMarketingPillarNote(activePillar, { output: event.target.value })}
                    placeholder="Что должно появиться на выходе: документ, оффер, скрипт, контент-план, dashboard"
                  />
                </label>
                <label>
                  <span>Контрольные вопросы</span>
                  <textarea
                    rows={5}
                    value={activePillarNote.questionsText}
                    onChange={(event) => updateMarketingPillarNote(activePillar, { questionsText: event.target.value })}
                    placeholder="Каждый вопрос с новой строки"
                  />
                </label>
                <label>
                  <span>Метрики</span>
                  <textarea
                    rows={5}
                    value={activePillarNote.metricsText}
                    onChange={(event) => updateMarketingPillarNote(activePillar, { metricsText: event.target.value })}
                    placeholder="Каждая метрика с новой строки"
                  />
                </label>
              </div>

              <div className="dependency-grid">
                <div>
                  <h3>Связано с</h3>
                  <div className="dependency-list">
                    {activePillarStat.dependsOn.length === 0 ? <span className="muted">Стартовый блок</span> : activePillarStat.dependsOn.map((key) => (
                      <button key={key} onClick={() => setActivePillar(key)} type="button">{pillarByKey[key].label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3>Дальше влияет на</h3>
                  <div className="dependency-list">
                    {activePillarStat.next.map((key) => (
                      <button key={key} onClick={() => setActivePillar(key)} type="button">{pillarByKey[key].label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="content-card growth-backlog">
              <div className="card-heading">
                <div>
                  <h2>Рабочий план</h2>
                  <p>Задачи выбранного направления. Статусы сохраняются в этом браузере.</p>
                </div>
                <span className="tag blue">{activePillarWorkItems.filter((item) => item.status === 'done').length}/{activePillarWorkItems.length}</span>
              </div>

              <div className="work-add-row">
                <input
                  value={newWorkTitle}
                  onChange={(event) => setNewWorkTitle(event.target.value)}
                  placeholder={`Новая задача: ${activePillarStat.label.toLowerCase()}`}
                />
                <select value={newWorkPriority} onChange={(event) => setNewWorkPriority(event.target.value as MarketingWorkPriority)}>
                  {(Object.keys(workPriorityLabel) as MarketingWorkPriority[]).map((priority) => (
                    <option key={priority} value={priority}>{workPriorityLabel[priority]}</option>
                  ))}
                </select>
                <button className="primary-button" onClick={addMarketingWorkItem} type="button">Добавить</button>
              </div>

              <div className="work-list">
                {activePillarWorkItems.length === 0 ? (
                  <span className="muted">Задач в этом блоке пока нет.</span>
                ) : activePillarWorkItems.map((item) => (
                  <article className="work-item" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{workPriorityLabel[item.priority]} приоритет</span>
                    </div>
                    <select value={item.status} onChange={(event) => updateMarketingWorkItem(item.id, { status: event.target.value as MarketingWorkStatus })}>
                      {(Object.keys(workStatusLabel) as MarketingWorkStatus[]).map((status) => (
                        <option key={status} value={status}>{workStatusLabel[status]}</option>
                      ))}
                    </select>
                    <select value={item.priority} onChange={(event) => updateMarketingWorkItem(item.id, { priority: event.target.value as MarketingWorkPriority })}>
                      {(Object.keys(workPriorityLabel) as MarketingWorkPriority[]).map((priority) => (
                        <option key={priority} value={priority}>{workPriorityLabel[priority]}</option>
                      ))}
                    </select>
                    <input type="date" value={item.dueDate} onChange={(event) => updateMarketingWorkItem(item.id, { dueDate: event.target.value })} />
                  </article>
                ))}
              </div>
            </section>

            <section className="content-card growth-gaps">
              <div className="card-heading">
                <div>
                  <h2>Управленческие сигналы</h2>
                  <p>Короткая сводка по тому, что ты уже внес вручную.</p>
                </div>
              </div>

              <div className="signal-grid">
                <article>
                  <span>Следующий шаг</span>
                  <strong>{nextMarketingStep ? nextMarketingStep.title : 'Задач пока нет'}</strong>
                  {nextMarketingStep && <small>{pillarByKey[nextMarketingStep.pillar].label}</small>}
                </article>
                <article>
                  <span>Направления</span>
                  <strong>{filledMarketingPillars}/{marketingPillarStats.length} заполнено</strong>
                  <small>{emptyMarketingPillars.length} еще пустые</small>
                </article>
                <article>
                  <span>Города</span>
                  <strong>{markedCitiesCount} пометок · {cityLoadItems.filter((city) => city.total > 0).length} с пользователями</strong>
                  <small>Открывай «Карта РБ» для нагрузки по городам</small>
                </article>
              </div>

              <div className="gap-list">
                {emptyMarketingPillars.length === 0 ? (
                  <span className="muted">Все направления имеют ручные данные. Можно углублять цели и задачи.</span>
                ) : criticalMarketingGaps.map((gap) => (
                  <button key={gap.key} onClick={() => setActivePillar(gap.key)} type="button">
                    <strong>{gap.label}</strong>
                    <span>Пусто: добавь описание, результат, вопросы, метрики или задачу.</span>
                  </button>
                ))}
              </div>
            </section>
          </section>
        )}

        {viewMode === 'geo' && (
          <section className="geo-workspace">
            <section className="content-card belarus-map-card">
              <div className="card-heading">
                <div>
                  <h2>Карта загрузки по Беларуси</h2>
                  <p>Маркеры показывают пользователей по городам. Масштаб и пометки сохраняют рабочий контекст.</p>
                </div>
                <div className="map-toolbar" aria-label="Управление картой">
                  <button className="secondary-button icon-button" onClick={() => changeBelarusMapZoom(-0.2)} type="button" title="Отдалить">−</button>
                  <span>{Math.round(belarusMapZoom * 100)}%</span>
                  <button className="secondary-button icon-button" onClick={() => changeBelarusMapZoom(0.2)} type="button" title="Приблизить">+</button>
                  <button className="secondary-button" onClick={resetBelarusMapView} type="button">Сброс</button>
                </div>
              </div>

              <div className="belarus-map-shell">
                <div className="belarus-map-stage" aria-label="Карта Республики Беларусь с городами">
                  <svg className="belarus-map-svg" role="img" viewBox="0 0 100 100" aria-label="Карта РБ">
                    <defs>
                      <linearGradient id="belarusMapFill" x1="0" x2="1" y1="0" y2="1">
                        <stop offset="0%" stopColor="#eef6ff" />
                        <stop offset="100%" stopColor="#eaf7ef" />
                      </linearGradient>
                    </defs>
                    <g transform={belarusMapTransform}>
                      <path
                        className="belarus-outline"
                        d="M18 20 L31 14 L43 18 L54 12 L68 16 L80 27 L84 39 L77 49 L85 63 L78 76 L65 82 L55 78 L43 88 L31 82 L19 86 L13 73 L18 61 L12 51 L17 38 L13 29 Z"
                      />
                      <path className="belarus-region-line" d="M31 14 C35 36 36 58 31 82" />
                      <path className="belarus-region-line" d="M54 12 C51 34 52 58 55 78" />
                      <path className="belarus-region-line" d="M17 38 C35 42 56 42 80 27" />
                      <path className="belarus-region-line" d="M18 61 C38 62 61 61 85 63" />
                      {cityLoadItems.map((city) => {
                        const radius = Math.max(2.8, Math.min(8.5, 2.8 + (city.total / maxBelarusCityLoad) * 5.8));
                        const loadTone = city.total === 0
                          ? 'empty'
                          : city.total >= maxBelarusCityLoad * 0.66
                            ? 'high'
                            : city.total >= maxBelarusCityLoad * 0.34
                              ? 'medium'
                              : 'low';
                        const markStatus = city.mark?.status ?? 'none';
                        return (
                          <g
                            className={`belarus-city load-${loadTone} mark-${markStatus} ${selectedBelarusCity === city.city ? 'selected' : ''}`}
                            key={city.city}
                            onClick={() => setSelectedBelarusCity(city.city)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') setSelectedBelarusCity(city.city);
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <title>{city.city}: {city.total} пользователей</title>
                            <circle className="city-halo" cx={city.x} cy={city.y} r={radius + 3} />
                            <circle className="city-dot" cx={city.x} cy={city.y} r={radius} />
                            {city.total > 0 && <text className="city-count" x={city.x} y={city.y + 1.2}>{city.total}</text>}
                            <text className="city-label" x={city.x + radius + 2.4} y={city.y - radius - 1}>{city.city}</text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  <div className="map-pan-controls" aria-label="Сдвиг карты">
                    <button className="secondary-button icon-button" onClick={() => nudgeBelarusMap(0, -5)} type="button" title="Вверх">↑</button>
                    <button className="secondary-button icon-button" onClick={() => nudgeBelarusMap(-5, 0)} type="button" title="Влево">←</button>
                    <button className="secondary-button icon-button" onClick={() => nudgeBelarusMap(5, 0)} type="button" title="Вправо">→</button>
                    <button className="secondary-button icon-button" onClick={() => nudgeBelarusMap(0, 5)} type="button" title="Вниз">↓</button>
                  </div>
                </div>
              </div>
            </section>

            <section className="content-card city-detail-card">
              <div className="card-heading">
                <div>
                  <h2>{selectedCityLoad.city}</h2>
                  <p>{selectedCityLoad.region}</p>
                </div>
                <span className={`city-status-pill ${selectedCityLoad.mark?.status ?? 'none'}`}>
                  {cityMapStatusLabel[selectedCityLoad.mark?.status ?? 'none']}
                </span>
              </div>

              <div className="city-load-metrics">
                <article><span>Всего</span><strong>{selectedCityLoad.total}</strong></article>
                <article><span>По фильтру</span><strong>{selectedCityLoad.filteredTotal}</strong></article>
                <article><span>Активные</span><strong>{selectedCityLoad.active}</strong></article>
                <article><span>Горячие</span><strong>{selectedCityLoad.hot}</strong></article>
                <article><span>Подключены</span><strong>{selectedCityLoad.connected}</strong></article>
              </div>

              <div className="city-mark-form">
                <label>
                  <span>Метка города</span>
                  <select
                    value={selectedCityLoad.mark?.status ?? 'none'}
                    onChange={(event) => updateCityMapMark(selectedCityLoad.city, { status: event.target.value as CityMapStatus })}
                  >
                    {cityMapStatusOptions.map((status) => (
                      <option key={status} value={status}>{cityMapStatusLabel[status]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Заметка</span>
                  <textarea
                    rows={5}
                    value={selectedCityLoad.mark?.note ?? ''}
                    onChange={(event) => updateCityMapMark(selectedCityLoad.city, { note: event.target.value })}
                    placeholder="Что важно по городу: гипотеза, канал, партнеры, ограничения, следующий шаг"
                  />
                </label>
                <div className="city-detail-actions">
                  <button className="primary-button" onClick={() => openCityUsers(selectedCityLoad.city)} type="button">Показать в базе</button>
                  <button className="secondary-button" onClick={() => updateCityMapMark(selectedCityLoad.city, { status: 'none', note: '' })} type="button">Снять метку</button>
                </div>
              </div>
            </section>

            <section className="content-card city-load-card">
              <div className="card-heading">
                <div>
                  <h2>Города и загрузка</h2>
                  <p>Список отсортирован по количеству пользователей.</p>
                </div>
              </div>
              <div className="city-load-list">
                {sortedCityLoadItems.map((city) => {
                  const markStatus = city.mark?.status ?? 'none';
                  return (
                    <button
                      className={selectedBelarusCity === city.city ? 'city-load-row active' : 'city-load-row'}
                      key={city.city}
                      onClick={() => setSelectedBelarusCity(city.city)}
                      type="button"
                    >
                      <span>
                        <strong>{city.city}</strong>
                        <small>{city.region}</small>
                      </span>
                      <b>{city.total}</b>
                      <em className={`city-status-pill ${markStatus}`}>{cityMapStatusLabel[markStatus]}</em>
                    </button>
                  );
                })}
              </div>
              {unknownCityLoads.length > 0 && (
                <div className="unknown-city-list">
                  <strong>Города без координат на карте</strong>
                  {unknownCityLoads.map((item) => <span key={item.city}>{item.city}: {item.count}</span>)}
                </div>
              )}
            </section>
          </section>
        )}

        {viewMode === 'table' && (
          <section className="content-card table-card">
            <div className="card-heading">
              <div>
                <h2>Рабочий список</h2>
                <p>Показано: {sortedUsers.length} из {roleFilteredUsers.length}. Сортировка: {sortModeLabel[sortMode]}</p>
              </div>
              <button className="secondary-button" onClick={refreshUsers} type="button"><span aria-hidden="true">↻</span> Обновить</button>
            </div>
            <div className="role-tabs">
              {roleTabs.map((tab) => (
                <button
                  key={tab.value}
                  className={userRoleTab === tab.value ? 'active' : ''}
                  onClick={() => setUserRoleTab(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="bulk-actions-bar">
              <span>Выбрано: {selectedFilteredUserIds.length}</span>
              <select value={bulkStage} onChange={(event) => setBulkStage(event.target.value as Stage)}>
                {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
              <button className="secondary-button" disabled={loading || selectedFilteredUserIds.length === 0} onClick={() => bulkChangeStage(bulkStage)} type="button">Сменить этап</button>
              <button className="secondary-button" disabled={loading || selectedFilteredUserIds.length === 0} onClick={() => bulkShiftContact(3)} type="button">+3 дня</button>
              <button className="secondary-button" disabled={loading || selectedFilteredUserIds.length === 0} onClick={() => bulkShiftContact(7)} type="button">+7 дней</button>
              <button className="secondary-button" disabled={loading || selectedFilteredUserIds.length === 0} onClick={bulkDeleteUsers} type="button">Удалить выбранных</button>
            </div>
            {sortedUsers.length === 0 ? (
              <EmptyState onCreate={openCreateModal} onDemo={handleLoadDemo} />
            ) : (
              <div className="table-wrap">
                <table className="users-table">
                  <thead>
                    <tr>
                      <th className="select-col">
                        <input checked={allFilteredSelected} onChange={toggleSelectAllFiltered} type="checkbox" />
                      </th>
                      <th>Название / Имя</th>
                      <th>Город</th>
                      <th>Отрасль</th>
                      <th>Сегмент</th>
                      <th>Условия</th>
                      <th>Этап</th>
                      <th>Анкета</th>
                      <th>Score</th>
                      <th>Следующий шаг</th>
                      <th>Дата</th>
                      <th>Приоритет</th>
                      <th>Контакт</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((user) => {
                      const answerCount = getAnswerCount(user.id, user.profile_role);
                      const totalForUserRole = getTotalQuestionsForRole(user.profile_role);
                      const score = leadScore(user, answerCount, totalForUserRole);
                      return (
                        <tr key={user.id} onClick={() => selectUser(user)} className={selected?.id === user.id ? 'selected-row' : ''}>
                          <td className="select-col" onClick={(event) => event.stopPropagation()}>
                            <input
                              checked={selectedUserSet.has(user.id)}
                              onChange={() => toggleUserSelection(user.id)}
                              type="checkbox"
                            />
                          </td>
                          <td><strong>{user.name}</strong><small>{user.source || 'Источник не указан'}</small></td>
                          <td>{user.city}</td>
                          <td>{user.industry}</td>
                          <td><span className={`tag ${user.profile_role === 'map' ? 'blue' : 'purple'}`}>{userRoleLabel[user.profile_role]}</span></td>
                          <td><span className={`tag ${classForTerms(user.terms)}`}>{user.terms}</span></td>
                          <td><span className={`tag ${classForStage(user.stage)}`}>{user.stage}</span></td>
                          <td><span className={answerCount === totalForUserRole && totalForUserRole > 0 ? 'answer-progress done' : 'answer-progress'}>{answerCount}/{totalForUserRole}</span></td>
                          <td><span className={`score-pill ${scoreClass(score)}`}>{score}</span></td>
                          <td>{user.next_step || '—'}</td>
                          <td><span className={isOverdue(user.next_contact_date) ? 'date-bad' : isToday(user.next_contact_date) ? 'date-good' : ''}>{formatDate(user.next_contact_date)}</span></td>
                          <td><span className={`priority ${user.priority}`}>{priorityLabel[user.priority]}</span></td>
                          <td className="contact-cell">{user.contact || '—'}</td>
                          <td>
                            <div className="row-actions">
                              <button onClick={(event) => { event.stopPropagation(); openEditModal(user); }} type="button">Изм.</button>
                              <button onClick={(event) => { event.stopPropagation(); handleDelete(user); }} type="button">Удал.</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {viewMode === 'questions' && (
          <section className="content-card questions-page">
            <div className="card-heading">
              <div>
                <h2>Вопросы для интервью</h2>
                <p>Разделяй вопросы по ролям: для карты, для CRM или общие для всех.</p>
              </div>
              <div className="inline-actions">
                <button className="secondary-button" onClick={refreshQuestionsAndAnswers} type="button">Обновить</button>
                <button className="secondary-button" disabled={loading} onClick={handleLoadDemoQuestions} type="button">Базовые вопросы</button>
                <button className="primary-button" onClick={openCreateQuestionModal} type="button">+ Добавить вопрос</button>
              </div>
            </div>

            <div className="role-tabs">
              {roleTabs.map((tab) => (
                <button
                  key={tab.value}
                  className={questionRoleTab === tab.value ? 'active' : ''}
                  onClick={() => setQuestionRoleTab(tab.value)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="question-stats">
              <MetricMini label="Всего вопросов" value={visibleQuestions.length} />
              <MetricMini label="Активные" value={visibleActiveQuestions.length} />
              <MetricMini label="Обязательные" value={visibleQuestions.filter((question) => question.is_required).length} />
              <MetricMini label="Всего ответов" value={answeredTotal} />
            </div>

            {visibleQuestions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">?</div>
                <h3>Вопросов пока нет</h3>
                <p>Добавь вопросы для выбранного сегмента или загрузи базовый набор.</p>
                <div>
                  <button className="primary-button" onClick={openCreateQuestionModal} type="button">Добавить вопрос</button>
                  <button className="secondary-button" onClick={handleLoadDemoQuestions} type="button">Загрузить базовые</button>
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Порядок</th>
                      <th>Вопрос</th>
                      <th>Категория</th>
                      <th>Сегмент</th>
                      <th>Тип</th>
                      <th>Обяз.</th>
                      <th>Статус</th>
                      <th>Ответов</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleQuestions.map((question) => (
                      <tr key={question.id}>
                        <td>{question.sort_order}</td>
                        <td><strong>{question.text}</strong>{question.options.length > 0 && <small>{question.options.join(' · ')}</small>}</td>
                        <td>{question.category}</td>
                        <td><span className={`tag ${question.target_role === 'all' ? 'gray' : question.target_role === 'map' ? 'blue' : 'purple'}`}>{questionRoleLabel[question.target_role]}</span></td>
                        <td>{questionTypeLabel[question.type]}</td>
                        <td>{question.is_required ? 'Да' : 'Нет'}</td>
                        <td><span className={`tag ${question.is_active ? 'green' : 'gray'}`}>{question.is_active ? 'Активен' : 'Скрыт'}</span></td>
                        <td>{getQuestionAnswerCount(question.id)}</td>
                        <td>
                          <div className="row-actions question-actions">
                            <button
                              disabled={loading || (questionOrderIndex.get(question.id) ?? 0) === 0}
                              onClick={() => moveQuestion(question, -1)}
                              type="button"
                              title="Поднять выше"
                            >
                              ↑
                            </button>
                            <button
                              disabled={loading || (questionOrderIndex.get(question.id) ?? 0) >= questionsSorted.length - 1}
                              onClick={() => moveQuestion(question, 1)}
                              type="button"
                              title="Опустить ниже"
                            >
                              ↓
                            </button>
                            <button disabled={loading} onClick={() => duplicateQuestion(question)} type="button">Копия</button>
                            <button disabled={loading} onClick={() => toggleQuestionActive(question)} type="button">{question.is_active ? 'Скрыть' : 'Вкл.'}</button>
                            <button disabled={loading} onClick={() => openEditQuestionModal(question)} type="button">Изм.</button>
                            <button disabled={loading} onClick={() => handleDeleteQuestion(question)} type="button">Удал.</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {questionCategories.length > 0 && (
              <div className="category-cloud">
                {questionCategories.map((category) => <span key={category}>{category}</span>)}
              </div>
            )}
          </section>
        )}

        {viewMode === 'stages' && (
          <section className="stage-board">
            {STAGES.map((stage) => {
              const stageUsers = filteredUsers.filter((user) => user.stage === stage);
              return (
                <div className="stage-column" key={stage}>
                  <div className="stage-column-head">
                    <span>{stage}</span>
                    <strong>{stageUsers.length}</strong>
                  </div>
                  <div className="stage-column-body">
                    {stageUsers.length === 0 ? <span className="empty-column">Пусто</span> : stageUsers.map((user) => (
                      <article className="stage-card" key={user.id} onClick={() => selectUser(user)}>
                        <strong>{user.name}</strong>
                        <span>{user.city} · {user.industry}</span>
                        <small>{user.terms}</small>
                        {user.next_step && <em>{user.next_step}</em>}
                        <b>Анкета: {getAnswerCount(user.id, user.profile_role)}/{getTotalQuestionsForRole(user.profile_role)}</b>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {viewMode === 'analytics' && (
          <section id="stats-export-area" className="analytics-grid">
            <StagesSummary stages={stages} />
            <StatsPanel title="По городам" data={cityStats} max={maxCity} />
            <StatsPanel title="По отраслям" data={industryStats} max={maxIndustry} />
            <StatsPanel title="По условиям" data={termsStats} max={maxTerms} />
            <QuestionAnalytics users={filteredUsers} questions={visibleActiveQuestions} answers={answers} />
          </section>
        )}

        {viewMode !== 'analytics' && viewMode !== 'questions' && viewMode !== 'growth' && (
          <section id="stats-export-area" className="bottom-grid">
            <StagesSummary stages={stages} />
            <StatsPanel title="По городам" data={cityStats} max={maxCity} />
            <StatsPanel title="По отраслям" data={industryStats} max={maxIndustry} />
          </section>
        )}
      </main>

      {selected && (
        <aside className="details-panel">
          <button className="panel-close" onClick={() => setSelectedUser(null)} type="button" title="Закрыть">×</button>
          <div className="details-head">
            <div>
              <span className="eyebrow">Карточка лида</span>
              <h2>{selected.name}</h2>
            </div>
            <span className={`tag ${classForStage(selected.stage)}`}>{selected.stage}</span>
          </div>
          <div className="lead-summary">
            <div className={`lead-score ${scoreClass(selectedScore)}`}>
              <span>Score</span>
              <strong>{selectedScore}</strong>
            </div>
            <div>
              <span>Интервью</span>
              <strong>{selectedAnswerProgress}%</strong>
              <small>{selectedAnswerCount}/{selectedTotalQuestions} ответов</small>
            </div>
            <div>
              <span>Следующий контакт</span>
              <strong className={isOverdue(selected.next_contact_date) ? 'date-bad' : isToday(selected.next_contact_date) ? 'date-good' : ''}>{formatDate(selected.next_contact_date)}</strong>
              <small>{selected.next_step || 'Шаг не указан'}</small>
            </div>
          </div>
          <dl className="details-list">
            <div><dt>Город</dt><dd>{selected.city}</dd></div>
            <div><dt>Отрасль</dt><dd>{selected.industry}</dd></div>
            <div><dt>Контакт</dt><dd>{selected.contact || '—'}</dd></div>
            <div><dt>Условия</dt><dd>{selected.terms}</dd></div>
            <div><dt>Следующий шаг</dt><dd>{selected.next_step || '—'}</dd></div>
            <div><dt>Дата контакта</dt><dd>{formatDate(selected.next_contact_date)}</dd></div>
            <div><dt>Приоритет</dt><dd>{priorityLabel[selected.priority]}</dd></div>
            <div><dt>Источник</dt><dd>{selected.source || '—'}</dd></div>
            <div><dt>Сегмент</dt><dd>{userRoleLabel[selected.profile_role]}</dd></div>
            <div><dt>Анкета</dt><dd>{selectedAnswerCount}/{selectedTotalQuestions}</dd></div>
            <div><dt>Score</dt><dd><span className={`score-pill ${scoreClass(selectedScore)}`}>{selectedScore}</span></dd></div>
          </dl>

          <div className="details-actions">
            <button className="primary-button" onClick={() => openEditModal(selected)} type="button"><span aria-hidden="true">✎</span> Редактировать</button>
            <button className="secondary-button" onClick={() => handleDelete(selected)} type="button"><span aria-hidden="true">×</span> Удалить</button>
          </div>

          <section className="mini-section">
            <h3>Ответы на вопросы</h3>
            {selectedQuestions.length === 0 ? (
              <div className="answers-empty">
                <p>Вопросов пока нет. Открой страницу «Вопросы» и добавь список для интервью.</p>
                <button className="secondary-button" type="button" onClick={() => { setViewMode('questions'); setSelectedUser(null); }}>Открыть вопросы</button>
              </div>
            ) : (
              <div className="answers-form">
                {selectedQuestions.map((question) => (
                  <QuestionAnswerField
                    key={question.id}
                    question={question}
                    value={answerDrafts[question.id] ?? ''}
                    onChange={(value) => setAnswerDrafts((current) => ({ ...current, [question.id]: value }))}
                  />
                ))}
                <button className="primary-button wide" disabled={loading} onClick={handleSaveAnswers} type="button">{loading ? 'Сохраняю...' : 'Сохранить ответы'}</button>
              </div>
            )}
          </section>

          <section className="mini-section">
            <h3>Быстро сменить этап</h3>
            <div className="stage-buttons">
              {STAGES.map((stage) => (
                <button className={selected.stage === stage ? 'active' : ''} key={stage} onClick={() => handleStageQuickChange(selected, stage)} type="button">{stage}</button>
              ))}
            </div>
          </section>

          <section className="mini-section">
            <h3>План контакта</h3>
            <div className="schedule-chips">
              <button onClick={() => rescheduleNextContact(selected, 1)} type="button">+1 день</button>
              <button onClick={() => rescheduleNextContact(selected, 3)} type="button">+3 дня</button>
              <button onClick={() => rescheduleNextContact(selected, 7)} type="button">+7 дней</button>
              <button onClick={() => rescheduleNextContact(selected, 14)} type="button">+14 дней</button>
            </div>
          </section>

          <section className="mini-section">
            <h3>Заметки</h3>
            <p>{selected.notes || 'Заметок пока нет.'}</p>
          </section>

          <section className="mini-section">
            <h3>История</h3>
            <div className="timeline">
              {events.length === 0 ? <span className="muted">История появится после действий с карточкой.</span> : events.map((event) => (
                <div className="timeline-item" key={event.id}>
                  <strong>{event.title}</strong>
                  <span>{formatDateTime(event.created_at)}</span>
                  {event.note && <p>{event.note}</p>}
                </div>
              ))}
            </div>
          </section>
        </aside>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="user-modal" onSubmit={handleSubmit}>
            <div className="modal-head">
              <div>
                <h2>{editing ? 'Редактировать пользователя' : 'Добавить пользователя'}</h2>
                <p>Заполни основные данные, условия и следующий шаг.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)}>×</button>
            </div>

            <div className="form-grid">
              <label>Название / имя<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
              <label>Город<input list="city-list" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} required /></label>
              <label>Отрасль<input list="industry-list" value={form.industry} onChange={(event) => setForm({ ...form, industry: event.target.value })} required /></label>
              <label>Сегмент<select value={form.profile_role} onChange={(event) => setForm({ ...form, profile_role: event.target.value as UserRole })}>
                <option value="map">Пользователи карты</option>
                <option value="crm">Пользователи CRM</option>
              </select></label>
              <label>Контакт<input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} placeholder="@telegram / телефон / email" /></label>
              <label>Условия<input list="terms-list" value={form.terms} onChange={(event) => setForm({ ...form, terms: event.target.value })} required /></label>
              <label>Этап<select value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value as Stage })}>{STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label>
              <label>Следующий шаг<input value={form.next_step} onChange={(event) => setForm({ ...form, next_step: event.target.value })} placeholder="Позвонить / отправить условия / подключить" /></label>
              <label>Дата контакта<input type="date" value={form.next_contact_date} onChange={(event) => setForm({ ...form, next_contact_date: event.target.value })} /></label>
              <label>Приоритет<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as Priority })}>{PRIORITIES.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label>
              <label>Источник<input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Telegram / Instagram / рекомендация" /></label>
              <label className="wide-field">Комментарий<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={4} /></label>
            </div>

            <datalist id="city-list">{cityOptions.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="industry-list">{industryOptions.map((item) => <option key={item} value={item} />)}</datalist>
            <datalist id="terms-list">{termsOptions.map((item) => <option key={item} value={item} />)}</datalist>

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setModalOpen(false)}>Отмена</button>
              <button className="primary-button" disabled={loading} type="submit">{loading ? 'Сохраняю...' : 'Сохранить'}</button>
            </div>
          </form>
        </div>
      )}

      {questionModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="user-modal question-modal" onSubmit={handleQuestionSubmit}>
            <div className="modal-head">
              <div>
                <h2>{editingQuestion ? 'Редактировать вопрос' : 'Добавить вопрос'}</h2>
                <p>Эти вопросы будут доступны в карточке каждого пользователя.</p>
              </div>
              <button type="button" onClick={() => setQuestionModalOpen(false)}>×</button>
            </div>

            <div className="form-grid">
              <label className="wide-field">Текст вопроса<textarea value={questionForm.text} onChange={(event) => setQuestionForm({ ...questionForm, text: event.target.value })} rows={3} required /></label>
              <label>Категория<input value={questionForm.category} onChange={(event) => setQuestionForm({ ...questionForm, category: event.target.value })} placeholder="Боль клиента / Условия / Возражения" /></label>
              <label>Сегмент<select value={questionForm.target_role} onChange={(event) => setQuestionForm({ ...questionForm, target_role: event.target.value as QuestionTargetRole })}>
                <option value="all">Для всех</option>
                <option value="map">Только карта</option>
                <option value="crm">Только CRM</option>
              </select></label>
              <label>Тип ответа<select value={questionForm.type} onChange={(event) => setQuestionForm({ ...questionForm, type: event.target.value as QuestionType })}>
                <option value="short_text">Короткий ответ</option>
                <option value="long_text">Развёрнутый ответ</option>
                <option value="number">Число</option>
                <option value="yes_no">Да / Нет</option>
                <option value="single_choice">Выбор варианта</option>
              </select></label>
              <label>Порядок<input type="number" value={questionForm.sort_order} onChange={(event) => setQuestionForm({ ...questionForm, sort_order: Number(event.target.value) })} /></label>
              <label className="checkbox-card"><input checked={questionForm.is_required} onChange={(event) => setQuestionForm({ ...questionForm, is_required: event.target.checked })} type="checkbox" /> Обязательный вопрос</label>
              <label className="checkbox-card"><input checked={questionForm.is_active} onChange={(event) => setQuestionForm({ ...questionForm, is_active: event.target.checked })} type="checkbox" /> Показывать в карточках</label>
              {questionForm.type === 'single_choice' && (
                <label className="wide-field">Варианты ответа<textarea value={questionForm.optionsText} onChange={(event) => setQuestionForm({ ...questionForm, optionsText: event.target.value })} rows={3} placeholder="Бесплатно 1 месяц, Пониженный прайс, Готовы платить сразу" /></label>
              )}
            </div>

            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setQuestionModalOpen(false)}>Отмена</button>
              <button className="primary-button" disabled={loading} type="submit">{loading ? 'Сохраняю...' : 'Сохранить вопрос'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number | string; icon: string; tone?: 'warning' }) {
  return (
    <article className={`metric-card ${tone ?? ''}`}>
      <div className="metric-icon" aria-hidden="true">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function MetricMini({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric-mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function StagesSummary({ stages }: { stages: Record<Stage, number> }) {
  return (
    <section className="content-card stages-summary">
      <h2>Этапы</h2>
      <div className="stage-summary-grid">
        {STAGES.map((stage) => (
          <div className={`stage-summary-item ${classForStage(stage)}`} key={stage}>
            <span>{stage}</span>
            <strong>{stages[stage]}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatsPanel({ title, data, max }: { title: string; data: Array<{ name: string; count: number }>; max: number }) {
  return (
    <section className="content-card stats-panel">
      <h2>{title}</h2>
      <div className="bar-list">
        {data.length === 0 ? <span className="muted">Нет данных</span> : data.map((item) => (
          <div className="bar-row" key={item.name}>
            <span>{item.name}</span>
            <div className="bar-track"><div style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} /></div>
            <strong>{item.count}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionAnalytics({ users, questions, answers }: { users: EarlyUser[]; questions: MarketingQuestion[]; answers: UserAnswer[] }) {
  const max = Math.max(users.length, 1);
  return (
    <section className="content-card stats-panel question-analytics">
      <h2>Заполнение вопросов</h2>
      <div className="bar-list">
        {questions.length === 0 ? <span className="muted">Вопросы ещё не добавлены</span> : questions.map((question) => {
          const count = answers.filter((answer) => answer.question_id === question.id && answer.answer_text?.trim()).length;
          return (
            <div className="bar-row question-row" key={question.id}>
              <span title={question.text}>{question.text}</span>
              <div className="bar-track"><div style={{ width: `${Math.max(8, (count / max) * 100)}%` }} /></div>
              <strong>{count}/{users.length}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuestionAnswerField({ question, value, onChange }: { question: MarketingQuestion; value: string; onChange: (value: string) => void }) {
  return (
    <label className="answer-field">
      <span>{question.text}{question.is_required && <em>*</em>}</span>
      <small>{question.category} · {questionTypeLabel[question.type]}</small>
      {question.type === 'long_text' && <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} />}
      {question.type === 'short_text' && <input value={value} onChange={(event) => onChange(event.target.value)} />}
      {question.type === 'number' && <input type="number" value={value} onChange={(event) => onChange(event.target.value)} />}
      {question.type === 'yes_no' && (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Не указано</option>
          <option value="Да">Да</option>
          <option value="Нет">Нет</option>
          <option value="Не уверен">Не уверен</option>
        </select>
      )}
      {question.type === 'single_choice' && (
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Не выбрано</option>
          {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
    </label>
  );
}

function EmptyState({ onCreate, onDemo }: { onCreate: () => void; onDemo: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">＋</div>
      <h3>Пока нет пользователей</h3>
      <p>Добавь первого раннего пользователя или загрузи демо-данные, чтобы посмотреть как работает система.</p>
      <div>
        <button className="primary-button" onClick={onCreate} type="button">Добавить</button>
        <button className="secondary-button" onClick={onDemo} type="button">Загрузить демо</button>
      </div>
    </div>
  );
}
