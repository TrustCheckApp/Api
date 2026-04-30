import {
  Injectable,
  ConflictException,
  NotFoundException,
  GoneException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LegalTermsRepository } from './legal-terms.repository';
import { PublishTermDto } from './dto/legal-terms.dto';
import { TermKind } from '@prisma/client';

@Injectable()
export class LegalTermsService {
  constructor(private readonly repo: LegalTermsRepository) {}

  async publish(dto: PublishTermDto, publishedBy: string) {
    const existing = await this.repo.findByVersionAndKind(dto.version, dto.kind);
    if (existing) {
      throw new ConflictException({
        code: 'LEGAL_TERM_VERSION_EXISTS',
        message: `Já existe um termo do tipo '${dto.kind}' com a versão '${dto.version}'.`,
      });
    }

    const contentHash = this.repo.computeHash(dto.content);

    await this.repo.deactivateKind(dto.kind);

    const term = await this.repo.create({
      version: dto.version,
      kind: dto.kind,
      content: dto.content,
      contentHash,
      publishedBy,
    });

    return term;
  }

  async getActive(kind: TermKind) {
    const term = await this.repo.findActive(kind);
    if (!term) {
      throw new NotFoundException({
        code: 'LEGAL_TERM_NOT_FOUND',
        message: `Nenhum termo ativo encontrado para kind '${kind}'.`,
      });
    }
    return term;
  }

  async listAcceptancesByVersion(
    version: string,
    from?: string,
    to?: string,
    page = 1,
    limit = 50,
  ) {
    const skip = (page - 1) * limit;
    return this.repo.listAcceptancesByVersion(
      version,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
      skip,
      limit,
    );
  }

  async validateAndCreateAcceptance(params: {
    caseId: string;
    userId: string;
    termId: string;
    contentHashEcho: string;
    ip?: string;
    userAgent?: string;
  }) {
    const term = await this.repo.findById(params.termId);
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

    if (params.contentHashEcho !== term.contentHash) {
      throw new ConflictException({
        code: 'LEGAL_TERM_HASH_MISMATCH',
        message: 'O hash do conteúdo do termo não confere. Recarregue o termo e tente novamente.',
      });
    }

    const existing = await this.repo.findAcceptanceByCaseId(params.caseId);
    if (existing) {
      throw new UnprocessableEntityException({
        code: 'CASE_TERM_ALREADY_ACCEPTED',
        message: 'Este caso já possui um aceite de termo legal registrado.',
      });
    }

    return this.repo.createAcceptance({
      caseId: params.caseId,
      userId: params.userId,
      termId: params.termId,
      termVersion: term.version,
      contentHash: term.contentHash,
      ip: params.ip,
      userAgent: params.userAgent,
    });
  }
}
