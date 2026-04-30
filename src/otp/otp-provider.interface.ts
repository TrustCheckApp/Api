/**
 * OtpProvider — adapter pattern conforme R1.
 * Isola o provider de OTP (SendGrid, Twilio, Zenvia, stub local).
 * Trocar implementação sem alterar AuthService.
 */
export interface OtpProvider {
  enviar(params: EnvioOtpParams): Promise<void>;
}

export interface EnvioOtpParams {
  destinatario: string;
  codigo: string;
  canal: 'email' | 'sms';
  nomeUsuario?: string;
}
