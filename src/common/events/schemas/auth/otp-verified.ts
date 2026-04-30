export interface OtpVerifiedPayload {
  userId: string | null;
  purpose: 'register' | 'login' | 'recover';
  success: true;
  attempts: number;
}

export const AUTH_OTP_VERIFIED_V1 = 'auth.otp.verified.v1';
