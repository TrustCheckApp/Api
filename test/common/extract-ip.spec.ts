import { extractClientIp } from '../../src/common/net/extract-ip.util';
import type { Request } from 'express';

type MockSocket = { remoteAddress?: string };
type MockRequest = {
  headers: Record<string, string | undefined>;
  socket: MockSocket;
};

function makeReq(
  socketAddr: string | undefined,
  headers: Record<string, string | undefined> = {},
): Request {
  return { headers, socket: { remoteAddress: socketAddr } } as unknown as Request;
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_PROXY_SECRET = process.env.TRUSTED_PROXY_SECRET;

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  process.env.TRUSTED_PROXY_SECRET = ORIGINAL_PROXY_SECRET;
});

describe('extractClientIp — dev/test (sem proxy confiável)', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    delete process.env.TRUSTED_PROXY_SECRET;
  });

  it('1. ignora X-Forwarded-For em dev e usa req.socket', () => {
    const req = makeReq('192.168.0.10', { 'x-forwarded-for': '203.0.113.5, 198.51.100.1' });
    expect(extractClientIp(req)).toBe('192.168.0.10');
  });

  it('2. IPv4-mapped IPv6 "::ffff:192.0.2.1" vira "192.0.2.1"', () => {
    const req = makeReq('::ffff:192.0.2.1');
    expect(extractClientIp(req)).toBe('192.0.2.1');
  });

  it('3. "unknown" como remoteAddress retorna null', () => {
    const req = makeReq('unknown');
    expect(extractClientIp(req)).toBeNull();
  });

  it('4. undefined remoteAddress retorna null', () => {
    const req = makeReq(undefined);
    expect(extractClientIp(req)).toBeNull();
  });

  it('5. IPv6 válido "2001:db8::1" passa sem alteração', () => {
    const req = makeReq('2001:db8::1');
    expect(extractClientIp(req)).toBe('2001:db8::1');
  });

  it('6. IPv4 simples válido "10.0.0.1" passa', () => {
    const req = makeReq('10.0.0.1');
    expect(extractClientIp(req)).toBe('10.0.0.1');
  });

  it('7. string vazia retorna null', () => {
    const req = makeReq('');
    expect(extractClientIp(req)).toBeNull();
  });
});

describe('extractClientIp — produção com proxy assinado', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.TRUSTED_PROXY_SECRET = 'secret-token-proxy';
  });

  it('8. X-Forwarded-For "203.0.113.5, 198.51.100.1" retorna primeiro IP quando proxy confiável', () => {
    const req = makeReq('10.0.0.1', {
      'x-forwarded-for': '203.0.113.5, 198.51.100.1',
      'x-trusted-proxy': 'secret-token-proxy',
    });
    expect(extractClientIp(req)).toBe('203.0.113.5');
  });

  it('9. sem header x-trusted-proxy em produção usa req.socket (não X-Forwarded-For)', () => {
    const req = makeReq('10.0.0.1', {
      'x-forwarded-for': '203.0.113.5, 198.51.100.1',
    });
    expect(extractClientIp(req)).toBe('10.0.0.1');
  });

  it('10. x-trusted-proxy com token errado usa req.socket', () => {
    const req = makeReq('10.0.0.1', {
      'x-forwarded-for': '203.0.113.5',
      'x-trusted-proxy': 'token-errado',
    });
    expect(extractClientIp(req)).toBe('10.0.0.1');
  });

  it('11. XFF com primeiro IP inválido em prod com proxy confiável cai para req.socket', () => {
    const req = makeReq('192.168.1.5', {
      'x-forwarded-for': 'lixo, 127.0.0.1',
      'x-trusted-proxy': 'secret-token-proxy',
    });
    const result = extractClientIp(req);
    expect(result).toBe('192.168.1.5');
  });

  it('12. XFF com "::ffff:10.0.0.1" em produção (proxy confiável) normaliza para "10.0.0.1"', () => {
    const req = makeReq('172.16.0.1', {
      'x-forwarded-for': '::ffff:10.0.0.1',
      'x-trusted-proxy': 'secret-token-proxy',
    });
    expect(extractClientIp(req)).toBe('10.0.0.1');
  });
});
