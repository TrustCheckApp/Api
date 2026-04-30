import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { Request } from 'express';
import { CasesService } from './cases.service';
import { OpenCaseDto } from './dto/open-case.dto';
import { LegalTermsRepository } from '../legal-terms/legal-terms.repository';
import { RejectCaseDto, ResolveCaseDto, CloseUnresolvedDto } from './dto/transition.dto';
import { CaseStateMachineService } from './state-machine/case-state-machine.service';
import { ActorRole, CaseStatus } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { InternalGuard } from '../../common/guards/internal.guard';

type AuthRequest = Request & { user?: { id: string; role: string } };

@ApiTags('cases')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller('cases')
export class CasesController {
  constructor(
    private readonly casesService: CasesService,
    private readonly stateMachine: CaseStateMachineService,
    private readonly legalTermsRepo: LegalTermsRepository,
  ) {}

  // ─── Abrir caso ───────────────────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Abrir novo caso (M08 — consumidor autenticado)' })
  @ApiResponse({ status: 201, description: 'Caso criado com public_id gerado automaticamente' })
  @ApiResponse({ status: 404, description: 'Empresa não encontrada (COMPANY_NOT_FOUND)' })
  @ApiResponse({ status: 422, description: 'Validação: data futura, descrição curta, enum inválido' })
  @ApiResponse({ status: 401, description: 'Não autenticado' })
  async openCase(
    @Body() dto: OpenCaseDto,
    @Req() req: AuthRequest,
  ) {
    const consumerUserId = req.user?.id ?? '';
    return this.casesService.openCase(consumerUserId, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // ─── Consultar caso ───────────────────────────────────────────────────────

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar caso por UUID interno ou public_id (TC-YYYY-NNNNNN)' })
  @ApiParam({ name: 'id', description: 'UUID interno ou public_id no formato TC-YYYY-NNNNNN' })
  @ApiResponse({ status: 200, description: 'Dados públicos do caso' })
  @ApiResponse({ status: 404, description: 'Caso não encontrado (CASE_NOT_FOUND)' })
  async getCase(@Param('id') id: string) {
    return this.casesService.getCase(id);
  }

  @Get(':id/audit')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'consumer')
  @ApiOperation({ summary: 'Histórico de transições + aceite legal do caso (admin ou dono)' })
  @ApiParam({ name: 'id', description: 'UUID interno do caso' })
  @ApiResponse({ status: 200, description: 'Histórico auditável do caso' })
  @ApiResponse({ status: 404, description: 'Caso não encontrado' })
  async auditCase(@Param('id') id: string, @Req() req: AuthRequest) {
    const found = await this.casesService.getCase(id);
    const termAcceptance = await this.legalTermsRepo.findAcceptanceByCaseId(id);
    return {
      case: { id: (found as { id: string }).id, status: (found as { status: string }).status },
      termAcceptance: termAcceptance
        ? {
            termVersion: termAcceptance.termVersion,
            contentHash: termAcceptance.contentHash,
            acceptedAt: termAcceptance.acceptedAt,
            ip: termAcceptance.ip,
          }
        : null,
    };
  }

  // ─── Transições de estado ─────────────────────────────────────────────────

  @Post(':id/moderation/start')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'system')
  @ApiOperation({ summary: 'Iniciar moderação — ENVIADO → EM_MODERACAO (admin/system)' })
  @ApiResponse({ status: 200, description: 'Transição realizada' })
  @ApiResponse({ status: 409, description: 'Transição inválida ou conflito de estado' })
  @ApiResponse({ status: 403, description: 'Role não autorizado' })
  async startModeration(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.stateMachine.transition(
      id,
      CaseStatus.EM_MODERACAO,
      { id: req.user?.id, role: req.user?.role as ActorRole, ip: req.ip },
    );
  }

