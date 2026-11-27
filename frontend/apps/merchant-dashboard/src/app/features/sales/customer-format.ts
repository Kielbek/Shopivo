import { Customer } from '@shopivo/shared-models';

/** Full name, or the e-mail when the customer has no name. */
export function customerName(c: Pick<Customer, 'firstName' | 'lastName' | 'email'>): string {
  return `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || c.email;
}

let regions: Intl.DisplayNames | null = null;

/** Polish name of an ISO country code ("PL" → "Polska"); the code itself when unknown. */
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  try {
    regions ??= new Intl.DisplayNames(['pl'], { type: 'region' });
    return regions.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** Countries offered in the address form (most common for Polish shops first). */
export const COUNTRY_CODES = ['PL', 'DE', 'CZ', 'SK', 'LT', 'UA', 'AT', 'NL', 'FR', 'GB', 'IE', 'IT', 'ES', 'SE', 'DK', 'NO', 'BE', 'HU', 'RO', 'US'];
