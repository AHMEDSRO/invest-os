// كل الأرقام تتعرض بأرقام إنجليزية
export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtAED(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${fmtNum(n, digits)} AED`;
}

export function fmtEGP(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${fmtNum(n, digits)} EGP`;
}

export function fmtMoney(n: number | null | undefined, currency: string, digits = 0): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${fmtNum(n, digits)} ${currency}`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${(n * 100).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
