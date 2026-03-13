-- ============================================================
-- Кастомная авторизация: username + password (без Supabase Auth)
-- Выполните в Supabase Dashboard → SQL Editor
-- ============================================================

-- Если старая таблица с привязкой к auth.users существует — удаляем
drop table if exists public.user_profiles cascade;

-- Таблица пользователей (полностью независимая)
create table public.user_profiles (
  id         uuid primary key default gen_random_uuid(),
  username   text unique not null,
  full_name  text not null default '',
  password   text not null,
  role       text not null default 'user' check (role in ('admin', 'user')),
  -- Пустой массив = доступ ко всем регионам/группам
  allowed_regions text[] not null default '{}',
  allowed_groups  text[] not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.user_profiles enable row level security;

-- Анонимный ключ может читать (нужно для проверки логина)
drop policy if exists "Allow anon read" on public.user_profiles;
create policy "Allow anon read"
  on public.user_profiles for select
  to anon
  using (true);

-- Анонимный ключ может вставлять/обновлять/удалять (фронтенд сам проверяет роль)
drop policy if exists "Allow anon write" on public.user_profiles;
create policy "Allow anon write"
  on public.user_profiles for all
  to anon
  using (true)
  with check (true);

-- Триггер: обновлять updated_at
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_user_profiles_updated on public.user_profiles;
create trigger on_user_profiles_updated
  before update on public.user_profiles
  for each row execute function public.handle_updated_at();

-- ============================================================
-- Первый администратор (Фаррух / 900)
-- ============================================================
insert into public.user_profiles (username, full_name, password, role)
values ('Фаррух', 'Фаррух', '900', 'admin')
on conflict (username) do nothing;
