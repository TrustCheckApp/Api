import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../src/common/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const mockCreate = jest.fn().mockResolvedValue({ id: 'audit-log-1' });
const mockPrisma = {
  moduleAuditLog: { create: mockCreate },
};

describe('AuditService — integração com sanitização', () => {
  let service: AuditService;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockCreate.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);

    loggerWarnSpy = jest
      .spyOn((service as unknown as { logger: { warn: jest.Mock } }).logger, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. payload com passwordHash grava [REDACTED] em module_audit_logs e emite warn com redactedKeys', async () => {
    await service.log({
      actorUserId: 'user-abc',
      action: 'TEST_ACTION',
      entity: 'User',
      entityId: 'entity-1',
      payload: { passwordHash: 'bcrypt-hash-valor', nome: 'João' },
      ip: '192.168.0.1',
      userAgent: 'Jest/1.0',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callData = mockCreate.mock.calls[0][0].data;

    expect(callData.payload.passwordHash).toBe('[REDACTED]');
    expect(callData.payload.nome).toBe('João');

    expect(loggerWarnSpy).toHaveBeenCalledTimes(1);
    const warnCall = loggerWarnSpy.mock.calls[0];
    const warnMeta = warnCall[1] as { redactedKeys: string[] };
    expect(warnMeta.redactedKeys).toContain('passwordHash');
    expect(String(warnCall[0])).not.toContain('bcrypt-hash-valor');
  });

  it('2. payload limpo não emite warn e grava sem alteração', async () => {
    await service.log({
      actorUserId: 'user-abc',
      action: 'CASE_CREATED',
      entity: 'Case',
      entityId: 'case-1',
      payload: { companyId: 'comp-1', documentsCount: 2 },
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callData = mockCreate.mock.calls[0][0].data;

    expect(callData.payload.companyId).toBe('comp-1');
    expect(callData.payload.documentsCount).toBe(2);

    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('3. action, entity, entityId, ip e userAgent não são afetados pelo sanitizador', async () => {
    await service.log({
      actorUserId: 'user-xyz',
      action: 'COMPANY_CLAIM_SUBMITTED',
      entity: 'CompanyClaim',
      entityId: 'claim-99',
      payload: { documentsCount: 1 },
      ip: '10.0.0.5',
      userAgent: 'Mozilla/5.0',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callData = mockCreate.mock.calls[0][0].data;

    expect(callData.action).toBe('COMPANY_CLAIM_SUBMITTED');
    expect(callData.entity).toBe('CompanyClaim');
    expect(callData.entityId).toBe('claim-99');
    expect(callData.ip).toBe('10.0.0.5');
    expect(callData.userAgent).toBe('Mozilla/5.0');
    expect(callData.actorUserId).toBe('user-xyz');
  });
});
