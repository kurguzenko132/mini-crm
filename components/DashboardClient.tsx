'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  QuestionType,
  Stage,
  UserAnswer,
} from '@/lib/types';
import { createClient } from '@/lib/supabase/browser';

type Props = {
  initialUsers: EarlyUser[];
  initialQuestions: MarketingQuestion[];
  initialAnswers: UserAnswer[];
  initialError: string | null;
  userEmail: string;
};

type ViewMode = 'table' | 'stages' | 'analytics' | 'questions';

const viewModeLabel: Record<ViewMode, string> = {
  table: 'Пользователи',
  stages: 'Воронка',
  analytics: 'Аналитика',
  questions: 'Интервью',
};

const viewModeDescription: Record<ViewMode, string> = {
  table: 'Отслеживание первых клиентов перед запуском компании',
  stages: 'Доска этапов по всей маркетинговой воронке',
  analytics: 'Метрики по каналам, сегментам и качеству интервью',
  questions: 'Единый список вопросов, которые нужно узнать у каждого клиента',
};

const navigationItems: Array<{ mode: ViewMode; label: string }> = [
  { mode: 'table', label: 'Пользователи' },
  { mode: 'questions', label: 'Интервью' },
  { mode: 'stages', label: 'Воронка' },
  { mode: 'analytics', label: 'Аналитика' },
];

const emptyInput: EarlyUserInput = {
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
  text: '',
  category: 'Общее',
  type: 'long_text',
  optionsText: '',
  is_required: false,
  is_active: true,
  sort_order: 10,
};

const priorityLabel: Record<Priority, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
};

const questionTypeLabel: Record<QuestionType, string> = {
  short_text: 'Короткий ответ',
  long_text: 'Развёрнутый ответ',
  number: 'Число',
  yes_no: 'Да / Нет',
  single_choice: 'Выбор варианта',
};

