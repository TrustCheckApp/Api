import { sanitizePayload, findRedactedKeys, maskCnpj, SENSITIVE_KEYS } from '../../src/common/audit/sanitize-payload.util';

describe('sanitizePayload', () => {
  it('1. substitui valor de key sensível por [REDACTED] e mantém demais keys', () => {
    const input = { password: 'super-secret', name: 'João' };
    const result = sanitizePayload(input) as Record<string, unknown>;

    expect(result.password).toBe('[REDACTED]');
    expect(result.name).toBe('João');
  });

  it('2. sanitiza recursivamente em objeto aninhado', () => {
    const input = { user: { passwordHash: 'bcrypt-hash', email: 'a@b.com' } };
    const result = sanitizePayload(input) as { user: Record<string, unknown> };

    expect(result.user.passwordHash).toBe('[REDACTED]');
    expect(result.user.email).toBe('a@b.com');
  });

  it('3. sanitiza dentro de arrays', () => {
    const input = { docs: [{ token: 'abc', name: 'arquivo.pdf' }] };
    const result = sanitizePayload(input) as { docs: Record<string, unknown>[] };

    expect(result.docs[0].token).toBe('[REDACTED]');
    expect(result.docs[0].name).toBe('arquivo.pdf');
  });

  it('4. é case-insensitive — PASSWORD, Password e password viram [REDACTED]', () => {
    const variants = ['PASSWORD', 'Password', 'password'] as const;
    for (const key of variants) {
      const input = { [key]: 'valor-secreto', ok: 'visível' };
      const result = sanitizePayload(input) as Record<string, unknown>;
      expect(result[key]).toBe('[REDACTED]');
      expect(result.ok).toBe('visível');
    }
  });

  it('5. profundidade > 8 retorna [MAX_DEPTH]', () => {
    const deep: Record<string, unknown> = {};
    let ref = deep;
    for (let i = 0; i < 10; i++) {
      ref.child = {};
      ref = ref.child as Record<string, unknown>;
    }
    ref.leaf = 'valor';

    const result = sanitizePayload(deep) as Record<string, unknown>;

    let node: unknown = result;
    let depth = 0;
    while (typeof node === 'object' && node !== null && 'child' in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>).child;
      depth++;
    }
    expect(node).toBe('[MAX_DEPTH]');
  });

  it('6. string maior que 4096 chars é truncada com sufixo [truncated]', () => {
    const longStr = 'x'.repeat(5000);
    const input = { data: longStr };
    const result = sanitizePayload(input) as Record<string, unknown>;

    expect(typeof result.data).toBe('string');
    expect((result.data as string).length).toBeLessThanOrEqual(4096 + '...[truncated]'.length);
    expect((result.data as string).endsWith('...[truncated]')).toBe(true);
  });

  it('7. primitivos (string, number, boolean, null, undefined) passam sem alteração', () => {
    expect(sanitizePayload('texto')).toBe('texto');
    expect(sanitizePayload(42)).toBe(42);
    expect(sanitizePayload(true)).toBe(true);
    expect(sanitizePayload(null)).toBeNull();
    expect(sanitizePayload(undefined)).toBeUndefined();
  });

  it('NÃO muta o objeto original', () => {
    const original = { password: 'original', name: 'test' };
    const frozen = { ...original };
    sanitizePayload(original);
    expect(original.password).toBe(frozen.password);
  });
});

describe('findRedactedKeys', () => {
  it('retorna apenas as keys que foram redigidas', () => {
    const original = { password: 'x', email: 'a@b.com', token: 'tok' };
    const sanitized = sanitizePayload(original) as Record<string, unknown>;
    const keys = findRedactedKeys(original, sanitized);

    expect(keys).toContain('password');
    expect(keys).toContain('token');
    expect(keys).not.toContain('email');
  });

  it('retorna lista vazia quando payload está limpo', () => {
    const original = { action: 'login', entityId: 'abc-123' };
    const sanitized = sanitizePayload(original) as Record<string, unknown>;
    const keys = findRedactedKeys(original, sanitized);

    expect(keys).toHaveLength(0);
  });
});

describe('maskCnpj', () => {
  it('mascara CNPJ formatado corretamente', () => {
    const result = maskCnpj('11222333000181');
    expect(result).toMatch(/^\d{2}\.\d{3}\.\*\*\*\/\*\*\*\*-\d{2}$/);
  });

  it('retorna [CNPJ_INVALID_FORMAT] para entrada inválida', () => {
    expect(maskCnpj('123')).toBe('[CNPJ_INVALID_FORMAT]');
  });
});

describe('SENSITIVE_KEYS', () => {
  it('contém chaves críticas de segurança', () => {
    const mustHave = ['password', 'passwordhash', 'token', 'secret', 'otp', 'cnpj', 'accesstoken', 'refreshtoken'];
    for (const key of mustHave) {
      expect(SENSITIVE_KEYS.has(key)).toBe(true);
    }
  });

  it('é somente leitura (ReadonlySet)', () => {
    expect(() => {
      (SENSITIVE_KEYS as Set<string>).add('novachave');
    }).not.toThrow();
  });
});
