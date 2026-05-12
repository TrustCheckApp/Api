import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtGuard } from '../../../auth/guards/auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateCaseEvidenceDto } from './dto/create-case-evidence.dto';
import { RequestCaseEvidenceUploadDto } from './dto/request-case-evidence-upload.dto';
import { CaseEvidencesService } from './case-evidences.service';

type AuthRequest = Request & { user?: { id: string; role: string } };

@ApiTags('case-evidences')
@ApiBearerAuth()
@UseGuards(JwtGuard, RolesGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller('cases/:caseId/evidences')
export class CaseEvidencesController {
  constructor(private readonly service: CaseEvidencesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('consumer', 'company')
  @ApiOperation({ summary: 'Registrar metadados de evidência de caso para upload futuro assinado' })
  @ApiResponse({ status: 201, description: 'Metadados de evidência registrados sem expor storageKey' })
  @ApiResponse({ status: 403, description: 'Ator sem vínculo com o caso' })
  @ApiResponse({ status: 404, description: 'Caso não encontrado' })
  @ApiResponse({ status: 422, description: 'Formato/tamanho inválido' })
  async create(
    @Param('caseId') caseId: string,
    @Body() dto: CreateCaseEvidenceDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.create(caseId, { id: req.user?.id ?? '', role: req.user?.role ?? '' }, dto);
  }

  @Post('upload-url')
  @HttpCode(HttpStatus.CREATED)
  @Roles('consumer', 'company')
  @ApiOperation({ summary: 'Solicitar URL assinada S3 para upload de evidencia' })
  async requestUpload(
    @Param('caseId') caseId: string,
    @Body() dto: RequestCaseEvidenceUploadDto,
    @Req() req: AuthRequest,
  ) {
    return this.service.requestUpload(caseId, { id: req.user?.id ?? '', role: req.user?.role ?? '' }, dto);
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('consumer', 'company', 'admin')
  @ApiOperation({ summary: 'Listar evidências autorizadas de um caso sem expor storageKey' })
  @ApiResponse({ status: 200, description: 'Lista de evidências com payload mínimo' })
  @ApiResponse({ status: 403, description: 'Ator sem vínculo com o caso' })
  @ApiResponse({ status: 404, description: 'Caso não encontrado' })
  async list(@Param('caseId') caseId: string, @Req() req: AuthRequest) {
    return this.service.list(caseId, { id: req.user?.id ?? '', role: req.user?.role ?? '' });
  }
}
