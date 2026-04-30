import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TermKind } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class LegalTermsRepository {
  constructor(private readonly prisma: PrismaService) {}

  computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  async findByVersionAndKind(version: string, kind: TermKind) {
    return this.prisma.legalTermV2.findUnique({
      where: { legal_terms_v2_version_kind_unique: { version, kind } },
    });
  }

  async deactivateKind(kind: TermKind) {
    return this.prisma.legalTermV2.updateMany({
      where: { kind, active: true },
      data: { active: false },
    });
  }

  async create(data: {
    version: string;
    kind: TermKind;
    content: string;
    contentHash: string;
    publishedBy?: string;
  }) {
    const now = new Date();
    return this.prisma.legalTermV2.create({
      data: {
        version: data.version,
        kind: data.kind,
        content: data.content,
        contentHash: data.contentHash,
        publishedBy: data.publishedBy ?? null,
        publishedAt: now,
        active: true,
      },
      select: {
        id: true,
        version: true,
        kind: true,
        contentHash: true,
        publishedAt: true,
        active: true,
      },
    });
  }

  async findActive(kind: TermKind) {
    return this.prisma.legalTermV2.findFirst({
      where: { kind, active: true },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        version: true,
        kind: true,
        content: true,
        contentHash: true,
        publishedAt: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.legalTermV2.findUnique({ where: { id } });
  }

  async findByVersion(version: string, kind?: TermKind) {
    return this.prisma.legalTermV2.findMany({
      where: kind ? { version, kind } : { version },
    });
  }

  async listAcceptancesByVersion(
    version: string,
    from?: Date,
    to?: Date,
    skip = 0,
    take = 50,
  ) {
    return this.prisma.caseTermAcceptance.findMany({
      where: {
        termVersion: version,
        acceptedAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { acceptedAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        caseId: true,
        userId: true,
        termVersion: true,
        contentHash: true,
        acceptedAt: true,
        ip: true,
      },
    });
  }

  async createAcceptance(data: {
    caseId: string;
    userId: string;
    termId: string;
    termVersion: string;
    contentHash: string;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.caseTermAcceptance.create({ data });
  }

  async findAcceptanceByCaseId(caseId: string) {
    return this.prisma.caseTermAcceptance.findUnique({ where: { caseId } });
  }
}
