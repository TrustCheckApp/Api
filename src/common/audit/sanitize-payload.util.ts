/**
 * @file sanitize-payload.util.ts
 * @description Sanitizador determinístico de payloads de auditoria.
 *
 * Remove campos sensíveis antes de qualquer gravação em `module_audit_logs`,
 * impedindo vazamento de PII e segredos mesmo que o chamador os passe
 * inadvertidamente.
 *
 * ## Regra para adicionar novas chaves a SENSITIVE_KEYS
 * Toda adição requer:
 *  1. PR separado com label `security`.
 *  2. Revisão de um segundo engenheiro (não o autor da mudança).
 *  3. Atualização dos testes em `test/common/audit-sanitize.spec.ts`.
 *  4. Referência ao ticket de segurança no commit message.
 *
 * NUNCA adicione chaves em hotfix sem o processo acima.
 */

/** Conjunto de chaves sensíveis — comparação feita em lowercase. */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'senha',
  'otp',
  'otpcode',
  'otp_code',
  'codigo',
  'cnpj',
  'cnpjcompleto',
  'accesstoken',
  'refreshtoken',
  'registrationtoken',
  'token',
  'idtoken',
  'id_token',
  'totpsecret',
  'totp_secret',
  'secret',
  'recoverycodes',
  'recovery_codes',
  'authorization',
  'cookie',
  'setcookie',
  'set_cookie',
  'documents',
  'documenturls',
  'document_urls',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'ip',
  'useragent',
  'user_agent',
]);

const REDACTED = '[REDACTED]';
const MAX_DEPTH_MARKER = '[MAX_DEPTH]';
const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 4096;
const TRUNCATED_SUFFIX = '...[truncated]';

/**
 * Sanitiza recursivamente um payload arbitrário antes de gravá-lo em auditoria.
 *
 * Regras:
 * - Primitivos (string, number, boolean, null) passam direto (strings são
 *   truncadas em MAX_STRING_LENGTH).
 * - Arrays: cada item é sanitizado individualmente.
 * - Objects: keys em SENSITIVE_KEYS têm o valor substituído por "[REDACTED]";
 *   demais keys são sanitizadas recursivamente.
 * - Profundidade > MAX_DEPTH retorna "[MAX_DEPTH]".
 * - undefined retorna undefined sem erro.
 * - Nunca muta o objeto original — sempre retorna estrutura nova.
 *
 * @param input  - Valor a sanitizar.
 * @param depth  - Profundidade atual (uso interno; não passar externamente).
 * @returns Estrutura sanitizada (nunca contém valores de SENSITIVE_KEYS).
 */
export function sanitizePayload(input: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return MAX_DEPTH_MARKER;
  }

  if (input === undefined || input === null) {
    return input;
  }

  if (typeof input === 'string') {
    return input.length > MAX_STRING_LENGTH
      ? input.slice(0, MAX_STRING_LENGTH) + TRUNCATED_SUFFIX
      : input;
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizePayload(item, depth + 1));
  }

  if (typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>)) {
      const value = (input as Record<string, unknown>)[key];
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizePayload(value, depth + 1);
      }
    }
    return result;
  }

  return input;
}

/**
 * Retorna as keys redigidas (somente nomes, nunca valores) para logging
 * estruturado. Opera apenas no primeiro nível — suficiente para warn.
 *
 * @internal Usado pelo AuditService para emitir warn observável.
 */
export function findRedactedKeys(
  original: Record<string, unknown>,
  sanitized: unknown,
): string[] {
  const redacted: string[] = [];
  if (typeof sanitized !== 'object' || sanitized === null) return redacted;

  for (const key of Object.keys(original)) {
    const sanitizedObj = sanitized as Record<string, unknown>;
    if (sanitizedObj[key] === REDACTED) {
      redacted.push(key);
    }
  }
  return redacted;
}

/**
 * Mascara CNPJ para forma parcial: "12.345.**\/****-XX".
 * O CNPJ completo nunca deve trafegar em payload de auditoria;
 * use este helper nos casos em que uma referência parcial for necessária.
 *
 * @param value - CNPJ formatado ou apenas dígitos.
 */
export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return '[CNPJ_INVALID_FORMAT]';
  const prefix = digits.slice(0, 5);
  const dv = digits.slice(12);
  return `${prefix.slice(0, 2)}.${prefix.slice(2)}.***/****-${dv}`;
}
