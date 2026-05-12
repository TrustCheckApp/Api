import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { StatusCaso, Perfil } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  CasoStep1Dto,
  CasoStep2Dto,
  CasoStep3Dto,
  CasoStep4Dto,
  ModerarCasoDto,
  AlterarStatusDto,
  FiltrosCasosDto,
} from './dto/casos.dto';

// ─── Mapa de transições válidas do pipeline ───────────────────────────────────
const TRANSICOES_VALIDAS: Partial<Record<StatusCaso, StatusCaso[]>> = {
  ENVIADO:                    ['EM_MODERACAO'],
  EM_MODERACAO:               ['PUBLICADO', 'NAO_RESOLVIDO'],
  PUBLICADO:                  ['AGUARDANDO_RESPOSTA_EMPRESA'],
  AGUARDANDO_RESPOSTA_EMPRESA: ['EM_NEGOCIACAO', 'NAO_RESOLVIDO'],
  EM_NEGOCIACAO:              ['RESOLVIDO', 'NAO_RESOLVIDO'],
};

@Injectable()
export class CasosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ─── STEP 1: Identificar empresa ──────────────────────────────────────────

  async iniciarCaso(consumidorId: string, dto: CasoStep1Dto, ip: string): Promise<{ rascunhoId: string }> {
    const empresa = await this.prisma.empresa.findUnique({ where: { id: dto.empresaId } });
    if (!empresa) throw new NotFoundException('Empresa não encontrada');

    // Cria rascunho — título provisório até Step 2
    const caso = await this.prisma.caso.create({
      data: {
        numero: this._gerarNumeroCaso(),
        consumidorId,
        empresaId: dto.empresaId,
        titulo: 'Rascunho',
        descricao: '',
        tipoExperiencia: '',
        status: StatusCaso.ENVIADO,
      },
    });

    await this._registrarTimeline(caso.id, null, StatusCaso.ENVIADO, 'Caso iniciado pelo consumidor', consumidorId, ip);

    await this.auditoria.registrar({
      usuarioId: consumidorId,
      tipo: 'CASO_CRIADO',
      detalhe: { casoId: caso.id, empresaId: dto.empresaId },
      ip,
    });

    return { rascunhoId: caso.id };
  }

  // ─── STEP 2: Registrar ocorrido ───────────────────────────────────────────

  async preencherStep2(casoId: string, consumidorId: string, dto: CasoStep2Dto): Promise<{ casoId: string }> {
    const caso = await this._buscarCasoDoConsumidor(casoId, consumidorId);

    await this.prisma.caso.update({
      where: { id: casoId },
      data: {
        titulo: dto.titulo ?? dto.descricao.substring(0, 80),
        descricao: dto.descricao,
        tipoExperiencia: dto.tipoExperiencia,
      },
    });

    return { casoId: caso.id };
  }

  // ─── STEP 3: Evidências ───────────────────────────────────────────────────

  async preencherStep3(casoId: string, consumidorId: string, dto: CasoStep3Dto): Promise<{ casoId: string }> {
    const caso = await this._buscarCasoDoConsumidor(casoId, consumidorId);

    if (dto.evidencias && dto.evidencias.length > 0) {
      await this.prisma.evidenciaCaso.createMany({
        data: dto.evidencias.map((e) => ({
          casoId: caso.id,
          tipo: e.tipo,
          url: e.url,
          tamanho: e.tamanho,
          mimeType: e.mimeType,
        })),
      });
    }

    return { casoId: caso.id };
  }

  // ─── STEP 4: Questionário + Aceite do Termo Legal ─────────────────────────

  async finalizarCaso(casoId: string, consumidorId: string, dto: CasoStep4Dto, ip: string, userAgent: string): Promise<{ casoId: string; numero: string }> {
    const caso = await this._buscarCasoDoConsumidor(casoId, consumidorId);

    if (!dto.termoAceito) {
      throw new BadRequestException('O aceite do termo legal é obrigatório para enviar a denúncia');
    }

    if (!caso.tipoExperiencia || !caso.descricao || caso.descricao === '') {
      throw new BadRequestException('Complete os dados da denúncia antes de finalizar (Steps 2 obrigatório)');
    }

    // R3: busca versão ativa do termo na tabela LegalTerm — garante rastreabilidade por hash
    const termoAtivo = await this.prisma.legalTerm.findFirst({
      where: { ativo: true },
      orderBy: { criadoEm: 'desc' },
    });
    if (!termoAtivo) {
      throw new BadRequestException('Nenhuma versão ativa do termo legal encontrada. Contate o administrador.');
    }

    const versaoTermo = termoAtivo.versao;

    await this.prisma.$transaction([
      this.prisma.questionarioCaso.create({
        data: { casoId: caso.id, respostas: dto.respostas as Prisma.InputJsonValue },
      }),
      this.prisma.termoAceite.create({
        data: {
          casoId: caso.id,
          usuarioId: consumidorId,
          versaoTermo,
          ipOrigem: ip,
          userAgent: userAgent ?? null,
        },
      }),
      this.prisma.caso.update({
        where: { id: caso.id },
        data: { status: StatusCaso.EM_MODERACAO },
      }),
    ]);

    await this._registrarTimeline(caso.id, StatusCaso.ENVIADO, StatusCaso.EM_MODERACAO, 'Enviado para moderação após aceite do termo', consumidorId, ip);

    await this.auditoria.registrar({
      usuarioId: consumidorId,
      tipo: 'CASO_TERMO_ACEITO',
      detalhe: { casoId: caso.id, versaoTermo, ip },
      ip,
      userAgent,
    });

    return { casoId: caso.id, numero: caso.numero };
  }

  // ─── MODERAÇÃO (W03) ──────────────────────────────────────────────────────

  async moderarCaso(casoId: string, moderadorId: string, dto: ModerarCasoDto, ip: string): Promise<{ casoId: string; novoStatus: StatusCaso }> {
    const caso = await this.prisma.caso.findUnique({ where: { id: casoId } });
    if (!caso) throw new NotFoundException('Caso não encontrado');

    if (caso.status !== StatusCaso.EM_MODERACAO) {
      throw new BadRequestException(`Caso não está em moderação (status atual: ${caso.status})`);
    }

    const novoStatus = dto.decisao === 'PUBLICADO' ? StatusCaso.PUBLICADO : StatusCaso.NAO_RESOLVIDO;

    await this.prisma.caso.update({
      where: { id: casoId },
      data: {
        status: novoStatus,
        publicadoEm: novoStatus === StatusCaso.PUBLICADO ? new Date() : undefined,
      },
    });

    await this._registrarTimeline(casoId, StatusCaso.EM_MODERACAO, novoStatus, dto.observacao ?? '', moderadorId, ip);

    await this.auditoria.registrar({
      usuarioId: moderadorId,
      tipo: 'CASO_MODERADO',
      detalhe: { casoId, decisao: dto.decisao, observacao: dto.observacao },
      ip,
    });

    return { casoId, novoStatus };
  }

  // ─── ALTERAR STATUS (transição controlada) ────────────────────────────────

  async alterarStatus(casoId: string, operadorId: string, dto: AlterarStatusDto, ip: string): Promise<{ casoId: string; novoStatus: StatusCaso }> {
    const caso = await this.prisma.caso.findUnique({ where: { id: casoId } });
    if (!caso) throw new NotFoundException('Caso não encontrado');

    const transicoesPermitidas = TRANSICOES_VALIDAS[caso.status] ?? [];
    if (!transicoesPermitidas.includes(dto.novoStatus)) {
      throw new BadRequestException(
        `Transição inválida: ${caso.status} → ${dto.novoStatus}. Permitidas: ${transicoesPermitidas.join(', ')}`,
      );
    }

    await this.prisma.caso.update({
      where: { id: casoId },
      data: {
        status: dto.novoStatus,
        resolvidoEm: dto.novoStatus === StatusCaso.RESOLVIDO ? new Date() : undefined,
      },
    });

    await this._registrarTimeline(casoId, caso.status, dto.novoStatus, dto.observacao ?? '', operadorId, ip);

    await this.auditoria.registrar({
      usuarioId: operadorId,
      tipo: 'CASO_STATUS_ALTERADO',
      detalhe: { casoId, de: caso.status, para: dto.novoStatus },
      ip,
    });

    return { casoId, novoStatus: dto.novoStatus };
  }

  // ─── LISTAR CASOS DO CONSUMIDOR (M12) ────────────────────────────────────

  async listarCasosConsumidor(consumidorId: string, filtros: FiltrosCasosDto): Promise<any[]> {
    return this.prisma.caso.findMany({
      where: {
        consumidorId,
        ...(filtros.status && { status: filtros.status }),
      },
      include: {
        empresa: { select: { razaoSocial: true, nomeFantasia: true, trustScore: true } },
        _count: { select: { evidencias: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  // ─── FILA DE MODERAÇÃO (W03) ──────────────────────────────────────────────

  async filaModeracao(): Promise<any[]> {
    return this.prisma.caso.findMany({
      where: { status: StatusCaso.EM_MODERACAO },
      include: {
        consumidor: { select: { nome: true, email: true } },
        empresa: { select: { razaoSocial: true, cnpj: true } },
        evidencias: true,
        questionario: true,
        termoAceite: true,
      },
      orderBy: { criadoEm: 'asc' },
    });
  }

  // ─── FILA DA EMPRESA (E05) ────────────────────────────────────────────────

  async filaCasosEmpresa(empresaId: string, filtros: FiltrosCasosDto): Promise<any[]> {
    return this.prisma.caso.findMany({
      where: {
        empresaId,
        ...(filtros.status && { status: filtros.status }),
      },
      include: {
        consumidor: { select: { nome: true } },
        timeline: { orderBy: { criadoEm: 'desc' }, take: 1 },
        _count: { select: { evidencias: true } },
      },
      orderBy: { criadoEm: 'desc' },
    });
  }

  // ─── DETALHE DO CASO (M13, E06, W07) ────────────────────────────────────

  async detalharCaso(casoId: string, usuarioId: string, perfilUsuario: Perfil): Promise<any> {
    const caso = await this.prisma.caso.findUnique({
      where: { id: casoId },
      include: {
        consumidor: { select: { nome: true, email: true } },
        empresa: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true, trustScore: true } },
        timeline: { orderBy: { criadoEm: 'asc' } },
        evidencias: true,
        questionario: true,
        termoAceite: true,
      },
    });

    if (!caso) throw new NotFoundException('Caso não encontrado');

    // Controle de acesso por perfil
    if (perfilUsuario === Perfil.CONSUMIDOR && caso.consumidorId !== usuarioId) {
      throw new ForbiddenException('Acesso negado a este caso');
    }

    if (perfilUsuario === Perfil.EMPRESA) {
      const empresa = await this.prisma.empresa.findUnique({ where: { usuarioId } });
      if (!empresa || empresa.id !== caso.empresaId) {
        throw new ForbiddenException('Acesso negado a este caso');
      }
    }

    return caso;
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────────────────────

  private async _buscarCasoDoConsumidor(casoId: string, consumidorId: string) {
    const caso = await this.prisma.caso.findUnique({ where: { id: casoId } });
    if (!caso) throw new NotFoundException('Caso não encontrado');
    if (caso.consumidorId !== consumidorId) throw new ForbiddenException('Acesso negado a este caso');
    return caso;
  }

  private async _registrarTimeline(
    casoId: string,
    statusAntes: StatusCaso | null,
    statusDepois: StatusCaso,
    observacao: string,
    operadorId: string,
    ip: string,
  ): Promise<void> {
    await this.prisma.timelineCaso.create({
      data: {
        casoId,
        statusAntes: statusAntes ?? undefined,
        statusDepois,
        observacao,
        operadorId,
        ip,
      },
    });
  }

  private _gerarNumeroCaso(): string {
    const ano = dayjs().format('YYYY');
    const aleatorio = Math.floor(100000 + Math.random() * 900000);
    return `TC-${ano}-${aleatorio}`;
  }
}
