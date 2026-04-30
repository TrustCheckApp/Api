import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { CasosService } from './casos.service';
import {
  CasoStep1Dto,
  CasoStep2Dto,
  CasoStep3Dto,
  CasoStep4Dto,
  ModerarCasoDto,
  AlterarStatusDto,
  FiltrosCasosDto,
} from './dto/casos.dto';
import { JwtGuard } from '../auth/guards/auth.guard';
import { PerfisGuard } from '../auth/guards/perfis.guard';
import { Perfis } from '../auth/decorators/perfis.decorator';

@ApiTags('casos')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('casos')
export class CasosController {
  constructor(private readonly casosService: CasosService) {}

  // ─── WIZARD DE CRIAÇÃO ────────────────────────────────────────────────────

  @Post('wizard/step1')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.CONSUMIDOR)
  @ApiOperation({ summary: 'Nova denúncia — Step 1: identificar empresa (M08)' })
  async step1(@Body() dto: CasoStep1Dto, @Req() req: any) {
    return this.casosService.iniciarCaso(req.user.id, dto, req.ip);
  }

  @Put('wizard/:casoId/step2')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.CONSUMIDOR)
  @ApiOperation({ summary: 'Nova denúncia — Step 2: registrar ocorrido (M09)' })
  async step2(@Param('casoId') casoId: string, @Body() dto: CasoStep2Dto, @Req() req: any) {
    return this.casosService.preencherStep2(casoId, req.user.id, dto);
  }

  @Put('wizard/:casoId/step3')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.CONSUMIDOR)
  @ApiOperation({ summary: 'Nova denúncia — Step 3: anexar evidências (M10)' })
  async step3(@Param('casoId') casoId: string, @Body() dto: CasoStep3Dto, @Req() req: any) {
    return this.casosService.preencherStep3(casoId, req.user.id, dto);
  }

  @Put('wizard/:casoId/step4')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.CONSUMIDOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Nova denúncia — Step 4: questionário + aceite do termo legal (M11)' })
  async step4(@Param('casoId') casoId: string, @Body() dto: CasoStep4Dto, @Req() req: any) {
    return this.casosService.finalizarCaso(
      casoId,
      req.user.id,
      dto,
      req.ip,
      req.headers['user-agent'] ?? '',
    );
  }

  // ─── LISTAGEM CONSUMIDOR (M12) ────────────────────────────────────────────

  @Get('meus')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.CONSUMIDOR)
  @ApiOperation({ summary: 'Listar meus casos (M12)' })
  async meusCasos(@Req() req: any, @Query() filtros: FiltrosCasosDto) {
    return this.casosService.listarCasosConsumidor(req.user.id, filtros);
  }

  // ─── DETALHE DO CASO (M13, E06, W07) ────────────────────────────────────

  @Get(':casoId')
  @ApiOperation({ summary: 'Detalhe completo do caso com timeline (M13, E06, W07)' })
  async detalhe(@Param('casoId') casoId: string, @Req() req: any) {
    return this.casosService.detalharCaso(casoId, req.user.id, req.user.perfil);
  }

  // ─── MODERAÇÃO (W03) ──────────────────────────────────────────────────────

  @Get('moderacao/fila')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.ADMIN)
  @ApiOperation({ summary: 'Fila de moderação — casos aguardando aprovação (W03)' })
  async filaModeracao() {
    return this.casosService.filaModeracao();
  }

  @Put(':casoId/moderar')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Moderar caso: publicar ou rejeitar (W03)' })
  async moderar(@Param('casoId') casoId: string, @Body() dto: ModerarCasoDto, @Req() req: any) {
    return this.casosService.moderarCaso(casoId, req.user.id, dto, req.ip);
  }

  // ─── GESTÃO DE CASOS ADMIN (W07) ─────────────────────────────────────────

  @Put(':casoId/status')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar status do caso — transições controladas (W07)' })
  async alterarStatus(@Param('casoId') casoId: string, @Body() dto: AlterarStatusDto, @Req() req: any) {
    return this.casosService.alterarStatus(casoId, req.user.id, dto, req.ip);
  }

  // ─── FILA DA EMPRESA (E05) ────────────────────────────────────────────────

  @Get('empresa/fila')
  @UseGuards(PerfisGuard)
  @Perfis(Perfil.EMPRESA)
  @ApiOperation({ summary: 'Fila de casos da empresa (E05)' })
  async filaEmpresa(@Req() req: any, @Query() filtros: FiltrosCasosDto) {
    const empresa = await this._resolverEmpresaId(req.user.id);
    return this.casosService.filaCasosEmpresa(empresa, filtros);
  }

  private async _resolverEmpresaId(usuarioId: string): Promise<string> {
    // Delegado ao service para manter controller enxuto
    return usuarioId;
  }
}
