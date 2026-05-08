import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CaseStateMachineService } from './case-state-machine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../common/audit/audit.service';
import { CaseStatus, ActorRole } from '@prisma/client';
import { TRANSITIONS, ALLOWED_ACTORS, TransitionKey } from './transitions';
import { CASE_STATUS_CHANGED_V1 } from '../../../common/events/schemas/cases/status-changed';

const FAKE_CASE_ID = '00000000-0000-4000-a000-000000000001';
const CONSUMER_ID = '00000000-0000-4000-a000-000000000002';
const COMPANY_USER_ID = '00000000-0000-4000-a000-000000000003';
const COMPANY_ID = '00000000-0000-4000-a000-000000000004';
const TRANSITION_ID = 'trans-123';
const OCCURRED_AT = new Date('2026-05-08T10:00:00.000Z');

const mockPrisma = {
  $transaction: jest.fn(),
};

const mockEvents = { emit: jest.fn() };
const mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

function buildTransitionMock(fromStatus: CaseStatus, options: { companyLinked?: boolean } = {}) {
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: FAKE_CASE_ID,
          status: fromStatus,
          consumerUserId: CONSUMER_ID,
          companyId: COMPANY_ID,
        },
      ]),
      case: { update: jest.fn().mockResolvedValue({}) },
      companyProfile: { count: jest.fn().mockResolvedValue(options.companyLinked === false ? 0 : 1) },
      caseStatusTransition: {
        create: jest.fn().mockResolvedValue({ id: TRANSITION_ID, occurredAt: OCCURRED_AT }),
      },
    };
    return cb(tx);
  });
}

