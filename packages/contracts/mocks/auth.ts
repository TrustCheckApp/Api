import { paths } from '../types';

export const authMocks = {
  'POST /auth/consumer/register': {
    response: {
      status: 201,
      body: {
        registrationToken: 'mock-registration-token-123',
      } as paths['/auth/consumer/register']['post']['responses'][201]['content']['application/json'],
    },
  },
  'POST /auth/consumer/register/confirm': {
    response: {
      status: 200,
      body: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      } as paths['/auth/consumer/register/confirm']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /auth/company/register': {
    response: {
      status: 201,
      body: {
        registrationToken: 'mock-company-registration-token-123',
      } as paths['/auth/company/register']['post']['responses'][201]['content']['application/json'],
    },
  },
  'POST /auth/company/register/confirm': {
    response: {
      status: 200,
      body: {
        accessToken: 'mock-company-access-token',
        totpSecret: 'mock-totp-secret',
        qrCodeDataUrl: 'data:image/png;base64,mock-qr-code',
        recoveryCodes: ['code1', 'code2', 'code3'],
      } as paths['/auth/company/register/confirm']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /auth/company/claim': {
    response: {
      status: 202,
      body: {
        claimId: 'mock-claim-id-123',
      } as paths['/auth/company/claim']['post']['responses'][202]['content']['application/json'],
    },
  },
  'GET /auth/company/claim/{claimId}/status': {
    response: {
      status: 200,
      body: {
        claimId: 'mock-claim-id-123',
        status: 'pending',
      } as paths['/auth/company/claim/{claimId}/status']['get']['responses'][200]['content']['application/json'],
    },
  },
  'POST /auth/sso/google': {
    response: {
      status: 200,
      body: {
        accessToken: 'mock-google-sso-token',
        refreshToken: 'mock-google-sso-refresh-token',
      } as paths['/auth/sso/google']['post']['responses'][200]['content']['application/json'],
    },
  },
  'POST /auth/sso/apple': {
    response: {
      status: 200,
      body: {
        accessToken: 'mock-apple-sso-token',
        refreshToken: 'mock-apple-sso-refresh-token',
      } as paths['/auth/sso/apple']['post']['responses'][200]['content']['application/json'],
    },
  },
};
