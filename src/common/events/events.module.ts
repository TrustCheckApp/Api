import { Global, Module } from '@nestjs/common';
import { RedisEventPublisher } from './event-publisher.redis';
import { EVENT_PUBLISHER_TOKEN } from './event-publisher';

@Global()
@Module({
  providers: [
    RedisEventPublisher,
    {
      provide: EVENT_PUBLISHER_TOKEN,
      useExisting: RedisEventPublisher,
    },
  ],
  exports: [EVENT_PUBLISHER_TOKEN, RedisEventPublisher],
})
export class EventsModule {}
