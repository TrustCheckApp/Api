/**
 * @file extract-ip.util.ts
 * @description Extrai e valida o IP do cliente de uma requisição Express.
 *
 * ## Regra de confiança no X-Forwarded-For
 *
 * X-Forwarded-For pode ser forjado por qualquer cliente que se conecte
 * diretamente ao servidor sem passar por proxy reverso. Para evitar
 * gravação de IPs falsos na trilha forense:
 *
 * - Em **produção** (`NODE_ENV=production`): X-Forwarded-For é lido SOMENTE
 *   quando o header `X-Trusted-Proxy: <TRUSTED_PROXY_SECRET>` estiver
 *   presente e corresponder à variável de ambiente `TRUSTED_PROXY_SECRET`.
 *   Se o token não bater, o header é descartado e usa-se `req.socket`.
 *
 * - Em **dev/test**: `req.socket.remoteAddress` é sempre a fonte de verdade.
 *   X-Forwarded-For é ignorado para evitar que mocks de header contaminem
 *   a trilha de auditoria local.
 *
 * ## Adicionando um novo ambiente de proxy confiável
 * 1. Definir `TRUSTED_PROXY_SECRET` no `.env` e nos Secrets do CI/CD.
 * 2. Configurar o proxy para incluir `X-Trusted-Proxy: <valor>` em cada
 *    requisição encaminhada.
 * 3. NÃO expor o secret em logs, eventos Redis ou audit payload.
 */

import * as net from 'net';
import type { Request } from 'express';

const IPV4_MAPPED_PREFIX = '::ffff:';

/**
 * Normaliza e valida um candidato a IP.
 *
 * - Remove prefixo `::ffff:` de IPv4-mapped IPv6.
 * - Usa `net.isIP()` (Node built-in) para validar: retorna 4, 6 ou 0.
 *
 * @returns IP normalizado (string) se válido, ou `null` se inválido.
 */
function normalizeAndValidate(candidate: string): string | null {
  if (!candidate) return null;

  let value = candidate.trim();

  if (value.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)) {
    value = value.slice(IPV4_MAPPED_PREFIX.length);
  }

  return net.isIP(value) !== 0 ? value : null;
}

/**
 * Determina se a requisição vem de proxy confiável.
 *
 * Confiável = `NODE_ENV=production` AND header `X-Trusted-Proxy`
 * corresponde a `process.env.TRUSTED_PROXY_SECRET`.
 */
function isTrustedProxy(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return false;

  const proxySecret = process.env.TRUSTED_PROXY_SECRET;
  if (!proxySecret) return false;

  const header = req.headers['x-trusted-proxy'] as string | undefined;
  return header === proxySecret;
}

/**
 * Extrai o IP real do cliente de uma requisição Express.
 *
 * Ordem de prioridade:
 * 1. `X-Forwarded-For` (primeiro IP da lista) — apenas em produção com
 *    proxy assinado (ver regras no cabeçalho deste arquivo).
 * 2. `req.socket.remoteAddress` — fonte de verdade em dev/test e fallback
 *    em produção quando proxy não é confiável.
 * 3. `null` — quando nenhum IP válido for obtido; o banco aceita NULL na
 *    coluna `inet` e é preferível a gravar lixo.
 *
 * @param req - Objeto Request do Express.
 * @returns IP válido como string, ou `null`.
 */
export function extractClientIp(req: Request): string | null {
  if (isTrustedProxy(req)) {
    const xff = req.headers['x-forwarded-for'] as string | undefined;
    if (xff) {
      const firstCandidate = xff.split(',')[0];
      const validated = normalizeAndValidate(firstCandidate);
      if (validated) return validated;
    }
  }

  return normalizeAndValidate(req.socket?.remoteAddress ?? '');
}
