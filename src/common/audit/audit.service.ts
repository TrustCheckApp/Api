import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { sanitizePayload, findRedactedKeys } from './sanitize-payload.util';

export interface AuditLogParams {
  actorUserId?: string;
  action: string;
  entity: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: AuditLogParams): Promise<void> {
    const rawPayload = params.payload ?? {};
    const sanitized = sanitizePayload(rawPayload) as Record<string, unknown>;

    const redactedKeys = findRedactedKeys(rawPayload, sanitized);
    if (redactedKeys.length > 0) {
      this.logger.warn('AuditService: payload continha campos sensíveis — redigidos antes de gravar', {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        redactedKeys,
      });
    }

    try {
      await this.prisma.moduleAuditLog.create({
        data: {
          actorUserId: params.actorUserId ?? null,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId ?? null,
          payload: sanitized as object,
          ip: params.ip ?? null,
          userAgent: params.userAgent ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Falha ao gravar audit log: ${String(err)}`);
    }
  }
}
