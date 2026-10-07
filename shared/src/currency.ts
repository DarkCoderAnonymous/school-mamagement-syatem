/**
 * Currencies a school can run in, chosen when it registers.
 *
 * Only currencies with TWO minor digits: money is stored as integer minor
 * units everywhere, and typed amounts are converted with ×100 (web
 * `toMinorUnits`, mobile `parseMoney`). A zero-decimal currency (JPY) or a
 * three-decimal one (KWD, OMR, BHD) would be shown 100× or 10× wrong, so they
 * stay off this list until minor-unit handling is per-currency.
 */
export const SCHOOL_CURRENCIES = [
  { code: 'PKR', name: 'Pakistani rupee' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'SAR', name: 'Saudi riyal' },
  { code: 'QAR', name: 'Qatari riyal' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'BDT', name: 'Bangladeshi taka' },
  { code: 'LKR', name: 'Sri Lankan rupee' },
  { code: 'NPR', name: 'Nepalese rupee' },
  { code: 'AFN', name: 'Afghan afghani' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'TRY', name: 'Turkish lira' },
  { code: 'EGP', name: 'Egyptian pound' },
  { code: 'NGN', name: 'Nigerian naira' },
  { code: 'KES', name: 'Kenyan shilling' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AUD', name: 'Australian dollar' },
] as const;

export type SchoolCurrency = (typeof SCHOOL_CURRENCIES)[number]['code'];

export const SCHOOL_CURRENCY_CODES = SCHOOL_CURRENCIES.map((c) => c.code) as [SchoolCurrency, ...SchoolCurrency[]];

/** What a school runs in when nothing was chosen — existing schools, older clients. */
export const DEFAULT_SCHOOL_CURRENCY: SchoolCurrency = 'USD';
