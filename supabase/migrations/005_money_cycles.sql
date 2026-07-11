-- ============================================================
-- Invest-OS — Migration 005: دورات الكاش (تفتحها بمبلغ وتقفلها بمزاجك)
-- نفّذها في Supabase SQL Editor مرة واحدة
--
-- بتشيل فكرة «المحفظة الدائمة» اللي عملتها قبل كده (كانت بتلخبط الحساب)
-- وتستبدلها بـ «دورة»: تبدأها بمبلغ، تسجل دخل/مصاريف/سدادات فيها،
-- وتقفلها وقت ما تحب (حتى لو بالسالب) — وبعدها تبدأ دورة جديدة من الصفر.
-- ============================================================

drop table if exists wallet;

create table money_cycles (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open','closed')),
  opening_amount numeric not null default 0,
  opening_currency text not null default 'EGP' check (opening_currency in ('EGP','AED')),
  note text
);

alter table transactions add column cycle_id uuid references money_cycles(id) on delete set null;
alter table debt_payments add column cycle_id uuid references money_cycles(id) on delete set null;

alter table money_cycles enable row level security;

create policy "authenticated_all" on money_cycles
  for all to authenticated using (true) with check (true);
