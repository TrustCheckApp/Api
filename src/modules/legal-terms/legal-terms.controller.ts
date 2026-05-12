import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { Request } from 'express';
import { LegalTermsService } from './legal-terms.service';
import { PublishTermDto } from './dto/legal-terms.dto';
import { TermKind } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtGuard } from '../../auth/guards/auth.guard';

type AuthRequest = Request & { user?: { id: string; role: string } };

@ApiTags('legal-terms')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller()
export class LegalTermsController {
  constructor(private readonly service: LegalTermsService) {}

  @Post('admin/legal-terms')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Publicar novo termo legal (admin)' })
  @ApiResponse({ status: 201, description: 'Termo publicado e versão anterior desativada' })
  @ApiResponse({ status: 409, description: 'LEGAL_TERM_VERSION_EXISTS — versão já existe' })
  async publish(@Body() dto: PublishTermDto, @Req() req: AuthRequest) {
    return this.service.publish(dto, req.user?.id ?? '');
  }

  @Get('legal-terms/active')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Obter termo legal ativo por kind' })
  @ApiQuery({ name: 'kind', enum: TermKind, required: true })
  @ApiResponse({ status: 200, description: 'Termo ativo com id, version, content, contentHash, publishedAt' })
  @ApiResponse({ status: 404, description: 'LEGAL_TERM_NOT_FOUND — nenhum termo ativo para o kind' })
  async getActive(@Query('kind') kind: TermKind) {
    return this.service.getActive(kind);
  }

  @Get('admin/legal-terms/:version/acceptances')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @UseGuards(JwtGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Listar aceites por versão do termo (admin, paginado)' })
  @ApiParam({ name: 'version', description: 'Versão semântica do termo (ex: 1.0.0)' })
  @ApiQuery({ name: 'from', required: false, description: 'Data inicial ISO 8601' })
  @ApiQuery({ name: 'to', required: false, description: 'Data final ISO 8601' })
  @ApiQuery({ name: 'page', required: false, description: 'Página (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Itens por página (default: 50, max: 100)' })
  @ApiResponse({ status: 200, description: 'Lista paginada de aceites' })
  async listAcceptances(
    @Param('version') version: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.service.listAcceptancesByVersion(
      version,
      from,
      to,
      Number(page),
      Math.min(Number(limit), 100),
    );
  }
}
