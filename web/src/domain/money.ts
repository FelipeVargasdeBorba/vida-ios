export type Currency = 'EUR' | 'BRL' | 'USD' | 'GBP';

export const CURRENCIES: { code: Currency; title: string }[] = [
  { code: 'EUR', title: 'Euro (€)' },
  { code: 'BRL', title: 'Real (R$)' },
  { code: 'USD', title: 'Dólar (US$)' },
  { code: 'GBP', title: 'Libra (£)' },
];

/** Idioma das telas: o do aparelho se for português, senão pt-PT. */
export const locale: string = (() => {
  const l = typeof navigator !== 'undefined' ? navigator.language : 'pt-PT';
  return l.toLowerCase().startsWith('pt') ? l : 'pt-PT';
})();

const formatters = new Map<Currency, Intl.NumberFormat>();

/** Dinheiro é sempre inteiro em centavos. Aqui só formatação e leitura de texto. */
export function formatMoney(cents: number, currency: Currency): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: 'currency', currency });
    formatters.set(currency, f);
  }
  return f.format(cents / 100);
}

/** Texto editável sem símbolo, ex.: 1250 → "12,50". */
export function plainMoney(cents: number, decimal = ','): string {
  const sign = cents < 0 ? '-' : '';
  const v = Math.abs(cents);
  const frac = v % 100;
  return `${sign}${Math.floor(v / 100)}${decimal}${frac < 10 ? '0' : ''}${frac}`;
}

/** Lê "12,50", "12.5", "1.234,56" ou "1,234.56". O último separador com 1–2 dígitos depois é o decimal. */
export function parseCents(raw: string): number | null {
  const s = [...raw].filter((c) => /[0-9.,]/.test(c)).join('');
  if (!/[0-9]/.test(s)) return null;
  const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const digits = (t: string) => t.replace(/[^0-9]/g, '');
  if (lastSep < 0) return Number(s) * 100;
  const fracDigits = digits(s.slice(lastSep + 1));
  const intDigits = digits(s.slice(0, lastSep));
  if (fracDigits.length > 2) return Number(digits(s)) * 100;
  const whole = Number(intDigits || '0');
  let frac = Number(fracDigits || '0');
  if (fracDigits.length === 1) frac *= 10;
  return whole * 100 + frac;
}
