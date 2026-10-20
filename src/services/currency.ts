import type { CurrencyCode } from '../types';

/** Multi-currency support — Egyptian Pound first, plus USD and SAR. */
export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  labelAr: string;
  /** VAT rate applied by the accounting profile for this selection. */
  vatRate: number;
  vatLabel: string;
  authorityAr: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  EGP: {
    code: 'EGP',
    symbol: 'ج.م',
    labelAr: 'الجنيه المصري (EGP)',
    vatRate: 0.14,
    vatLabel: 'ضريبة القيمة المضافة 14% — قانون 67/2016',
    authorityAr: 'مصلحة الضرائب المصرية (ETA) — الفاتورة الإلكترونية',
  },
  USD: {
    code: 'USD',
    symbol: '$',
    labelAr: 'الدولار الأمريكي (USD)',
    vatRate: 0.14,
    vatLabel: 'عرض بالدولار مع امتثال مصري: ق.م 14%',
    authorityAr: 'معايير المحاسبة المصرية + مصلحة الضرائب (ETA)',
  },
  SAR: {
    code: 'SAR',
    symbol: 'ر.س',
    labelAr: 'الريال السعودي (SAR)',
    vatRate: 0.15,
    vatLabel: 'ضريبة القيمة المضافة 15%',
    authorityAr: 'هيئة الزكاة والضريبة والجمارك (ZATCA)',
  },
};

export const CURRENCY_STORAGE_KEY = 'chatterbots_currency_code';

export function loadStoredCurrency(): CurrencyCode {
  try {
    const v = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return v === 'USD' || v === 'SAR' || v === 'EGP' ? v : 'EGP';
  } catch {
    return 'EGP';
  }
}

export function storeCurrency(code: CurrencyCode): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  } catch {
    /* storage unavailable */
  }
}

/** Format an amount in the selected currency using Egyptian Arabic numerals. */
export function formatMoney(amount: number, code: CurrencyCode): string {
  try {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('ar-EG')} ${CURRENCIES[code].symbol}`;
  }
}
