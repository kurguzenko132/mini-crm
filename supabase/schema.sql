-- PilotBase database schema for Supabase
-- Выполни файл в Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.early_users (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  profile_role text not null default 'crm' check (profile_role in ('map', 'crm')),
  name text not null check (length(trim(name)) > 0),
  city text not null check (length(trim(city)) > 0),
  industry text not null check (length(trim(industry)) > 0),
  contact text,
  terms text not null check (length(trim(terms)) > 0),
  stage text not null check (stage in (
    'Найден', 'Связались', 'Интерес есть', 'Отправлены условия', 'Переговоры', 'Согласован',
    'Подключение', 'Подключён', 'Активно пользуется', 'Пауза', 'Отказ', 'Архив'
  )),
  next_step text,
  next_contact_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  source text,
  notes text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.early_user_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  early_user_id uuid not null references public.early_users(id) on delete cascade,
  type text not null default 'note' check (type in ('created', 'updated', 'stage_changed', 'note', 'contact', 'deleted')),
  title text not null check (length(trim(title)) > 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.marketing_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  target_role text not null default 'all' check (target_role in ('all', 'map', 'crm')),
  text text not null check (length(trim(text)) > 0),
  category text not null default 'Общее',
  type text not null default 'long_text' check (type in ('short_text', 'long_text', 'number', 'yes_no', 'single_choice')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_question_answers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  early_user_id uuid not null references public.early_users(id) on delete cascade,
  question_id uuid not null references public.marketing_questions(id) on delete cascade,
  answer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (early_user_id, question_id)
);

-- Keep schema idempotent for old deployments where these columns did not exist yet.
alter table if exists public.early_users add column if not exists profile_role text;
alter table if exists public.early_users alter column profile_role set default 'crm';
update public.early_users set profile_role = coalesce(nullif(trim(profile_role), ''), 'crm');
alter table if exists public.early_users alter column profile_role set not null;
alter table if exists public.early_users drop constraint if exists early_users_profile_role_check;
alter table if exists public.early_users add constraint early_users_profile_role_check check (profile_role in ('map', 'crm'));

alter table if exists public.marketing_questions add column if not exists target_role text;
alter table if exists public.marketing_questions alter column target_role set default 'all';
update public.marketing_questions set target_role = coalesce(nullif(trim(target_role), ''), 'all');
alter table if exists public.marketing_questions alter column target_role set not null;
alter table if exists public.marketing_questions drop constraint if exists marketing_questions_target_role_check;
alter table if exists public.marketing_questions add constraint marketing_questions_target_role_check check (target_role in ('all', 'map', 'crm'));

alter table if exists public.early_users alter column owner_id drop not null;
alter table if exists public.early_user_events alter column owner_id drop not null;
alter table if exists public.marketing_questions alter column owner_id drop not null;
alter table if exists public.user_question_answers alter column owner_id drop not null;

create index if not exists early_users_owner_id_idx on public.early_users(owner_id);
create index if not exists early_users_profile_role_idx on public.early_users(profile_role);
create index if not exists early_users_stage_idx on public.early_users(stage);
create index if not exists early_users_city_idx on public.early_users(city);
create index if not exists early_users_industry_idx on public.early_users(industry);
create index if not exists early_users_next_contact_idx on public.early_users(next_contact_date);
create index if not exists early_user_events_owner_id_idx on public.early_user_events(owner_id);
create index if not exists early_user_events_user_id_idx on public.early_user_events(early_user_id);
create index if not exists marketing_questions_owner_id_idx on public.marketing_questions(owner_id);
create index if not exists marketing_questions_target_role_idx on public.marketing_questions(target_role);
create index if not exists marketing_questions_active_idx on public.marketing_questions(is_active);
create index if not exists user_question_answers_owner_id_idx on public.user_question_answers(owner_id);
create index if not exists user_question_answers_user_id_idx on public.user_question_answers(early_user_id);
create index if not exists user_question_answers_question_id_idx on public.user_question_answers(question_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_early_users_updated_at on public.early_users;
create trigger set_early_users_updated_at
before update on public.early_users
for each row execute function public.set_updated_at();

drop trigger if exists set_marketing_questions_updated_at on public.marketing_questions;
create trigger set_marketing_questions_updated_at
before update on public.marketing_questions
for each row execute function public.set_updated_at();

drop trigger if exists set_user_question_answers_updated_at on public.user_question_answers;
create trigger set_user_question_answers_updated_at
before update on public.user_question_answers
for each row execute function public.set_updated_at();

alter table public.early_users enable row level security;
alter table public.early_user_events enable row level security;
alter table public.marketing_questions enable row level security;
alter table public.user_question_answers enable row level security;

-- Public workspace mode: everyone (anon + authenticated) works in one common base.
drop policy if exists "early_users_select_own" on public.early_users;
drop policy if exists "early_users_insert_own" on public.early_users;
drop policy if exists "early_users_update_own" on public.early_users;
drop policy if exists "early_users_delete_own" on public.early_users;
drop policy if exists "early_user_events_select_own" on public.early_user_events;
drop policy if exists "early_user_events_insert_own" on public.early_user_events;
drop policy if exists "early_user_events_update_own" on public.early_user_events;
drop policy if exists "early_user_events_delete_own" on public.early_user_events;
drop policy if exists "marketing_questions_select_own" on public.marketing_questions;
drop policy if exists "marketing_questions_insert_own" on public.marketing_questions;
drop policy if exists "marketing_questions_update_own" on public.marketing_questions;
drop policy if exists "marketing_questions_delete_own" on public.marketing_questions;
drop policy if exists "user_question_answers_select_own" on public.user_question_answers;
drop policy if exists "user_question_answers_insert_own" on public.user_question_answers;
drop policy if exists "user_question_answers_update_own" on public.user_question_answers;
drop policy if exists "user_question_answers_delete_own" on public.user_question_answers;

drop policy if exists "early_users_select_shared" on public.early_users;
drop policy if exists "early_users_insert_shared" on public.early_users;
drop policy if exists "early_users_update_shared" on public.early_users;
drop policy if exists "early_users_delete_shared" on public.early_users;
drop policy if exists "early_user_events_select_shared" on public.early_user_events;
drop policy if exists "early_user_events_insert_shared" on public.early_user_events;
drop policy if exists "early_user_events_update_shared" on public.early_user_events;
drop policy if exists "early_user_events_delete_shared" on public.early_user_events;
drop policy if exists "marketing_questions_select_shared" on public.marketing_questions;
drop policy if exists "marketing_questions_insert_shared" on public.marketing_questions;
drop policy if exists "marketing_questions_update_shared" on public.marketing_questions;
drop policy if exists "marketing_questions_delete_shared" on public.marketing_questions;
drop policy if exists "user_question_answers_select_shared" on public.user_question_answers;
drop policy if exists "user_question_answers_insert_shared" on public.user_question_answers;
drop policy if exists "user_question_answers_update_shared" on public.user_question_answers;
drop policy if exists "user_question_answers_delete_shared" on public.user_question_answers;

create policy "early_users_select_shared" on public.early_users for select to anon, authenticated using (true);
create policy "early_users_insert_shared" on public.early_users for insert to anon, authenticated with check (true);
create policy "early_users_update_shared" on public.early_users for update to anon, authenticated using (true) with check (true);
create policy "early_users_delete_shared" on public.early_users for delete to anon, authenticated using (true);

create policy "early_user_events_select_shared" on public.early_user_events for select to anon, authenticated using (true);
create policy "early_user_events_insert_shared" on public.early_user_events for insert to anon, authenticated with check (
  exists (select 1 from public.early_users eu where eu.id = early_user_id)
);
create policy "early_user_events_update_shared" on public.early_user_events for update to anon, authenticated using (true) with check (
  exists (select 1 from public.early_users eu where eu.id = early_user_id)
);
create policy "early_user_events_delete_shared" on public.early_user_events for delete to anon, authenticated using (true);

create policy "marketing_questions_select_shared" on public.marketing_questions for select to anon, authenticated using (true);
create policy "marketing_questions_insert_shared" on public.marketing_questions for insert to anon, authenticated with check (true);
create policy "marketing_questions_update_shared" on public.marketing_questions for update to anon, authenticated using (true) with check (true);
create policy "marketing_questions_delete_shared" on public.marketing_questions for delete to anon, authenticated using (true);

create policy "user_question_answers_select_shared" on public.user_question_answers for select to anon, authenticated using (true);
create policy "user_question_answers_insert_shared" on public.user_question_answers for insert to anon, authenticated with check (
  exists (select 1 from public.early_users eu where eu.id = early_user_id)
  and exists (select 1 from public.marketing_questions mq where mq.id = question_id)
);
create policy "user_question_answers_update_shared" on public.user_question_answers for update to anon, authenticated using (true) with check (
  exists (select 1 from public.early_users eu where eu.id = early_user_id)
  and exists (select 1 from public.marketing_questions mq where mq.id = question_id)
);
create policy "user_question_answers_delete_shared" on public.user_question_answers for delete to anon, authenticated using (true);
