import { Test, TestingModule } from '@nestjs/testing';
import { ConsumerAuthService } from '../../src/modules/auth/consumer-auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuditService } from '../../src/common/audit/audit.service';
import { AuditAction } from '../../src/common/audit/audit-actions.const';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { OtpService } from '../../src/modules/auth/otp.service';
import { EVENT_PUBLISHER_TOKEN } from '../../src/common/events/event-publisher';
import { UserRole, UserStatus } from '@prisma/client';

const MOCK_USER = {
  id: 'user-consumer-1',
  email: 'joao@email.com',
  passwordHash: '$2b$12$hashedPassword',
  role: UserRole.consumer,
  status: UserStatus.active,
};

const mockAuditLog = jest.fn().mockResolvedValue(undefined);
const mockEventPublish = jest.fn().mockResolvedValue(undefined);
const mockJwtSign = jest.fn().mockResolvedValue('access.token.mock');
const mockJwtVerify = jest.fn().mockResolvedValue({ sub: MOCK_USER.id, scope: 'otp_pending', role: UserRole.consumer });
const mockOtpVerify = jest.fn().mockResolvedValue(undefined);
const mockPrismaUserUpdate = jest.fn().mockResolvedValue(MOCK_USER);

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: mockPrismaUserUpdate,
  },
};

const META = { ip: '10.0.0.1', userAgent: 'TestAgent/1.0' };

describe('ConsumerAuthService — audit de login', () => {
  let service: ConsumerAuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockJwtVerify.mockResolvedValue({ sub: MOCK_USER.id, scope: 'otp_pending', role: UserRole.consumer });
    mockPrisma.user.findUnique.mockResolvedValue(MOCK_USER);
    mockPrismaUserUpdate.mockResolvedValue(MOCK_USER);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsumerAuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: { log: mockAuditLog } },
        { provide: JwtService, useValue: { signAsync: mockJwtSign, verifyAsync: mockJwtVerify } },
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
        { provide: OtpService, useValue: { generate: jest.fn(), verify: mockOtpVerify } },
        { provide: EVENT_PUBLISHER_TOKEN, useValue: { publish: mockEventPublish } },
      ],
    }).compile();

    service = module.get<ConsumerAuthService>(ConsumerAuthService);
  });

  it('1. login válido (confirm) grava AUTH_LOGIN com action, entity, method, ip e userAgent', async () => {
    mockPrismaUserUpdate.mockResolvedValue(MOCK_USER);

    await service.confirm(
      { registrationToken: 'reg.token', otp: '123456' },
      META,
    );

    const auditCall = mockAuditLog.mock.calls.find(
      (c: unknown[]) => (c[0] as { action: string }).action === AuditAction.AUTH_LOGIN,
    );
    expect(auditCall).toBeDefined();

    const params = auditCall![0] as {
      action: string;
      entity: string;
      entityId: string;
      payload: { method: string; role: string };
      ip: string;
      userAgent: string;
    };
    expect(params.entity).toBe('user');
    expect(params.entityId).toBe(MOCK_USER.id);
    expect(params.payload.method).toBe('password');
    expect(params.ip).toBe('10.0.0.1');
    expect(params.userAgent).toBe('TestAgent/1.0');
  });

  it('2. login válido também publica evento Redis (regressão zero TC1-API-08)', async () => {
    mockPrismaUserUpdate.mockResolvedValue(MOCK_USER);

    await service.confirm(
      { registrationToken: 'reg.token', otp: '123456' },
      META,
    );

    expect(mockEventPublish).toHaveBeenCalledTimes(1);
    const [stream, event] = mockEventPublish.mock.calls[0] as [string, { type: string }];
    expect(stream).toContain('trustcheck.events.auth');
    expect(event.type).toBe('auth.login.succeeded.v1');
  });

  it('3. senha errada grava AUTH_LOGIN_FAILED com reason=INVALID_PASSWORD e NÃO publica evento Redis', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.loginWithPassword('naoexiste@email.com', 'wrongpass', META),
    ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

    const failedCall = mockAuditLog.mock.calls.find(
      (c: unknown[]) => (c[0] as { action: string }).action === AuditAction.AUTH_LOGIN_FAILED,
    );
    expect(failedCall).toBeDefined();

    const params = failedCall![0] as { payload: { reason: string } };
    expect(params.payload.reason).toBe('INVALID_PASSWORD');

    expect(mockEventPublish).not.toHaveBeenCalled();
  });
});
