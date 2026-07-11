export type Settings = {
  id: number;
  eg_target: number;
  ae_target: number;
  eg_exposure_cap: number;
  eg_money_market_target: number;
  eg_equity_target: number;
  expected_yield_eg: number;
  expected_yield_ae: number;
  rules: unknown;
  updated_at: string;
};

export type Country = 'EG' | 'AE';
export type Currency = 'EGP' | 'AED';

export type AssetClass =
  | 'money_market'
  | 'fixed_income'
  | 'equity'
  | 'sector'
  | 'diversified';

export const ASSET_CLASS_AR: Record<string, string> = {
  money_market: 'نقدي / سيولة',
  fixed_income: 'دخل ثابت',
  equity: 'أسهم',
  gold: 'ذهب',
  sector: 'قطاعي',
  diversified: 'متنوع',
};

export const COUNTRY_AR: Record<Country, string> = {
  EG: 'مصر',
  AE: 'الإمارات',
};

export type Fund = {
  id: string;
  name: string;
  country: Country;
  platform: string | null;
  asset_class: string | null;
  is_active: boolean;
};

export type Deposit = {
  id: string;
  date: string;
  fund_id: string;
  amount: number;
  currency: Currency;
  aed_egp_rate: number | null;
  nav: number | null;
  units: number | null;
  reason: string | null;
  created_at: string;
};

export type Valuation = {
  id: string;
  fund_id: string;
  date: string;
  current_value: number;
  currency: string | null;
};

export type FxRow = {
  date: string;
  aed_egp: number;
};

export type MonthlyReview = {
  id: string;
  month: string;
  market_summary: string | null;
  decision: string | null;
  d_star: number | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

// ============ إدارة الفلوس ============

export type Person = {
  id: string;
  name: string;
  note: string | null;
  is_active: boolean;
  created_at: string;
};

export type DebtDirection = 'on_me' | 'to_me';

export type DebtRow = {
  id: string;
  person_id: string;
  direction: DebtDirection;
  title: string | null;
  principal: number;
  currency: Currency;
  note: string | null;
  status: 'open' | 'settled';
  started_on: string | null;
  created_at: string;
};

export type DebtPayment = {
  id: string;
  debt_id: string;
  date: string;
  amount: number;
  method: string | null;
  note: string | null;
  cycle_id: string | null;
  created_at: string;
};

// دورة كاش: تبدأها بمبلغ وتقفلها بمزاجك (مش شرط تتصفر ولا مرتبطة بالشهر)
export type MoneyCycle = {
  id: string;
  started_at: string;
  closed_at: string | null;
  status: 'open' | 'closed';
  opening_amount: number;
  opening_currency: Currency;
  note: string | null;
};

export type Transaction = {
  id: string;
  date: string;
  type: 'income' | 'expense';
  category: string | null;
  description: string | null;
  amount: number;
  currency: Currency;
  cycle_id: string | null;
  created_at: string;
};
