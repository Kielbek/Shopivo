import { describe, expect, it } from 'vitest';
import { isValidNip } from './create-store.page';

describe('isValidNip', () => {
  it('accepts valid numbers with or without separators', () => {
    expect(isValidNip('5260001246')).toBe(true);
    expect(isValidNip('526-000-12-46')).toBe(true);
    expect(isValidNip('526 000 12 46')).toBe(true);
  });

  it('rejects a wrong checksum, wrong length and letters', () => {
    expect(isValidNip('5260001247')).toBe(false);
    expect(isValidNip('526000124')).toBe(false);
    expect(isValidNip('52600012a6')).toBe(false);
  });
});
