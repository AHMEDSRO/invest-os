-- ============================================================
-- Invest-OS — Migration أولية (Schema + RLS + Seed)
-- شغّل الملف ده مرة واحدة في Supabase SQL Editor
-- ============================================================

-- ===================== الجداول =====================

-- الاستراتيجية والإعدادات (صف واحد)
create table settings (
  id int primary key default 1 check (id = 1),
  eg_target numeric default 0.70,        -- وزن مصر المستهدف
  ae_target numeric default 0.30,
  eg_exposure_cap numeric default 0.80,  -- سقف التعرض لمصر
  eg_money_market_target numeric default 0.60,  -- داخل مصر
  eg_equity_target numeric default 0.40,
  expected_yield_eg numeric default 0.22,
  expected_yield_ae numeric default 0.05,
  rules jsonb default '[]',
  updated_at timestamptz default now()
);

create table funds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text check (country in ('EG','AE')),
  platform text,                          -- Thndr / Sarwa / StashAway
  asset_class text,                       -- money_market | fixed_income | equity | sector | diversified
  is_active boolean default true
);

create table deposits (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  fund_id uuid references funds(id),
  amount numeric not null,
  currency text check (currency in ('EGP','AED')),
  aed_egp_rate numeric,                   -- سعر الصرف يوم الإيداع
  nav numeric, units numeric,
  reason text,
  created_at timestamptz default now()
);

create table valuations (                 -- تحديث قيمة كل حيازة (يدوي شهريًا)
  id uuid primary key default gen_random_uuid(),
  fund_id uuid references funds(id),
  date date not null,
  current_value numeric not null,
  currency text
);

create table fx_history (
  date date primary key,
  aed_egp numeric not null
);

create table monthly_reviews (            -- خلاصة كل جلسة شهرية
  id uuid primary key default gen_random_uuid(),
  month text not null,                    -- '2026-07'
  market_summary text,                    -- فائدة المركزي، EGX30، الجنيه...
  decision text,                          -- قرار الشهر وسببه
  d_star numeric,                         -- نقطة التعادل المحسوبة
  created_at timestamptz default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  role text check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

-- ===================== RLS =====================
-- المستخدم المسجّل (authenticated) فقط يقرأ ويكتب

alter table settings enable row level security;
alter table funds enable row level security;
alter table deposits enable row level security;
alter table valuations enable row level security;
alter table fx_history enable row level security;
alter table monthly_reviews enable row level security;
alter table chat_messages enable row level security;

create policy "authenticated_all" on settings
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on funds
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on deposits
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on valuations
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on fx_history
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on monthly_reviews
  for all to authenticated using (true) with check (true);
create policy "authenticated_all" on chat_messages
  for all to authenticated using (true) with check (true);

-- ===================== Seed أولي =====================

insert into settings (id) values (1);

insert into funds (name, country, platform, asset_class) values
  ('صندوق ثاندر النقدي (سيولة بالجنيه)', 'EG', 'Thndr', 'money_market'),
  ('صندوق أسهم مصري (عبر ثاندر)',        'EG', 'Thndr', 'equity'),
  ('محفظة Sarwa متنوعة (بالدرهم)',       'AE', 'Sarwa', 'diversified');
