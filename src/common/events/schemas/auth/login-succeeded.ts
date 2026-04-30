export const AUTH_STREAM = 'trustcheck.events.auth.v1';

export interface LoginSucceededPayload {
  userId: string;
  role: string;
  method: 'password' | 'sso' | 'biometry' | 'recovery';
  ip: string | null;
  userAgent: string | null;
}

export const AUTH_LOGIN_SUCCEEDED_V1 = 'auth.login.succeeded.v1';
