import { Injectable } from '@nestjs/common';
import { Prisma, TipoAuditoria } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface RegistrarAuditoriaDto {
  usuarioId?: string;
  tipo: TipoAuditoria;
  detalhe?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(dados: RegistrarAuditoriaDto): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        usuarioId: dados.usuarioId ?? null,
        tipo: dados.tipo,
        detalhe: dados.detalhe ? (dados.detalhe as Prisma.InputJsonObject) : Prisma.JsonNull,
        ip: dados.ip ?? null,
        userAgent: dados.userAgent ?? null,
      },
    });
  }
}
