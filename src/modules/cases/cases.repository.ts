import {
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Case, CaseStatus, Prisma } from '@prisma/client';

export interface CreateCaseData {
  consumerUserId: string;
  companyId: string;
  experienceType: string;
  category: string;
  description: string;
  monetaryValue?: number;
  occurredAt: Date;
}

export interface CreateCaseLegalAcceptanceData {
  userId: string;
  termId: string;
  contentHashEcho: string;
  ip?: string;
  userAgent?: string;
}

const CASE_PUBLIC_SELECT = {
  id: true,
  publicId: true,
  status: true,
  experienceType: true,
  category: true,
  description: true,
  monetaryValue: true,
  occurredAt: true,
  submittedAt: true,
  publishedAt: true,
  company: {
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      cnpj: false,
    },
  },
} as const;

@Injectable()
export class CasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(data: CreateCaseData): Promise<Case> {
    return this.prisma.case.create({
      data: {
        consumerUserId: data.consumerUserId,
        companyId: data.companyId,
        experienceType: data.experienceType as Prisma.EnumExperienceTypeFilter['equals'],
        category: data.category as Prisma.EnumCaseCategoryFilter['equals'],
        description: data.description,
        monetaryValue: data.monetaryValue ?? null,
        occurredAt: data.occurredAt,
        status: CaseStatus.ENVIADO,
      },
    });
  }

  async createDraftWithLegalAcceptance(
    data: CreateCaseData,
    acceptance: CreateCaseLegalAcceptanceData,
  ): Promise<Pick<Case, 'id' | 'publicId' | 'status'>> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.case.create({
        data: {
          consumerUserId: data.consumerUserId,
          companyId: data.companyId,
          experienceType: data.experienceType as Prisma.EnumExperienceTypeFilter['equals'],
          category: data.category as Prisma.EnumCaseCategoryFilter['equals'],
          description: data.description,
          monetaryValue: data.monetaryValue ?? null,
          occurredAt: data.occurredAt,
          status: CaseStatus.ENVIADO,
        },
        select: {
          id: true,
          publicId: true,
          status: true,
        },
      });

      const term = await tx.legalTermV2.findUnique({
        where: { id: acceptance.termId },
        select: {
          id: true,
          version: true,
          contentHash: true,
          active: true,
        },
      });

      if (!term) {
        throw new NotFoundException({
          code: 'LEGAL_TERM_NOT_FOUND',
          message: 'Termo legal não encontrado.',
        });
      }

      if (!term.active) {
        throw new GoneException({
          code: 'LEGAL_TERM_INACTIVE',
          message: 'O termo legal informado não está mais ativo.',
        });
      }

      if (acceptance.contentHashEcho !== term.contentHash) {
        throw new ConflictException({
          code: 'LEGAL_TERM_HASH_MISMATCH',
          message: 'O hash do conteúdo do termo não confere. Recarregue o termo e tente novamente.',
        });
      }

      await tx.caseTermAcceptance.create({
        data: {
          caseId: created.id,
          userId: acceptance.userId,
          termId: term.id,
          termVersion: term.version,
          contentHash: term.contentHash,
          ip: acceptance.ip,
          userAgent: acceptance.userAgent,
        },
      });

      return created;
    });
  }

  async findById(id: string) {
    return this.prisma.case.findUnique({
      where: { id },
      select: CASE_PUBLIC_SELECT,
    });
  }

  async findByPublicId(publicId: string) {
    return this.prisma.case.findUnique({
      where: { publicId },
      select: CASE_PUBLIC_SELECT,
    });
  }

  async findAuditAccessById(id: string) {
    return this.prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        consumerUserId: true,
      },
    });
  }

  async listByConsumer(consumerUserId: string, skip = 0, take = 20) {
    return this.prisma.case.findMany({
      where: { consumerUserId },
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
      select: CASE_PUBLIC_SELECT,
    });
  }

  async listByCompany(companyId: string, skip = 0, take = 20) {
    return this.prisma.case.findMany({
      where: { companyId },
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
      select: CASE_PUBLIC_SELECT,
    });
  }

  async companyExists(companyId: string): Promise<boolean> {
    const count = await this.prisma.company.count({ where: { id: companyId } });
    return count > 0;
  }
}
