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
