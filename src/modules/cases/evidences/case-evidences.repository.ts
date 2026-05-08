import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CaseEvidenceAccessRow {
  id: string;
  consumerUserId: string;
  companyId: string;
  companyUserLinked: boolean;
}

export interface CreateCaseEvidenceData {
  id: string;
  caseId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  description?: string | null;
  storageKey: string;
}

export interface CaseEvidencePublicRow {
  id: string;
  caseId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  description: string | null;
  status: string;
  createdAt: Date;
}

@Injectable()
export class CaseEvidencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCaseAccess(caseId: string, actorUserId: string): Promise<CaseEvidenceAccessRow | null> {
    const rows = await this.prisma.$queryRaw<CaseEvidenceAccessRow[]>`
      SELECT
        c.id,
        c.consumer_user_id AS "consumerUserId",
        c.company_id AS "companyId",
        EXISTS (
          SELECT 1
          FROM company_profiles cp
          WHERE cp.user_id = ${actorUserId}::uuid
            AND cp.company_id = c.company_id
        ) AS "companyUserLinked"
      FROM cases c
      WHERE c.id = ${caseId}::uuid
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  async create(data: CreateCaseEvidenceData): Promise<CaseEvidencePublicRow> {
    const rows = await this.prisma.$queryRaw<CaseEvidencePublicRow[]>`
      INSERT INTO case_evidences (
        id,
        case_id,
        uploaded_by_user_id,
        file_name,
        mime_type,
        size_bytes,
        checksum_sha256,
        description,
        storage_key,
        status
      ) VALUES (
        ${data.id}::uuid,
        ${data.caseId}::uuid,
        ${data.uploadedByUserId}::uuid,
        ${data.fileName},
        ${data.mimeType},
        ${data.sizeBytes},
        ${data.checksumSha256 ?? null},
        ${data.description ?? null},
        ${data.storageKey},
        'pending_upload'
      )
      RETURNING
        id,
        case_id AS "caseId",
        uploaded_by_user_id AS "uploadedByUserId",
        file_name AS "fileName",
        mime_type AS "mimeType",
        size_bytes AS "sizeBytes",
        checksum_sha256 AS "checksumSha256",
        description,
        status,
        created_at AS "createdAt"
    `;

    return rows[0];
  }

  async listByCase(caseId: string): Promise<CaseEvidencePublicRow[]> {
    return this.prisma.$queryRaw<CaseEvidencePublicRow[]>`
      SELECT
        id,
        case_id AS "caseId",
        uploaded_by_user_id AS "uploadedByUserId",
        file_name AS "fileName",
        mime_type AS "mimeType",
        size_bytes AS "sizeBytes",
        checksum_sha256 AS "checksumSha256",
        description,
        status,
        created_at AS "createdAt"
      FROM case_evidences
      WHERE case_id = ${caseId}::uuid
      ORDER BY created_at DESC
    `;
  }
}
