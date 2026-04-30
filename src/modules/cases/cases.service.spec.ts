import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesRepository } from './cases.repository';
import { LegalTermsService } from '../legal-terms/legal-terms.service';
import { CaseCategory, ExperienceType, CaseStatus } from '@prisma/client';
import { OpenCaseDto } from './dto/open-case.dto';

const VALID_COMPANY_ID = '550e8400-e29b-41d4-a716-446655440001';
const CONSUMER_ID = '550e8400-e29b-41d4-a716-446655440002';
const PAST_DATE = '2026-01-15';
const LONG_DESC = 'A'.repeat(50);

const mockRepo = {
  createDraft: jest.fn(),
  companyExists: jest.fn(),
  findById: jest.fn(),
  findByPublicId: jest.fn(),
  listByConsumer: jest.fn(),
  listByCompany: jest.fn(),
};

describe('CasesService', () => {
  let service: CasesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        { provide: CasesRepository, useValue: mockRepo },
        { provide: LegalTermsService, useValue: { validateAndCreateAcceptance: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<CasesService>(CasesService);
    jest.clearAllMocks();
  });

  // ─── openCase: sucesso ─────────────────────────────────────────────────────

  it('cria caso válido e retorna publicId', async () => {
    mockRepo.companyExists.mockResolvedValue(true);
    mockRepo.createDraft.mockResolvedValue({
      id: 'abc-123',
      publicId: 'TC-2026-000001',
      status: CaseStatus.ENVIADO,
    });

    const dto: OpenCaseDto = {
      companyId: VALID_COMPANY_ID,
      experienceType: ExperienceType.reclamacao,
      category: CaseCategory.ecommerce,
      description: LONG_DESC,
      occurredAt: PAST_DATE,
      legalAcceptance: { termId: 'term-uuid-1', contentHashEcho: 'abc123' },
    };

    const result = await service.openCase(CONSUMER_ID, dto);

    expect(result.publicId).toBe('TC-2026-000001');
    expect(result.status).toBe(CaseStatus.ENVIADO);
    expect(mockRepo.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        consumerUserId: CONSUMER_ID,
        companyId: VALID_COMPANY_ID,
      }),
    );
  });

  // ─── openCase: data futura ────────────────────────────────────────────────

  it('rejeita occurredAt no futuro com CASE_OCCURRED_AT_FUTURE', async () => {
    mockRepo.companyExists.mockResolvedValue(true);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const futureDateStr = tomorrow.toISOString().split('T')[0];

    const dto: OpenCaseDto = {
      companyId: VALID_COMPANY_ID,
      experienceType: ExperienceType.reclamacao,
      category: CaseCategory.servicos,
      description: LONG_DESC,
      occurredAt: futureDateStr,
      legalAcceptance: { termId: 'term-uuid-1', contentHashEcho: 'abc123' },
    };

    await expect(service.openCase(CONSUMER_ID, dto)).rejects.toThrow(UnprocessableEntityException);

    try {
      await service.openCase(CONSUMER_ID, dto);
    } catch (e) {
      const err = e as UnprocessableEntityException;
      expect((err.getResponse() as { code: string }).code).toBe('CASE_OCCURRED_AT_FUTURE');
    }
  });

  // ─── openCase: descrição curta ────────────────────────────────────────────

  it('rejeita descrição com menos de 50 chars com CASE_DESCRIPTION_TOO_SHORT', async () => {
    mockRepo.companyExists.mockResolvedValue(true);

    const dto: OpenCaseDto = {
      companyId: VALID_COMPANY_ID,
      experienceType: ExperienceType.reclamacao,
      category: CaseCategory.outro,
      description: 'curta',
      occurredAt: PAST_DATE,
      legalAcceptance: { termId: 'term-uuid-1', contentHashEcho: 'abc123' },
    };

    await expect(service.openCase(CONSUMER_ID, dto)).rejects.toThrow(UnprocessableEntityException);

    try {
      await service.openCase(CONSUMER_ID, dto);
    } catch (e) {
      const err = e as UnprocessableEntityException;
      expect((err.getResponse() as { code: string }).code).toBe('CASE_DESCRIPTION_TOO_SHORT');
    }
  });

  // ─── openCase: empresa inexistente ───────────────────────────────────────

  it('rejeita companyId inexistente com COMPANY_NOT_FOUND', async () => {
    mockRepo.companyExists.mockResolvedValue(false);

    const dto: OpenCaseDto = {
      companyId: VALID_COMPANY_ID,
      experienceType: ExperienceType.denuncia,
      category: CaseCategory.financeiro,
      description: LONG_DESC,
      occurredAt: PAST_DATE,
      legalAcceptance: { termId: 'term-uuid-1', contentHashEcho: 'abc123' },
    };

    await expect(service.openCase(CONSUMER_ID, dto)).rejects.toThrow(NotFoundException);

    try {
      await service.openCase(CONSUMER_ID, dto);
    } catch (e) {
      const err = e as NotFoundException;
      expect((err.getResponse() as { code: string }).code).toBe('COMPANY_NOT_FOUND');
    }
  });

  // ─── getCase: não encontrado ──────────────────────────────────────────────

  it('rejeita id inexistente com CASE_NOT_FOUND', async () => {
    mockRepo.findByPublicId.mockResolvedValue(null);

    await expect(service.getCase('TC-2026-999999')).rejects.toThrow(NotFoundException);
  });
});
