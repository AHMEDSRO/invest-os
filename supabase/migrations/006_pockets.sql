-- ============================================================
-- Invest-OS — Migration 006: نظام الجيبتين (مصر × الإمارات)
-- نفّذها في Supabase SQL Editor مرة واحدة
--
-- بيشيل فكرة «الدورة» (money_cycles) اللي كانت بتوحّد كل حاجة برقم واحد،
-- ويستبدلها بمنطق جيبتين منفصلتين مربوطتين بعملية «تحويل» صريحة —
-- زي ما بيحصل فعليًا: دخل بالدرهم في الإمارات، تحويل جزء منه لمصر،
-- ومصاريف كل بلد بتتخصم من جيبتها هي بس.
-- ============================================================

-- شيل الدورات القديمة
alter table transactions drop column if exists cycle_id;
alter table debt_payments drop column if exists cycle_id;
drop table if exists money_cycles;

-- نوع الحركة يقبل دلوقتي تحويل داخل/خارج كمان
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('income','expense','transfer_out','transfer_in'));

-- بيربط حركتي التحويل (خصم من الإمارات + إضافة لمصر) ببعض كعملية واحدة
alter table transactions add column if not exists transfer_group uuid;

-- الالتزامات الشهرية الثابتة (إيجار، أقساط...) — قايمة مرجعية منفصلة عن سجل الحركات
create table monthly_obligations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric not null,
  currency text not null check (currency in ('EGP','AED')),
  due_day int,
  is_active boolean default true,
  last_paid_month text,              -- 'YYYY-MM' لو اتدفع الشهر ده، وإلا null
  created_at timestamptz default now()
);

alter table monthly_obligations enable row level security;

create policy "authenticated_all" on monthly_obligations
  for all to authenticated using (true) with check (true);
