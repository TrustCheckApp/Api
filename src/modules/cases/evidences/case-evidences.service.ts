import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ActorRole } from '@prisma/client';
import { CreateCaseEvidenceDto } from './dto/create-case-evidence.dto';
import { RequestCaseEvidenceUploadDto } from './dto/request-case-evidence-upload.dto';
import {
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_SIZE_BYTES,
} from './case-evidence.constants';
import {
  CaseEvidencesRepository,
  CaseEvidencePublicRow,
} from './case-evidences.repository';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface EvidenceActor {
  id: string;
  role: string;
}

@Injectable()
export class CaseEvidencesService {
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(
    private readonly repository: CaseEvidencesRepository,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.bucket = this.config.get<string>('S3_BUCKET_MEDIA') ?? 'trustcheck-media-dev';
    const region = this.config.get<string>('AWS_REGION') ?? 'sa-east-1';
    this.s3 = new S3Client({ region });
  }

  async requestUpload(caseId: string, actor: EvidenceActor, dto: RequestCaseEvidenceUploadDto) {
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

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: dto.mimeType,
      ServerSideEncryption: 'AES256',
    });
    const expiresIn = 900;
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
    const uploadToken = await this.jwt.signAsync(
      { caseId, evidenceId, storageKey, fileName: dto.fileName, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '20m',
      },
    );

    return {
      evidenceId,
      uploadUrl,
      uploadToken,
      expiresIn,
    };
  }

  async create(caseId: string, actor: EvidenceActor, dto: CreateCaseEvidenceDto) {
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

    let payload: {
      caseId: string;
      evidenceId: string;
      storageKey: string;
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    };
    try {
      payload = await this.jwt.verifyAsync(dto.uploadToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'CASE_EVIDENCE_UPLOAD_TOKEN_INVALID',
        message: 'Token de upload inválido ou expirado.',
      });
    }

    if (payload.caseId !== caseId) {
      throw new UnauthorizedException({
        code: 'CASE_EVIDENCE_UPLOAD_TOKEN_INVALID',
        message: 'Token de upload incompatível com o caso informado.',
      });
    }

    const created = await this.repository.create({
      id: payload.evidenceId,
      caseId,
      uploadedByUserId: actor.id,
      fileName: payload.fileName,
      mimeType: payload.mimeType,
      sizeBytes: payload.sizeBytes,
      checksumSha256: dto.checksumSha256?.toLowerCase() ?? null,
      description: dto.description ?? null,
      storageKey: payload.storageKey,
    });
    await this.repository.markUploaded(payload.evidenceId);

    return this.toPublicResponse(created);
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

  private validateEvidence(dto: { mimeType: string; sizeBytes: number }): void {
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
