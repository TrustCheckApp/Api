export interface OtpSentPayload {
  destinationMasked: string;
  channel: 'sms' | 'email';
  purpose: 'register' | 'login' | 'recover';
}

export const AUTH_OTP_SENT_V1 = 'auth.otp.sent.v1';

/**
 * Mascara email: "user@domain.com" → "us**@domain.com"
 * Mascara telefone: "+5511912341234" → "+5511****1234"
 */
export function maskDestination(destination: string): string {
  if (destination.includes('@')) {
    const [local, domain] = destination.split('@');
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - 2, 2))}@${domain}`;
  }
  const cleaned = destination.replace(/\D/g, '');
  return cleaned.length >= 8
    ? cleaned.slice(0, cleaned.length - 8) + '****' + cleaned.slice(-4)
    : '****';
}
