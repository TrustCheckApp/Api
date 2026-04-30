import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpProvider, EnvioOtpParams } from '../otp-provider.interface';

/**
 * SendGrid placeholder — instanciar quando SENDGRID_API_KEY estiver configurado.
 * R1: mesmo contrato que o stub, sem mudança no AuthService.
 *
 * Para ativar:
 *  1. npm install @sendgrid/mail
 *  2. Definir SENDGRID_API_KEY e SENDGRID_FROM_EMAIL no .env
 *  3. Trocar StubOtpProvider por SendGridOtpProvider no OtpModule
 */
@Injectable()
export class SendGridOtpProvider implements OtpProvider {
  private readonly logger = new Logger(SendGridOtpProvider.name);

  constructor(private readonly config: ConfigService) {}

  async enviar(params: EnvioOtpParams): Promise<void> {
    if (params.canal !== 'email') {
      this.logger.warn(`SendGridOtpProvider não suporta canal=${params.canal}. Use TwilioOtpProvider para SMS.`);
      return;
    }

    const apiKey = this.config.get<string>('SENDGRID_API_KEY');
    const from = this.config.get<string>('SENDGRID_FROM_EMAIL', 'noreply@trustcheck.com.br');

    if (!apiKey) {
      this.logger.error('SENDGRID_API_KEY não configurado. Verifique o .env.');
      return;
    }

    // TODO: descomentar após `npm install @sendgrid/mail`
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(apiKey);
    // await sgMail.send({
    //   to: params.destinatario,
    //   from,
    //   subject: 'Seu código TrustCheck',
    //   text: `Código: ${params.codigo} (válido por 5 minutos)`,
    //   html: `<p>Olá${params.nomeUsuario ? ` ${params.nomeUsuario}` : ''},</p>
    //          <p>Seu código de verificação TrustCheck é: <strong>${params.codigo}</strong></p>
    //          <p>Válido por 5 minutos.</p>`,
    // });

    this.logger.log(`[SendGrid PLACEHOLDER] OTP enviado para ${params.destinatario}`);
  }
}