function normalizeInput(input: EarlyUserInput) {
  return {
    ...input,
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

function getInitials(email: string) {
  const part = email.split('@')[0] || 'PB';
  return part.slice(0, 2).toUpperCase();
}

function escapeCsv(value: string | number | null | undefined) {
  const text = String(value ?? '');
  if (/[";\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export default function DashboardClient({ initialUsers, initialQuestions, initialAnswers, initialError, userEmail }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const selectionRequestRef = useRef(0);
  const selectedUserIdRef = useRef<string | null>(null);
  const [users, setUsers] = useState<EarlyUser[]>(initialUsers);
  const [events, setEvents] = useState<EarlyUserEvent[]>([]);
  const [questions, setQuestions] = useState<MarketingQuestion[]>(initialQuestions);
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
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [filters, setFilters] = useState<Filters>({
    search: '',
    city: '',
    industry: '',
    terms: '',
    stage: '',
    priority: '',
    onlyToday: false,
  });

  const filteredUsers = useMemo(() => filterUsers(users, filters), [users, filters]);
  const metrics = useMemo(() => dashboardMetrics(users), [users]);
  const stages = useMemo(() => stageCounts(users), [users]);
  const cityStats = useMemo(() => topCounts(users, 'city', 7), [users]);
  const industryStats = useMemo(() => topCounts(users, 'industry', 7), [users]);
  const termsStats = useMemo(() => topCounts(users, 'terms', 7), [users]);
  const activeQuestions = useMemo(
    () => questions.filter((question) => question.is_active).sort((a, b) => a.sort_order - b.sort_order),
    [questions],
  );
  const activeQuestionIds = useMemo(() => new Set(activeQuestions.map((question) => question.id)), [activeQuestions]);
  const questionCategories = useMemo(() => uniqueSorted(questions.map((question) => question.category)), [questions]);
  const todayUsers = useMemo(
    () => users
      .filter((user) => !user.is_archived && !['Отказ', 'Архив'].includes(user.stage))
      .filter((user) => isToday(user.next_contact_date) || isOverdue(user.next_contact_date))
      .sort((a, b) => (a.next_contact_date ?? '').localeCompare(b.next_contact_date ?? '')),
    [users],
  );
  const answerStats = useMemo(() => {
    const byUserQuestion = new Map<string, string>();
    const byQuestion = new Map<string, number>();
    const byUserActive = new Map<string, number>();
    let totalAnswered = 0;

    for (const answer of answers) {
      const answerText = answer.answer_text ?? '';
      byUserQuestion.set(`${answer.early_user_id}:${answer.question_id}`, answerText);

      if (!answerText.trim()) continue;

      totalAnswered += 1;
      byQuestion.set(answer.question_id, (byQuestion.get(answer.question_id) ?? 0) + 1);
      if (activeQuestionIds.has(answer.question_id)) {
        byUserActive.set(answer.early_user_id, (byUserActive.get(answer.early_user_id) ?? 0) + 1);
      }
    }

    return { byUserQuestion, byQuestion, byUserActive, totalAnswered };
  }, [answers, activeQuestionIds]);

  const cityOptions = useMemo(() => uniqueSorted([...DEFAULT_CITIES, ...users.map((user) => user.city)]), [users]);
  const industryOptions = useMemo(() => uniqueSorted([...DEFAULT_INDUSTRIES, ...users.map((user) => user.industry)]), [users]);
  const termsOptions = useMemo(() => uniqueSorted([...CONDITIONS, ...users.map((user) => user.terms)]), [users]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function getAnswer(userId: string, questionId: string) {
    return answerStats.byUserQuestion.get(`${userId}:${questionId}`) ?? '';
  }

  function getAnswerCount(userId: string) {
    return answerStats.byUserActive.get(userId) ?? 0;
  }

  function getQuestionAnswerCount(questionId: string) {
    return answerStats.byQuestion.get(questionId) ?? 0;
  }

  function buildAnswerDrafts(userId: string, sourceAnswers = answers) {
    return activeQuestions.reduce<Record<string, string>>((acc, question) => {
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
    setUsers((data ?? []) as EarlyUser[]);
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
    setQuestions((questionsResult.data ?? []) as MarketingQuestion[]);
    setAnswers((answersResult.data ?? []) as UserAnswer[]);
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
    setQuestionForm({ ...emptyQuestionInput, sort_order: (questions.length + 1) * 10 });
    setQuestionModalOpen(true);
  }

  function openEditQuestionModal(question: MarketingQuestion) {
    setEditingQuestion(question);
    setQuestionForm({
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
    setAnswerDrafts(buildAnswerDrafts(user.id));
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
        const updated = data as EarlyUser;
        setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
        setSelected((current) => (current?.id === updated.id ? updated : current));
        await addEvent(updated.id, oldStage !== updated.stage ? `Этап изменён: ${oldStage} → ${updated.stage}` : 'Карточка обновлена', oldStage !== updated.stage ? 'stage_changed' : 'updated');
        if (selected?.id === updated.id) await loadEvents(updated.id);
      } else {
        const { data, error } = await supabase
          .from('early_users')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;
        const created = data as EarlyUser;
        setUsers((current) => [created, ...current]);
        setSelectedUser(created);
        setAnswerDrafts(buildAnswerDrafts(created.id));
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
        const updated = data as MarketingQuestion;
        setQuestions((current) => current.map((question) => (question.id === updated.id ? updated : question)));
      } else {
        const { data, error } = await supabase
          .from('marketing_questions')
          .insert(payload)
          .select('*')
          .single();

        if (error) throw error;
        const created = data as MarketingQuestion;
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

  async function handleDeleteQuestion(question: MarketingQuestion) {
    const ok = confirm(`Удалить вопрос «${question.text}»? Ответы по этому вопросу тоже удалятся.`);
    if (!ok) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('marketing_questions').delete().eq('id', question.id);
      if (error) throw error;
      setQuestions((current) => current.filter((item) => item.id !== question.id));
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
    const updated = data as MarketingQuestion;
    setQuestions((current) => current.map((item) => (item.id === updated.id ? updated : item)));
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
    const updated = data as EarlyUser;
    setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)));
    setSelected((current) => (current?.id === user.id ? updated : current));
    await addEvent(user.id, `Этап изменён: ${user.stage} → ${stage}`, 'stage_changed');
    if (selected?.id === user.id) await loadEvents(user.id);
  }

  async function handleSaveAnswers() {
    if (!selected) return;
    if (activeQuestions.length === 0) {
      setNotice('Сначала добавь вопросы на странице «Вопросы».');
      return;
    }
    const missingRequired = activeQuestions.filter((question) => question.is_required && !answerDrafts[question.id]?.trim());
    if (missingRequired.length > 0) {
      const missingPreview = missingRequired.slice(0, 2).map((question) => `«${question.text}»`).join(', ');
      const suffix = missingRequired.length > 2 ? ` и ещё ${missingRequired.length - 2}` : '';
      setNotice(`Заполни обязательные вопросы: ${missingPreview}${suffix}.`);
      return;
    }

    setLoading(true);
    try {
      const rows = activeQuestions.map((question) => ({
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
      setAnswers((current) => [...current.filter((answer) => answer.early_user_id !== selected.id), ...saved]);
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
      const created = (data ?? []) as EarlyUser[];
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
      const created = (data ?? []) as MarketingQuestion[];
      setQuestions((current) => [...current, ...created].sort((a, b) => a.sort_order - b.sort_order));
      setNotice('Базовые маркетинговые вопросы добавлены.');
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Не удалось добавить вопросы.');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  function exportCsv() {
    downloadTextFile(`pilotbase-users-${localDateStamp()}.csv`, usersToCsv(filteredUsers), 'text/csv;charset=utf-8');
  }

  function exportJson() {
    downloadTextFile(`pilotbase-users-${localDateStamp()}.json`, JSON.stringify(filteredUsers, null, 2), 'application/json;charset=utf-8');
  }

  function exportAnswersCsv() {
    const header = ['Пользователь', 'Город', 'Отрасль', 'Условия', 'Этап', ...activeQuestions.map((question) => question.text)];
    const rows = filteredUsers.map((user) => [
      user.name,
      user.city,
      user.industry,
      user.terms,
      user.stage,
      ...activeQuestions.map((question) => getAnswer(user.id, question.id)),
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\n');
    downloadTextFile(`pilotbase-answers-${localDateStamp()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  async function exportStatsPng() {
    const element = document.getElementById('stats-export-area');
    if (!element) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(element, { backgroundColor: '#080b12', scale: 2 });
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `pilotbase-stats-${localDateStamp()}.png`;
    link.click();
  }

  const maxCity = Math.max(...cityStats.map((item) => item.count), 1);
  const maxIndustry = Math.max(...industryStats.map((item) => item.count), 1);
  const maxTerms = Math.max(...termsStats.map((item) => item.count), 1);
  const answeredTotal = answerStats.totalAnswered;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">P</div>
          <div>
            <span>PilotBase</span>
            <small>Marketing cockpit</small>
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
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{getInitials(userEmail)}</div>
          <div className="sidebar-user">
            <strong>{userEmail}</strong>
            <span>Администратор</span>
          </div>
          <button className="ghost-icon" onClick={handleLogout} title="Выйти" type="button">↗</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>{viewModeLabel[viewMode]}</h1>
            <p>{viewModeDescription[viewMode]}</p>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <span>⌕</span>
              <input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Поиск по имени, городу, отрасли, заметкам" />
            </div>
            {viewMode === 'questions' ? (
              <button className="primary-button" onClick={openCreateQuestionModal} type="button">+ Добавить вопрос</button>
            ) : (
              <button className="primary-button" onClick={openCreateModal} type="button">+ Добавить пользователя</button>
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
          <MetricCard label="Всего пользователей" value={metrics.total} icon="👥" />
          <MetricCard label="Бесплатно" value={metrics.free} icon="🎁" />
          <MetricCard label="Пониженный прайс" value={metrics.discounted} icon="🏷" />
          <MetricCard label="Подключены" value={metrics.connected} icon="✓" />
          <MetricCard label="Вопросы / ответы" value={`${activeQuestions.length}/${answeredTotal}`} icon="❔" tone="warning" />
        </section>

        {viewMode !== 'questions' && (
          <>
            <section className="filters-card">
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
              <label className="checkbox-filter">
                <input checked={filters.onlyToday} onChange={(event) => updateFilter('onlyToday', event.target.checked)} type="checkbox" />
                Только сегодня
              </label>
              <button className="secondary-button" type="button" onClick={() => setFilters({ search: '', city: '', industry: '', terms: '', stage: '', priority: '', onlyToday: false })}>Сбросить</button>
            </section>

            <section className="quick-panel">
              <div>
                <h2>Сегодня нужно связаться</h2>
                <p>Показывает задачи на сегодня и просроченные контакты.</p>
              </div>
              <div className="quick-list">
                {todayUsers.length === 0 ? <span className="muted">Нет срочных контактов</span> : todayUsers.slice(0, 4).map((user) => (
                  <button className={isOverdue(user.next_contact_date) ? 'quick-item overdue' : 'quick-item'} key={user.id} onClick={() => selectUser(user)} type="button">
                    <strong>{user.name}</strong>
                    <span>{user.city} · {user.next_step || 'Следующий шаг не указан'} · {formatDate(user.next_contact_date)}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        <div className="view-switch">
          {navigationItems.map((item) => (
            <button
              key={item.mode}
              className={viewMode === item.mode ? 'active' : ''}
              onClick={() => setViewMode(item.mode)}
              type="button"
            >
              {item.label}
            </button>
          ))}
          <div className="export-actions">
            <button className="secondary-button" onClick={exportCsv} type="button">CSV</button>
            <button className="secondary-button" onClick={exportAnswersCsv} type="button">CSV ответы</button>
            <button className="secondary-button" onClick={exportJson} type="button">JSON</button>
            <button className="secondary-button" onClick={exportStatsPng} type="button">PNG статистики</button>
            <button className="secondary-button" disabled={loading} onClick={handleLoadDemo} type="button">Загрузить демо</button>
          </div>
        </div>

        {viewMode === 'table' && (
          <section className="content-card table-card">
            <div className="card-heading">
              <div>
                <h2>Список пользователей</h2>
                <p>Найдено: {filteredUsers.length} из {users.length}</p>
              </div>
              <button className="secondary-button" onClick={refreshUsers} type="button">Обновить</button>
            </div>
            {filteredUsers.length === 0 ? (
              <EmptyState onCreate={openCreateModal} onDemo={handleLoadDemo} />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Название / Имя</th>
                      <th>Город</th>
                      <th>Отрасль</th>
                      <th>Условия</th>
                      <th>Этап</th>
                      <th>Анкета</th>
                      <th>Следующий шаг</th>
                      <th>Дата</th>
                      <th>Приоритет</th>
                      <th>Контакт</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => {
                      const answerCount = getAnswerCount(user.id);
                      return (
                        <tr key={user.id} onClick={() => selectUser(user)} className={selected?.id === user.id ? 'selected-row' : ''}>
                          <td><strong>{user.name}</strong><small>{user.source || 'Источник не указан'}</small></td>
                          <td>{user.city}</td>
                          <td>{user.industry}</td>
                          <td><span className={`tag ${classForTerms(user.terms)}`}>{user.terms}</span></td>
                          <td><span className={`tag ${classForStage(user.stage)}`}>{user.stage}</span></td>
                          <td><span className={answerCount === activeQuestions.length && activeQuestions.length > 0 ? 'answer-progress done' : 'answer-progress'}>{answerCount}/{activeQuestions.length}</span></td>
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
                <p>Создай список вопросов один раз, а ответы заполняй в карточке каждого пользователя.</p>
              </div>
              <div className="inline-actions">
                <button className="secondary-button" onClick={refreshQuestionsAndAnswers} type="button">Обновить</button>
                <button className="secondary-button" disabled={loading} onClick={handleLoadDemoQuestions} type="button">Базовые вопросы</button>
                <button className="primary-button" onClick={openCreateQuestionModal} type="button">+ Добавить вопрос</button>
              </div>
            </div>

            <div className="question-stats">
              <MetricMini label="Всего вопросов" value={questions.length} />
              <MetricMini label="Активные" value={activeQuestions.length} />
              <MetricMini label="Обязательные" value={questions.filter((question) => question.is_required).length} />
              <MetricMini label="Всего ответов" value={answeredTotal} />
            </div>

            {questions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">?</div>
                <h3>Вопросов пока нет</h3>
                <p>Добавь свои вопросы или загрузи базовый набор для маркетинговых интервью.</p>
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
                      <th>Тип</th>
                      <th>Обяз.</th>
                      <th>Статус</th>
                      <th>Ответов</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((question) => (
                      <tr key={question.id}>
                        <td>{question.sort_order}</td>
                        <td><strong>{question.text}</strong>{question.options.length > 0 && <small>{question.options.join(' · ')}</small>}</td>
                        <td>{question.category}</td>
                        <td>{questionTypeLabel[question.type]}</td>
                        <td>{question.is_required ? 'Да' : 'Нет'}</td>
                        <td><span className={`tag ${question.is_active ? 'green' : 'gray'}`}>{question.is_active ? 'Активен' : 'Скрыт'}</span></td>
                        <td>{getQuestionAnswerCount(question.id)}</td>
                        <td>
                          <div className="row-actions question-actions">
                            <button onClick={() => toggleQuestionActive(question)} type="button">{question.is_active ? 'Скрыть' : 'Вкл.'}</button>
                            <button onClick={() => openEditQuestionModal(question)} type="button">Изм.</button>
                            <button onClick={() => handleDeleteQuestion(question)} type="button">Удал.</button>
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
                        <b>Анкета: {getAnswerCount(user.id)}/{activeQuestions.length}</b>
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
            <QuestionAnalytics users={users} questions={activeQuestions} answers={answers} />
          </section>
        )}

        {viewMode !== 'analytics' && viewMode !== 'questions' && (
          <section id="stats-export-area" className="bottom-grid">
            <StagesSummary stages={stages} />
            <StatsPanel title="По городам" data={cityStats} max={maxCity} />
            <StatsPanel title="По отраслям" data={industryStats} max={maxIndustry} />
          </section>
        )}
      </main>

      {selected && (
        <aside className="details-panel">
          <button className="panel-close" onClick={() => setSelectedUser(null)} type="button">×</button>
          <div className="details-head">
            <h2>{selected.name}</h2>
            <span className={`tag ${classForStage(selected.stage)}`}>{selected.stage}</span>
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
            <div><dt>Анкета</dt><dd>{getAnswerCount(selected.id)}/{activeQuestions.length}</dd></div>
          </dl>

          <div className="details-actions">
            <button className="primary-button" onClick={() => openEditModal(selected)} type="button">Редактировать</button>
            <button className="secondary-button" onClick={() => handleDelete(selected)} type="button">Удалить</button>
          </div>

          <section className="mini-section">
            <h3>Ответы на вопросы</h3>
            {activeQuestions.length === 0 ? (
              <div className="answers-empty">
                <p>Вопросов пока нет. Открой страницу «Вопросы» и добавь список для интервью.</p>
                <button className="secondary-button" type="button" onClick={() => { setViewMode('questions'); setSelectedUser(null); }}>Открыть вопросы</button>
              </div>
            ) : (
              <div className="answers-form">
                {activeQuestions.map((question) => (
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
      <div className="metric-icon">{icon}</div>
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
