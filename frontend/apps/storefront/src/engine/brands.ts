import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { templatesDir } from './template-package';

/**
 * Logos of couriers and payment operators at checkout (official files in templates/_shared/brands, sources and licences
 * in docs/BRAND_ASSETS.md). A brand without a file is shown by name only — we never draw look-alike logos.
 */
const NAMES: Record<string, string> = {
  inpost: 'InPost', dpd: 'DPD', dhl: 'DHL', gls: 'GLS', ups: 'UPS', poczta: 'Poczta Polska', orlen: 'ORLEN Paczka', fedex: 'FedEx',
  stripe: 'Stripe', przelewy24: 'Przelewy24', payu: 'PayU', tpay: 'Tpay', blik: 'BLIK', visa: 'Visa', mastercard: 'Mastercard',
  googlepay: 'Google Pay', applepay: 'Apple Pay', meest: 'Meest', fake: 'Symulator',
};

export const BRANDS_URL = '/_shop/brands';

export function brandsDir(root: string | null = templatesDir()): string | null {
  const dir = root ? join(root, '_shared', 'brands') : null;
  return dir && existsSync(dir) ? dir : null;
}

let files: Map<string, string> | null = null;

function logoFiles(): Map<string, string> {
  if (!files) {
    files = new Map();
    const dir = brandsDir();
    for (const f of dir ? readdirSync(dir) : []) {
      const m = /^([a-z0-9]+)\.(svg|png|jpg|webp)$/.exec(f);
      if (m) files.set(m[1], f);
    }
  }
  return files;
}

export interface TplBrand { code: string; name: string; logo: string | null; }

/** A brand code from the API (inpost, przelewy24…) → what a template shows; null for none or an unsafe code. */
export function toBrand(code: string | null | undefined): TplBrand | null {
  if (!code || !/^[a-z0-9_-]{2,30}$/.test(code)) return null;
  const file = logoFiles().get(code);
  return { code, name: NAMES[code] ?? code.toUpperCase(), logo: file ? `${BRANDS_URL}/${file}` : null };
}
