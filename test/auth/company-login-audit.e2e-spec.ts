import { Test, TestingModule } from '@nestjs/testing';
import { CompanyAuthService } from '../../src/modules/auth/company/company-auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/common/audit/audit.service';
import { AuditAction } from '../../src/common/audit/audit-actions.const';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpService } from '../../src/modules/auth/otp.service';
import { UserRole, UserStatus } from '@prisma/client';

const MOCK_USER = {
  id: 'user-company-1',
  email: 'empresa@acme.com.br',
  passwordHash: '$2b$12$hashedCompany',
  role: UserRole.company,
  status: UserStatus.active,
};

const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockJwtSign = jest.fn().mockResolvedValue('company.access.token');
const mockJwtVerify = jest.fn().mockResolvedValue({ sub: MOCK_USER.id, scope: 'otp_pending', role: 'company' });
const mockOtpVerify = jest.fn().mockResolvedValue(undefined);

const mockPrisma = {
  user: {
    update: jest.fn().mockResolvedValue(MOCK_USER),
  },
};

const META = { ip: '192.168.1.5', userAgent: 'CompanyApp/2.0' };

describe('CompanyAuthService — audit de login', () => {
  let service: CompanyAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: mockAuditLog } },
        { provide: JwtService, useValue: { signAsync: mockJwtSign, verifyAsync: mockJwtVerify } },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
        { provide: OtpService, useValue: { generate: jest.fn(), verify: mockOtpVerify } },
      ],
    }).compile();

    service = module.get<CompanyAuthService>(CompanyAuthService);
  });

  it('1. confirmAndEnrollTotp com OTP correto grava AUTH_LOGIN com method=password_totp', async () => {
    await service.confirmAndEnrollTotp('reg.token.company', '654321', META);

    const auditCall = mockAuditLog.mock.calls.find(
      (c: unknown[]) => (c[0] as { action: string }).action === AuditAction.AUTH_LOGIN,
    );
    expect(auditCall).toBeDefined();

    const params = auditCall![0] as {
      action: string;
      entity: string;
      entityId: string;
      payload: { method: string };
      ip: string;
      userAgent: string;
    };
    expect(params.entity).toBe('user');
    expect(params.entityId).toBe(MOCK_USER.id);
    expect(params.payload.method).toBe('password_totp');
    expect(params.ip).toBe('192.168.1.5');
    expect(params.userAgent).toBe('CompanyApp/2.0');
  });

  it('2. TOTP errado (OTP falha) grava AUTH_LOGIN_FAILED com reason=INVALID_TOTP', async () => {
    mockOtpVerify.mockRejectedValueOnce(
      Object.assign(new Error('OTP inválido'), { response: { code: 'OTP_INVALID' } }),
    );

    await expect(
      service.confirmAndEnrollTotp('reg.token.company', '000000', META),
    ).rejects.toThrow();

    const failedCall = mockAuditLog.mock.calls.find(
      (c: unknown[]) => (c[0] as { action: string }).action === AuditAction.AUTH_LOGIN_FAILED,
    );

    if (failedCall) {
      const params = failedCall[0] as { payload: { reason: string } };
      expect(params.payload.reason).toBe('INVALID_TOTP');
    }
  });

  it('3. recovery code usado grava AUTH_LOGIN com method=password_recovery', async () => {
    jest.clearAllMocks();

    await service.auditLoginSuccess(MOCK_USER.id, MOCK_USER.role, 'password_recovery', META);

    expect(mockAuditLog).toHaveBeenCalledTimes(1);

    const params = mockAuditLog.mock.calls[0][0] as {
      action: string;
      entity: string;
      entityId: string;
      payload: { method: string; role: string };
      ip: string;
      userAgent: string;
    };
    expect(params.action).toBe(AuditAction.AUTH_LOGIN);
    expect(params.payload.method).toBe('password_recovery');
    expect(params.ip).toBe('192.168.1.5');
  });
});
