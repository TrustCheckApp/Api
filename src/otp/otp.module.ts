import { Module } from '@nestjs/common';
import { StubOtpProvider } from './providers/stub-otp.provider';
import { SendGridOtpProvider } from './providers/sendgrid-otp.provider';

export const OTP_PROVIDER = 'OTP_PROVIDER';

/**
 * OtpModule — injeta o provider correto via token OTP_PROVIDER.
 * Trocar useClass para ativar SendGrid/Twilio sem alterar AuthService.
 */
@Module({
  providers: [
    StubOtpProvider,
    SendGridOtpProvider,
    {
      provide: OTP_PROVIDER,
      useClass: StubOtpProvider, // trocar para SendGridOtpProvider quando configurado
    },
  ],
  exports: [OTP_PROVIDER],
})
export class OtpModule {}
