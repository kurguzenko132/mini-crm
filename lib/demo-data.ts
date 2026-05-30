import type { EarlyUserInput, MarketingQuestionInput } from './types';

function localDateStamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const today = new Date();

export const demoUsers: EarlyUserInput[] = [
  {
    name: 'Barber Pro',
    city: 'Минск',
    industry: 'Барбершоп',
    contact: '@barberpro',
    terms: 'Бесплатно 2 месяца',
    stage: 'Подключён',
    next_step: 'Настроить аккаунт и проверить карточку компании',
    next_contact_date: localDateStamp(today),
    priority: 'high',
    source: 'Telegram',
    notes: 'Готовы тестировать до запуска. Важно показать простое онлайн-бронирование.',
    is_archived: false,
  },
  {
    name: 'Beauty Line',
    city: 'Гомель',
    industry: 'Салон красоты',
    contact: '@beautyline',
    terms: '-50% на 3 месяца',
    stage: 'Интерес есть',
    next_step: 'Отправить условия и примеры экранов',
    next_contact_date: localDateStamp(today),
    priority: 'medium',
    source: 'Instagram',
    notes: 'Заинтересованы, но хотят понять, как будет работать запись клиентов.',
    is_archived: false,
  },
  {
    name: 'AutoClean',
    city: 'Брест',
    industry: 'Автомойка',
    contact: '@autoclean',
    terms: 'Бесплатно',
    stage: 'Связались',
    next_step: 'Позвонить завтра и уточнить график',
    next_contact_date: localDateStamp(addDays(today, 1)),
    priority: 'medium',
    source: 'Рекомендация',
    notes: 'Есть потребность в учете записей на мойку.',
    is_archived: false,
  },
  {
    name: 'FitLab',
    city: 'Гродно',
    industry: 'Фитнес',
    contact: '@fitlab',
    terms: 'Индивидуально',
    stage: 'Согласован',
    next_step: 'Подключить и выдать доступ',
    next_contact_date: localDateStamp(addDays(today, 2)),
    priority: 'high',
    source: 'Личный контакт',
    notes: 'Нужна возможность вести тренеров и расписание.',
    is_archived: false,
  },
  {
    name: 'Coffee Point',
    city: 'Витебск',
    industry: 'Кафе',
    contact: '@coffeepoint',
    terms: '-30%',
    stage: 'Найден',
    next_step: 'Первый контакт',
    next_contact_date: '',
    priority: 'low',
    source: 'Google Maps',
    notes: 'Подходит для пилота в сегменте общепита.',
    is_archived: false,
  },
  {
    name: 'Style Hub',
    city: 'Минск',
    industry: 'Салон красоты',
    contact: '@stylehub',
    terms: 'Бесплатно 1 месяц',
    stage: 'Отправлены условия',
    next_step: 'Написать повторно',
    next_contact_date: localDateStamp(addDays(today, -1)),
    priority: 'high',
    source: 'Instagram',
    notes: 'Хороший кандидат для кейса перед запуском.',
    is_archived: false,
  },
  {
    name: 'Detail Car',
    city: 'Могилёв',
    industry: 'Автосервис',
    contact: '@detailcar',
    terms: 'Обычный прайс',
    stage: 'Пауза',
    next_step: 'Вернуться через неделю',
    next_contact_date: localDateStamp(addDays(today, 7)),
    priority: 'low',
    source: 'Холодный контакт',
    notes: 'Сейчас нет времени на подключение.',
    is_archived: false,
  },
];


export const demoQuestions: MarketingQuestionInput[] = [
  {
    text: 'Какую главную проблему сейчас должен решить сервис для вашего бизнеса?',
    category: 'Боль клиента',
    type: 'long_text',
    optionsText: '',
    is_required: true,
    is_active: true,
    sort_order: 10,
  },
  {
    text: 'Чем сейчас пользуетесь для записи клиентов и учета?',
    category: 'Текущий процесс',
    type: 'long_text',
    optionsText: '',
    is_required: true,
    is_active: true,
    sort_order: 20,
  },
  {
    text: 'Сколько клиентов в среднем приходит в месяц?',
    category: 'Размер бизнеса',
    type: 'number',
    optionsText: '',
    is_required: false,
    is_active: true,
    sort_order: 30,
  },
  {
    text: 'Готовы ли вы протестировать сервис до официального запуска?',
    category: 'Готовность к пилоту',
    type: 'yes_no',
    optionsText: '',
    is_required: true,
    is_active: true,
    sort_order: 40,
  },
  {
    text: 'Какие условия для старта вам подходят?',
    category: 'Условия',
    type: 'single_choice',
    optionsText: 'Бесплатно 1 месяц, Бесплатно 2 месяца, Пониженный прайс, Индивидуальные условия, Готовы платить сразу',
    is_required: true,
    is_active: true,
    sort_order: 50,
  },
  {
    text: 'Какая функция была бы самой ценной в первый месяц?',
    category: 'Функции',
    type: 'long_text',
    optionsText: '',
    is_required: false,
    is_active: true,
    sort_order: 60,
  },
  {
    text: 'Что может помешать вам начать пользоваться сервисом?',
    category: 'Возражения',
    type: 'long_text',
    optionsText: '',
    is_required: false,
    is_active: true,
    sort_order: 70,
  },
  {
    text: 'Можно ли использовать ваш бизнес как публичный кейс после запуска?',
    category: 'Кейс / отзыв',
    type: 'yes_no',
    optionsText: '',
    is_required: false,
    is_active: true,
    sort_order: 80,
  },
];
