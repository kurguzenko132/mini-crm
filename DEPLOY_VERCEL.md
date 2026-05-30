# Деплой PilotBase на Vercel

## 0. Установка зависимостей

Используй **npm ci**, а не `npm i`:

```bash
npm ci
```

Если `npm i` или `npm ci` долго висит:

```bash
rm -rf node_modules .next
npm cache verify
npm ci --no-audit --no-fund --prefer-offline
```

Если проблема из-за сети/VPN:

```bash
npm config set registry https://registry.npmjs.org/
npm ci --no-audit --no-fund
```

## 1. Подготовь Supabase

1. Создай проект в Supabase.
2. Открой **SQL Editor**.
3. Для новой базы выполни весь файл:

```sql
supabase/schema.sql
```

Если старая версия PilotBase уже была развернута, выполни только:

```sql
supabase/marketing_questions_migration.sql
```

4. Открой **Project Settings → API**.
5. Скопируй:
   - Project URL
   - anon public key

## 2. Залей проект в GitHub

```bash
cd pilotbase
git init
git add .
git commit -m "Initial PilotBase release"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pilotbase.git
git push -u origin main
```

## 3. Импортируй проект в Vercel

1. Открой Vercel.
2. Нажми **Add New → Project**.
3. Выбери GitHub-репозиторий `pilotbase`.
4. Framework Preset должен определиться как **Next.js**.
5. Build Command оставь:

```bash
next build
```

6. Install Command можно явно поставить:

```bash
npm ci
```

7. Output Directory оставь пустым / default.

## 4. Добавь переменные окружения в Vercel

В проекте Vercel открой **Settings → Environment Variables** и добавь для **Production**, **Preview** и **Development**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_NAME=PilotBase
```

После добавления переменных сделай **Redeploy**.

## 5. Настрой Auth URL в Supabase

После первого деплоя Vercel даст домен вида:

```text
https://pilotbase.vercel.app
```

В Supabase открой:

```text
Authentication → URL Configuration
```

Поставь:

```text
Site URL: https://pilotbase.vercel.app
```

В **Redirect URLs** добавь:

```text
https://pilotbase.vercel.app/**
http://localhost:3000/**
```

Если подключишь свой домен, добавь его тоже:

```text
https://yourdomain.com/**
```

## 6. Быстрая проверка после деплоя

1. Открой сайт на Vercel.
2. Зарегистрируй аккаунт.
3. Зайди в dashboard.
4. Нажми **Загрузить демо**.
5. Открой **Вопросы**.
6. Нажми **Базовые вопросы**.
7. Открой карточку пользователя и заполни ответы.
8. Проверь:
   - добавление пользователя;
   - редактирование;
   - смену этапа;
   - страницу вопросов;
   - сохранение ответов в карточке;
   - поиск;
   - фильтры;
   - экспорт CSV/JSON;
   - экспорт CSV ответов;
   - экспорт статистики PNG.

## 7. Если регистрация просит подтверждение почты

Для быстрого теста можно временно выключить подтверждение email в Supabase:

```text
Authentication → Providers → Email → Confirm email выключить
```

Для продакшена лучше оставить подтверждение email включённым и правильно настроить Site URL / Redirect URLs.

## 8. Частые проблемы

### Ошибка: Supabase env variables are missing

Проверь, что в Vercel добавлены:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

После добавления обязательно сделай Redeploy.

### После регистрации перебрасывает не туда

Проверь в Supabase:

```text
Authentication → URL Configuration → Site URL / Redirect URLs
```

### Таблица пустая

Это нормально для нового аккаунта. Нажми **Загрузить демо** или добавь пользователя вручную.

### Вопросы пустые

Открой страницу **Вопросы** и нажми **Базовые вопросы** или добавь свои вопросы вручную.

### Ответы не сохраняются

Проверь, что выполнен новый `supabase/schema.sql` или миграция `supabase/marketing_questions_migration.sql`.

### Данные не сохраняются

Проверь, что SQL выполнен полностью и RLS-политики созданы.
