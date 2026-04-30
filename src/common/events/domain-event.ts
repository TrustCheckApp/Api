import { v4 as uuidv4 } from 'uuid';

/**
 * Envelope padrão para todos os eventos de domínio TrustCheck.
 * Imutável após publicação — nunca reescreva ou compense via replay.
 */
export interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  producer: 'api';
  correlationId: string;
  causationId: string | null;
  payload: T;
}

export interface EventPublishOptions {
  correlationId?: string;
  causationId?: string;
}

export function buildEvent<T>(
  type: string,
  version: number,
  payload: T,
  opts: EventPublishOptions = {},
): DomainEvent<T> {
  return {
    id: uuidv4(),
    type,
    version,
    occurredAt: new Date().toISOString(),
    producer: 'api',
    correlationId: opts.correlationId ?? uuidv4(),
    causationId: opts.causationId ?? null,
    payload,
  };
}
