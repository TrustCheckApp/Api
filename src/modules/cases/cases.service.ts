import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CasesRepository } from './cases.repository';
import { OpenCaseDto } from './dto/open-case.dto';
import { LegalTermsService } from '../legal-terms/legal-terms.service';

@Injectable()
export class CasesService {
  constructor(
    private readonly repo: CasesRepository,
    private readonly legalTermsService: LegalTermsService,
  ) {}

  async openCase(
    consumerUserId: string,
    dto: OpenCaseDto,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const occurred = new Date(dto.occurredAt);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (occurred > today) {
      throw new UnprocessableEntityException({
        code: 'CASE_OCCURRED_AT_FUTURE',
        message: 'A data do ocorrido não pode ser no futuro.',
      });
    }

    if (dto.description.length < 50) {
      throw new UnprocessableEntityException({
        code: 'CASE_DESCRIPTION_TOO_SHORT',
        message: 'A descrição deve ter no mínimo 50 caracteres.',
      });
    }

    const companyExists = await this.repo.companyExists(dto.companyId);
    if (!companyExists) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: 'Empresa não encontrada.',
      });
    }

    const created = await this.repo.createDraft({
      consumerUserId,
      companyId: dto.companyId,
      experienceType: dto.experienceType,
      category: dto.category,
      description: dto.description,
      monetaryValue: dto.monetaryValue,
      occurredAt: occurred,
    });

    await this.legalTermsService.validateAndCreateAcceptance({
      caseId: created.id,
      userId: consumerUserId,
      termId: dto.legalAcceptance.termId,
      contentHashEcho: dto.legalAcceptance.contentHashEcho,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      id: created.id,
      publicId: created.publicId,
      status: created.status,
    };
  }

  async getCase(idOrPublicId: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idOrPublicId);

    const found = isUuid
      ? await this.repo.findById(idOrPublicId)
      : await this.repo.findByPublicId(idOrPublicId);

    if (!found) {
      throw new NotFoundException({
        code: 'CASE_NOT_FOUND',
        message: 'Caso não encontrado.',
      });
    }

    return found;
  }
}
