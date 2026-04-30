import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventPublisher } from './event-publisher';
import { DomainEvent } from './domain-event';

@Injectable()
export class RedisEventPublisher
  implements EventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisEventPublisher.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    });

    this.client.on('error', (err) =>
      this.logger.error('RedisEventPublisher connection error', err),
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async publish(stream: string, event: DomainEvent): Promise<void> {
    try {
      const fields: string[] = [
        'id',         event.id,
        'type',       event.type,
        'version',    String(event.version),
        'occurredAt', event.occurredAt,
        'producer',   event.producer,
        'correlationId', event.correlationId,
        'causationId',   event.causationId ?? '',
        'payload',    JSON.stringify(event.payload),
      ];

      await this.client.xadd(stream, '*', ...fields);

      this.logger.debug(
        `Event published → stream=${stream} type=${event.type} id=${event.id}`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to publish event type=${event.type} to stream=${stream}`,
        err,
      );
    }
  }
}
