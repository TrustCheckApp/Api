import { Injectable } from '@nestjs/common';
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
