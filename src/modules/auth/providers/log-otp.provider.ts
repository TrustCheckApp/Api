import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider, OtpSendParams } from './otp-provider.interface';

@Injectable()
export class LogOtpProvider implements OtpProvider {
  private readonly logger = new Logger(LogOtpProvider.name);

  async send(params: OtpSendParams): Promise<void> {
    this.logger.warn(
      `[LOG_OTP] userId=${params.userId} email=*** ttl=${params.ttlSeconds}s code=*** (dev only)`,
    );
  }
}
