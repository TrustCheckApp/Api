import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RedisService } from '../../redis/redis.service';

/**
 * Exposto APENAS em NODE_ENV=test para permitir que testes E2E
 * leiam o OTP sem acesso ao provedor de e-mail.
 *
 * NUNCA expor em produção — o guard de ambiente previne isso.
 */
@ApiTags('test-helpers')
@Controller('test')
export class TestHelperController {
  constructor(private readonly redis: RedisService) {}

  @Get('otp/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[TEST ONLY] Retorna OTP atual do userId para testes E2E' })
  async getOtp(@Param('userId') userId: string): Promise<{ otp: string }> {
    const otp = await this.redis.get(`otp:code:${userId}`);
    return { otp: otp ?? '' };
  }
}
