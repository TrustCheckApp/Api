import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ActorRole } from '@prisma/client';
import { CreateCaseEvidenceDto } from './dto/create-case-evidence.dto';
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_SIZE_BYTES,
} from './case-evidence.constants';
import {
  CaseEvidencesRepository,
  CaseEvidencePublicRow,
} from './case-evidences.repository';

export interface EvidenceActor {
  id: string;
  role: string;
}

@Injectable()
export class CaseEvidencesService {
  constructor(private readonly repository: CaseEvidencesRepository) {}

  async create(caseId: string, actor: EvidenceActor, dto: CreateCaseEvidenceDto) {
    this.validateEvidence(dto);

    const access = await this.repository.findCaseAccess(caseId, actor.id);
    if (!access) {
      throw new NotFoundException({
        code: 'CASE_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }

    if (!this.canWriteEvidence(access.consumerUserId, access.companyUserLinked, actor)) {
      throw new ForbiddenException({
        code: 'CASE_EVIDENCE_FORBIDDEN',
        message: 'Ator não possui permissão para adicionar evidência neste caso.',
      });
    }

    const evidenceId = uuidv4();
    const storageKey = `cases/${caseId}/evidences/${evidenceId}/${this.sanitizeFileName(dto.fileName)}`;

    const created = await this.repository.create({
      id: evidenceId,
      caseId,
      uploadedByUserId: actor.id,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      checksumSha256: dto.checksumSha256?.toLowerCase() ?? null,
      description: dto.description ?? null,
      storageKey,
    });

    return {
      ...this.toPublicResponse(created),
      upload: {
        method: 'SIGNED_UPLOAD_PENDING',
      },
    };
  }

  async list(caseId: string, actor: EvidenceActor) {
    const access = await this.repository.findCaseAccess(caseId, actor.id);
    if (!access) {
      throw new NotFoundException({
        code: 'CASE_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }

    if (!this.canReadEvidence(access.consumerUserId, access.companyUserLinked, actor)) {
      throw new ForbiddenException({
        code: 'CASE_EVIDENCE_FORBIDDEN',
        message: 'Ator não possui permissão para consultar evidências deste caso.',
      });
    }

    const evidences = await this.repository.listByCase(caseId);
    return { items: evidences.map((evidence) => this.toPublicResponse(evidence)) };
  }

  private validateEvidence(dto: CreateCaseEvidenceDto): void {
    if (!ALLOWED_EVIDENCE_MIME_TYPES.includes(dto.mimeType as never)) {
      throw new UnprocessableEntityException({
        code: 'CASE_EVIDENCE_UNSUPPORTED_TYPE',
        message: 'Formato de evidência não permitido.',
      });
    }

    if (dto.sizeBytes > MAX_EVIDENCE_SIZE_BYTES) {
      throw new UnprocessableEntityException({
        code: 'CASE_EVIDENCE_SIZE_EXCEEDED',
        message: 'Arquivo excede o tamanho máximo permitido para evidências.',
      });
    }
  }

  private canWriteEvidence(consumerUserId: string, companyUserLinked: boolean, actor: EvidenceActor): boolean {
    if (actor.role === ActorRole.consumer) return consumerUserId === actor.id;
    if (actor.role === ActorRole.company) return companyUserLinked;
    return false;
  }

  private canReadEvidence(consumerUserId: string, companyUserLinked: boolean, actor: EvidenceActor): boolean {
    if (actor.role === ActorRole.admin) return true;
    return this.canWriteEvidence(consumerUserId, companyUserLinked, actor);
  }

  private sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private toPublicResponse(evidence: CaseEvidencePublicRow) {
    return {
      id: evidence.id,
      caseId: evidence.caseId,
      uploadedByUserId: evidence.uploadedByUserId,
      fileName: evidence.fileName,
      mimeType: evidence.mimeType,
      sizeBytes: evidence.sizeBytes,
      checksumSha256: evidence.checksumSha256,
      description: evidence.description,
      status: evidence.status,
      createdAt: evidence.createdAt,
    };
  }
}
