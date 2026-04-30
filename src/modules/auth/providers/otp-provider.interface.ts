export interface OtpSendParams {
  userId: string;
  email: string;
  code: string;
  ttlSeconds: number;
}

export interface OtpProvider {
  send(params: OtpSendParams): Promise<void>;
}

export const OTP_PROVIDER_TOKEN = 'OTP_PROVIDER';