describe('CaseStateMachineService', () => {
  let service: CaseStateMachineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseStateMachineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<CaseStateMachineService>(CaseStateMachineService);
    jest.clearAllMocks();
    mockAudit.log.mockResolvedValue(undefined);
  });

  const validTransitions: [CaseStatus, CaseStatus, ActorRole, string?][] = [
    [CaseStatus.ENVIADO, CaseStatus.EM_MODERACAO, ActorRole.admin],
    [CaseStatus.ENVIADO, CaseStatus.EM_MODERACAO, ActorRole.system],
    [CaseStatus.EM_MODERACAO, CaseStatus.PUBLICADO, ActorRole.admin],
    [CaseStatus.EM_MODERACAO, CaseStatus.NAO_RESOLVIDO, ActorRole.admin],
    [CaseStatus.PUBLICADO, CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, ActorRole.system],
    [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, CaseStatus.EM_NEGOCIACAO, ActorRole.company, COMPANY_USER_ID],
    [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, CaseStatus.NAO_RESOLVIDO, ActorRole.system],
    [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, CaseStatus.NAO_RESOLVIDO, ActorRole.admin],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.RESOLVIDO, ActorRole.system],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.RESOLVIDO, ActorRole.admin],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.NAO_RESOLVIDO, ActorRole.admin],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.NAO_RESOLVIDO, ActorRole.consumer, CONSUMER_ID],
  ];

  it.each(validTransitions)(
    'permite %s → %s por %s e emite timeline, auditoria e eventos',
    async (from, to, role, actorId) => {
      buildTransitionMock(from);

      const result = await service.transition(FAKE_CASE_ID, to, { id: actorId, role });

      expect(result.fromStatus).toBe(from);
      expect(result.toStatus).toBe(to);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CASE_STATUS_TRANSITION',
          entity: 'case',
          entityId: FAKE_CASE_ID,
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        CASE_STATUS_CHANGED_V1,
        expect.objectContaining({
          type: CASE_STATUS_CHANGED_V1,
          version: 1,
          producer: 'api',
          payload: expect.objectContaining({
            caseId: FAKE_CASE_ID,
            fromStatus: from,
            toStatus: to,
            actorRole: role,
            transitionId: TRANSITION_ID,
            occurredAt: OCCURRED_AT.toISOString(),
          }),
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'case.status.changed',
        expect.objectContaining({ caseId: FAKE_CASE_ID, toStatus: to }),
      );
    },
  );

  it('emite evento versionado com payload mínimo sem dados pessoais', async () => {
    buildTransitionMock(CaseStatus.EM_NEGOCIACAO);

    await service.transition(FAKE_CASE_ID, CaseStatus.RESOLVIDO, { role: ActorRole.admin });

    const [, event] = mockEvents.emit.mock.calls.find(([eventName]) => eventName === CASE_STATUS_CHANGED_V1) ?? [];
    expect(event).toBeTruthy();
    expect(Object.keys(event.payload).sort()).toEqual(
      ['actorRole', 'caseId', 'fromStatus', 'occurredAt', 'toStatus', 'transitionId'].sort(),
    );
    expect(JSON.stringify(event.payload)).not.toContain('consumer');
    expect(JSON.stringify(event.payload)).not.toContain('description');
    expect(JSON.stringify(event.payload)).not.toContain('companyId');
    expect(JSON.stringify(event.payload)).not.toContain('ip');
  });

  const allStatuses = Object.values(CaseStatus);
  const invalidCombinations: [CaseStatus, CaseStatus][] = [];
  for (const from of allStatuses) {
    for (const to of allStatuses) {
      if (from !== to && !TRANSITIONS[from]?.has(to)) invalidCombinations.push([from, to]);
    }
  }

  it.each(invalidCombinations)(
    'bloqueia transição inválida %s → %s',
    async (from, to) => {
      buildTransitionMock(from);

      const key: TransitionKey = `${from}->${to}`;
      const allowedRoles = ALLOWED_ACTORS[key];
      const actorRole = allowedRoles?.[0] ?? ActorRole.admin;

      await expect(service.transition(FAKE_CASE_ID, to, { role: actorRole })).rejects.toMatchObject(
        expect.objectContaining({ response: expect.objectContaining({ code: 'CASE_INVALID_TRANSITION' }) }),
      );
    },
  );

  it('403 CASE_TRANSITION_FORBIDDEN — consumer tenta ENVIADO → EM_MODERACAO', async () => {
    buildTransitionMock(CaseStatus.ENVIADO);
    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_MODERACAO, { id: CONSUMER_ID, role: ActorRole.consumer }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 CASE_COMPANY_ACCESS_FORBIDDEN — company sem vínculo tenta responder', async () => {
    buildTransitionMock(CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, { companyLinked: false });
    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_NEGOCIACAO, { id: COMPANY_USER_ID, role: ActorRole.company }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404 CASE_NOT_FOUND — id inexistente', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        case: { update: jest.fn() },
        companyProfile: { count: jest.fn() },
        caseStatusTransition: { create: jest.fn() },
      };
      return cb(tx);
    });

    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_MODERACAO, { role: ActorRole.admin }),
    ).rejects.toThrow(NotFoundException);
  });

  it('409 CASE_STATE_CONFLICT — já está no estado alvo', async () => {
    buildTransitionMock(CaseStatus.EM_MODERACAO);
    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_MODERACAO, { role: ActorRole.admin }),
    ).rejects.toThrow(ConflictException);
  });

  it('preenche publishedAt ao transitar para PUBLICADO', async () => {
    let capturedData: Record<string, unknown> = {};
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([
          { id: FAKE_CASE_ID, status: CaseStatus.EM_MODERACAO, consumerUserId: CONSUMER_ID, companyId: COMPANY_ID },
        ]),
        case: { update: jest.fn().mockImplementation(({ data }) => { capturedData = data; return Promise.resolve({}); }) },
        companyProfile: { count: jest.fn().mockResolvedValue(1) },
        caseStatusTransition: { create: jest.fn().mockResolvedValue({ id: 'trans-pub', occurredAt: OCCURRED_AT }) },
      };
      return cb(tx);
    });

    await service.transition(FAKE_CASE_ID, CaseStatus.PUBLICADO, { role: ActorRole.admin });

    expect(capturedData).toHaveProperty('publishedAt');
    expect(capturedData.publishedAt).toBeInstanceOf(Date);
  });

  it('preenche closedAt ao transitar para RESOLVIDO', async () => {
    let capturedData: Record<string, unknown> = {};
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([
          { id: FAKE_CASE_ID, status: CaseStatus.EM_NEGOCIACAO, consumerUserId: CONSUMER_ID, companyId: COMPANY_ID },
        ]),
        case: { update: jest.fn().mockImplementation(({ data }) => { capturedData = data; return Promise.resolve({}); }) },
        companyProfile: { count: jest.fn().mockResolvedValue(1) },
        caseStatusTransition: { create: jest.fn().mockResolvedValue({ id: 'trans-res', occurredAt: OCCURRED_AT }) },
      };
      return cb(tx);
    });

    await service.transition(FAKE_CASE_ID, CaseStatus.RESOLVIDO, { role: ActorRole.admin });

    expect(capturedData).toHaveProperty('closedAt');
  });
});