  @Post(':id/moderation/approve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Aprovar moderação — EM_MODERACAO → PUBLICADO (admin, W03)' })
  @ApiResponse({ status: 200, description: 'Caso publicado' })
  @ApiResponse({ status: 409, description: 'Transição inválida' })
  async approveModeration(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.stateMachine.transition(
      id,
      CaseStatus.PUBLICADO,
      { id: req.user?.id, role: req.user?.role as ActorRole, ip: req.ip },
    );
  }

  @Post(':id/moderation/reject')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Rejeitar na moderação — EM_MODERACAO → NAO_RESOLVIDO (admin)' })
  @ApiResponse({ status: 200, description: 'Caso encerrado como não resolvido' })
  @ApiResponse({ status: 409, description: 'Transição inválida' })
  async rejectModeration(
    @Param('id') id: string,
    @Body() dto: RejectCaseDto,
    @Req() req: AuthRequest,
  ) {
    return this.stateMachine.transition(
      id,
      CaseStatus.NAO_RESOLVIDO,
      { id: req.user?.id, role: req.user?.role as ActorRole, ip: req.ip },
      { reason: dto.reason },
    );
  }

  @Post(':id/notify-company')
  @HttpCode(HttpStatus.OK)
  @UseGuards(InternalGuard)
  @ApiOperation({ summary: 'Notificar empresa — PUBLICADO → AGUARDANDO_RESPOSTA_EMPRESA (system)' })
  @ApiHeader({ name: 'X-Internal-Signature', description: 'HMAC-SHA256 do body com INTERNAL_HMAC_SECRET' })
  @ApiResponse({ status: 200, description: 'Empresa notificada' })
  @ApiResponse({ status: 401, description: 'Assinatura HMAC inválida' })
  async notifyCompany(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.stateMachine.transition(
      id,
      CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA,
      { role: ActorRole.system, ip: req.ip },
    );
  }

  @Post(':id/company/respond')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('company')
  @ApiOperation({ summary: 'Empresa aceita negociar — AGUARDANDO_RESPOSTA_EMPRESA → EM_NEGOCIACAO (company)' })
  @ApiResponse({ status: 200, description: 'Negociação iniciada' })
  @ApiResponse({ status: 409, description: 'Transição inválida' })
  async companyRespond(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.stateMachine.transition(
      id,
      CaseStatus.EM_NEGOCIACAO,
      { id: req.user?.id, role: req.user?.role as ActorRole, ip: req.ip },
    );
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'system')
  @ApiOperation({ summary: 'Encerrar como resolvido — EM_NEGOCIACAO → RESOLVIDO (sistema/admin)' })
  @ApiResponse({ status: 200, description: 'Caso resolvido' })
  @ApiResponse({ status: 409, description: 'Transição inválida ou confirmação ausente' })
  async resolve(
    @Param('id') id: string,
    @Body() dto: ResolveCaseDto,
    @Req() req: AuthRequest,
  ) {
    if (!dto.consumerConfirmed || !dto.companyConfirmed) {
      return { message: 'Ambas as partes devem confirmar para encerrar como resolvido.' };
    }
    return this.stateMachine.transition(
      id,
      CaseStatus.RESOLVIDO,
      { id: req.user?.id, role: req.user?.role as ActorRole, ip: req.ip },
      { payload: { consumerConfirmed: dto.consumerConfirmed, companyConfirmed: dto.companyConfirmed } },
    );
  }

  @Post(':id/close-unresolved')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(RolesGuard)
  @Roles('admin', 'consumer', 'system')
  @ApiOperation({ summary: 'Encerrar sem resolução — EM_NEGOCIACAO → NAO_RESOLVIDO (admin/consumer/system, W07)' })
  @ApiResponse({ status: 200, description: 'Caso encerrado como não resolvido' })
  @ApiResponse({ status: 409, description: 'Transição inválida' })
  async closeUnresolved(
    @Param('id') id: string,
    @Body() dto: CloseUnresolvedDto,
    @Req() req: AuthRequest,
  ) {
    return this.stateMachine.transition(
      id,
      CaseStatus.NAO_RESOLVIDO,
      { id: req.user?.id, role: req.user?.role as ActorRole, ip: req.ip },
      { reason: dto.reason },
    );
  }
}
