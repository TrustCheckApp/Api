import { Injectable, Logger } from '@nestjs/common';
import { OtpProvider, EnvioOtpParams } from '../otp-provider.interface';

/**
 * Stub local — usa apenas console.log.
 * Substituir por SendGridProvider ou TwilioProvider quando o provider for decidido.
 * R1: provider isolado pelo adapter — AuthService não precisa mudar.
 */
@Injectable()
export class StubOtpProvider implements OtpProvider {
  private readonly logger = new Logger(StubOtpProvider.name);

  async enviar(params: EnvioOtpParams): Promise<void> {
    this.logger.warn(
      `[OTP STUB] canal=${params.canal} destinatario=${params.destinatario} codigo=${params.codigo}`,
    );
  }
}
