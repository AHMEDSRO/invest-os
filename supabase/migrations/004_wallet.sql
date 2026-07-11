-- ============================================================
-- Invest-OS — Migration 004: المحفظة (رصيد موحّد بالجنيه، بيتحدث لحظيًا)
-- نفّذها في Supabase SQL Editor مرة واحدة
-- ============================================================

create table wallet (
  id int primary key default 1 check (id = 1),
  balance numeric not null default 0,
  currency text not null default 'EGP' check (currency in ('EGP','AED')),
  updated_at timestamptz default now()
);

alter table wallet enable row level security;

create policy "authenticated_all" on wallet
  for all to authenticated using (true) with check (true);

insert into wallet (id) values (1);
