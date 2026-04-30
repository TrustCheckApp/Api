import { Module } from '@nestjs/common';
import { TestHelperController } from './test-helper.controller';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [TestHelperController],
})
export class TestHelperModule {}
