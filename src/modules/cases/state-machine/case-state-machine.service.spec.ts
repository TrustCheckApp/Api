import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CaseStateMachineService } from './case-state-machine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CaseStatus, ActorRole } from '@prisma/client';
import { TRANSITIONS, ALLOWED_ACTORS, TransitionKey } from './transitions';

const FAKE_CASE_ID = '00000000-0000-4000-a000-000000000001';

const mockPrisma = {
  $transaction: jest.fn(),
  case: { update: jest.fn() },
  caseStatusTransition: { create: jest.fn() },
};

const mockEvents = { emit: jest.fn() };

function buildTransactionMock(fromStatus: CaseStatus) {
  mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: FAKE_CASE_ID, status: fromStatus }]),
      case: { update: jest.fn().mockResolvedValue({}) },
      caseStatusTransition: {
        create: jest.fn().mockResolvedValue({
          id: 'trans-123',
          occurredAt: new Date(),
        }),
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
      ],
    }).compile();

    service = module.get<CaseStateMachineService>(CaseStateMachineService);
    jest.clearAllMocks();
  });

  // ─── Transições VÁLIDAS (parametrizadas) ─────────────────────────────────

  const validTransitions: [CaseStatus, CaseStatus, ActorRole][] = [
    [CaseStatus.ENVIADO, CaseStatus.EM_MODERACAO, ActorRole.admin],
    [CaseStatus.ENVIADO, CaseStatus.EM_MODERACAO, ActorRole.system],
    [CaseStatus.EM_MODERACAO, CaseStatus.PUBLICADO, ActorRole.admin],
    [CaseStatus.EM_MODERACAO, CaseStatus.NAO_RESOLVIDO, ActorRole.admin],
    [CaseStatus.PUBLICADO, CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, ActorRole.system],
    [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, CaseStatus.EM_NEGOCIACAO, ActorRole.company],
    [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, CaseStatus.NAO_RESOLVIDO, ActorRole.system],
    [CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA, CaseStatus.NAO_RESOLVIDO, ActorRole.admin],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.RESOLVIDO, ActorRole.system],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.RESOLVIDO, ActorRole.admin],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.NAO_RESOLVIDO, ActorRole.admin],
    [CaseStatus.EM_NEGOCIACAO, CaseStatus.NAO_RESOLVIDO, ActorRole.consumer],
  ];

  it.each(validTransitions)(
    '✅ %s → %s por %s deve ser PERMITIDO',
    async (from, to, role) => {
      buildTransactionMock(from);

      const result = await service.transition(FAKE_CASE_ID, to, { role });

      expect(result.fromStatus).toBe(from);
      expect(result.toStatus).toBe(to);
      expect(mockEvents.emit).toHaveBeenCalledWith('case.status.changed', expect.objectContaining({ toStatus: to }));
    },
  );

  // ─── Transições INVÁLIDAS (parametrizadas) ────────────────────────────────

  const allStatuses = Object.values(CaseStatus);

  const invalidCombinations: [CaseStatus, CaseStatus][] = [];
  for (const from of allStatuses) {
    for (const to of allStatuses) {
      if (from !== to && !TRANSITIONS[from]?.has(to)) {
        invalidCombinations.push([from, to]);
      }
    }
  }

  it.each(invalidCombinations)(
    '❌ %s → %s deve lançar CASE_INVALID_TRANSITION',
    async (from, to) => {
      buildTransactionMock(from);

      const key: TransitionKey = `${from}->${to}`;
      const allowedRoles = ALLOWED_ACTORS[key];
      const actorRole = allowedRoles?.[0] ?? ActorRole.admin;

      await expect(
        service.transition(FAKE_CASE_ID, to, { role: actorRole }),
      ).rejects.toMatchObject(
        expect.objectContaining({ response: expect.objectContaining({ code: 'CASE_INVALID_TRANSITION' }) }),
      );
    },
  );

  // ─── Autorização errada ────────────────────────────────────────────────────

  it('403 CASE_TRANSITION_FORBIDDEN — consumer tenta ENVIADO → EM_MODERACAO', async () => {
    buildTransactionMock(CaseStatus.ENVIADO);

    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_MODERACAO, { role: ActorRole.consumer }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('403 CASE_TRANSITION_FORBIDDEN — company tenta EM_MODERACAO → PUBLICADO', async () => {
    buildTransactionMock(CaseStatus.EM_MODERACAO);

    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.PUBLICADO, { role: ActorRole.company }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Caso não encontrado ───────────────────────────────────────────────────

  it('404 CASE_NOT_FOUND — id inexistente', async () => {
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        case: { update: jest.fn() },
        caseStatusTransition: { create: jest.fn() },
      };
      return cb(tx);
    });

    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_MODERACAO, { role: ActorRole.admin }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── Conflito de estado ────────────────────────────────────────────────────

  it('409 CASE_STATE_CONFLICT — já está no estado alvo', async () => {
    buildTransactionMock(CaseStatus.EM_MODERACAO);

    await expect(
      service.transition(FAKE_CASE_ID, CaseStatus.EM_MODERACAO, { role: ActorRole.admin }),
    ).rejects.toThrow(ConflictException);
  });

  // ─── published_at e closed_at preenchidos ─────────────────────────────────

  it('preenche publishedAt ao transitar para PUBLICADO', async () => {
    let capturedData: Record<string, unknown> = {};
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: FAKE_CASE_ID, status: CaseStatus.EM_MODERACAO }]),
        case: {
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            capturedData = data;
            return Promise.resolve({});
          }),
        },
        caseStatusTransition: {
          create: jest.fn().mockResolvedValue({ id: 'trans-pub', occurredAt: new Date() }),
        },
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
        $queryRaw: jest.fn().mockResolvedValue([{ id: FAKE_CASE_ID, status: CaseStatus.EM_NEGOCIACAO }]),
        case: {
          update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            capturedData = data;
            return Promise.resolve({});
          }),
        },
        caseStatusTransition: {
          create: jest.fn().mockResolvedValue({ id: 'trans-res', occurredAt: new Date() }),
        },
      };
      return cb(tx);
    });

    await service.transition(FAKE_CASE_ID, CaseStatus.RESOLVIDO, { role: ActorRole.admin });

    expect(capturedData).toHaveProperty('closedAt');
  });
});
