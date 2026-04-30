import {
  Injectable,
  Inject,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';
import { OTP_PROVIDER_TOKEN, OtpProvider } from './providers/otp-provider.interface';
import { EVENT_PUBLISHER_TOKEN, EventPublisher } from '../../common/events/event-publisher';
import { buildEvent } from '../../common/events/domain-event';
import { AUTH_STREAM } from '../../common/events/schemas/auth/login-succeeded';
import { AUTH_OTP_SENT_V1, OtpSentPayload, maskDestination } from '../../common/events/schemas/auth/otp-sent';
import { AUTH_OTP_VERIFIED_V1, OtpVerifiedPayload } from '../../common/events/schemas/auth/otp-verified';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly TTL = 300;
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Inject(OTP_PROVIDER_TOKEN) private readonly otpProvider: OtpProvider,
    @Inject(EVENT_PUBLISHER_TOKEN) private readonly events: EventPublisher,
  ) {}

  private codeKey(userId: string): string {
    return `otp:code:${userId}`;
  }

  private attemptsKey(userId: string): string {
    return `otp:attempts:${userId}`;
  }

  async generate(
    userId: string,
    email: string,
    ttlSeconds?: number,
    purpose: OtpSentPayload['purpose'] = 'register',
  ): Promise<void> {
    const length = this.config.get<number>('OTP_LENGTH', 6);
    const ttl = ttlSeconds ?? this.config.get<number>('OTP_EXPIRATION_SECONDS', this.TTL);

    const code = Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

    await this.redis.set(this.codeKey(userId), code, ttl);
    await this.redis.del(this.attemptsKey(userId));

    await this.otpProvider.send({ userId, email, code, ttlSeconds: ttl });

    const event = buildEvent<OtpSentPayload>(AUTH_OTP_SENT_V1, 1, {
      destinationMasked: maskDestination(email),
      channel: 'email',
      purpose,
    });
    void this.events.publish(AUTH_STREAM, event);
  }

  async verify(
    userId: string,
    inputCode: string,
    purpose: OtpVerifiedPayload['purpose'] = 'register',
  ): Promise<void> {
    const attKey = this.attemptsKey(userId);
    const attempts = parseInt((await this.redis.get(attKey)) ?? '0', 10);

    if (attempts >= this.MAX_ATTEMPTS) {
      await this.redis.del(this.codeKey(userId));
      throw new BadRequestException({
        code: 'OTP_MAX_ATTEMPTS',
        message: 'Número máximo de tentativas excedido. O código foi invalidado. Solicite um novo.',
      });
    }

    const stored = await this.redis.get(this.codeKey(userId));

    if (stored === null) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: 'O código OTP expirou. Solicite um novo código.',
      });
    }

    if (stored !== inputCode) {
      await this.redis.set(attKey, String(attempts + 1), 600);
      if (attempts + 1 >= this.MAX_ATTEMPTS) {
        await this.redis.del(this.codeKey(userId));
        throw new BadRequestException({
          code: 'OTP_MAX_ATTEMPTS',
          message: 'Número máximo de tentativas excedido. O código foi invalidado. Solicite um novo.',
        });
      }
      throw new BadRequestException({
        code: 'OTP_INVALID',
        message: 'Código OTP inválido.',
      });
    }

    await this.redis.del(this.codeKey(userId));
    await this.redis.del(attKey);

    const verifiedEvent = buildEvent<OtpVerifiedPayload>(AUTH_OTP_VERIFIED_V1, 1, {
      userId,
      purpose,
      success: true,
      attempts,
    });
    void this.events.publish(AUTH_STREAM, verifiedEvent);
  }
}
