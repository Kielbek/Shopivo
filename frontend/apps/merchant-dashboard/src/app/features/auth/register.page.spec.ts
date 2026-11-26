import { describe, expect, it } from 'vitest';
import { passwordStrength } from './register.page';

describe('passwordStrength', () => {
  it('guides from empty to strong', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('krotkie').label).toContain('Za krótkie');
    expect(passwordStrength('abcdefghij').score).toBe(2);
    expect(passwordStrength('Abcdefgh12').score).toBe(3);
    expect(passwordStrength('kot lubi mleko w niedziele').score).toBe(4);
  });
});
