-- ============================================================
-- Миграция: переход с app_data (один JSONB на лист) 
--           на app_sheet_rows (одна строка Excel = одна запись)
-- Выполните в Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Создаём новую таблицу
create table if not exists public.app_sheet_rows (
  id         bigserial primary key,
  sheet_name text      not null,
  row_data   jsonb     not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 2. Индекс для быстрой фильтрации по sheet_name
create index if not exists app_sheet_rows_sheet_idx
  on public.app_sheet_rows (sheet_name);

-- 3. RLS
alter table public.app_sheet_rows enable row level security;

drop policy if exists "Allow anon read rows"   on public.app_sheet_rows;
drop policy if exists "Allow anon write rows"  on public.app_sheet_rows;

create policy "Allow anon read rows"
  on public.app_sheet_rows for select to anon using (true);

create policy "Allow anon write rows"
  on public.app_sheet_rows for all to anon
  using (true) with check (true);

-- 4. Миграция: переносим данные из старой таблицы app_data → app_sheet_rows
--    (если app_data уже содержит данные)
insert into public.app_sheet_rows (sheet_name, row_data)
select
  sheet_name,
  jsonb_array_elements(data) as row_data
from public.app_data
where sheet_name in ('visits', 'bonuses', 'contracts', 'recipes', 'uvk')
  and jsonb_typeof(data) = 'array'
  and data != '[]'::jsonb
on conflict do nothing;
