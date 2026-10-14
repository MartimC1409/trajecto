import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { configureForStrictCsp } from './csp';

describe('configureForStrictCsp', () => {
  it('desliga a compilação com new Function no zod e a validação continua a funcionar', () => {
    configureForStrictCsp();
    expect(z.config().jitless).toBe(true);
    expect(z.object({ a: z.number() }).safeParse({ a: 1 }).success).toBe(true);
  });
});
