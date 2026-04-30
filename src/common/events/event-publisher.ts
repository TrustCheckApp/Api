import { DomainEvent } from './domain-event';

export const EVENT_PUBLISHER_TOKEN = Symbol('EVENT_PUBLISHER');

export interface EventPublisher {
  publish(stream: string, event: DomainEvent): Promise<void>;
}
