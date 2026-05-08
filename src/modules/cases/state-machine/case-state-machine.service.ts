import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { CaseStatus, ActorRole, Prisma } from '@prisma/client';
import { TRANSITIONS, ALLOWED_ACTORS, ActorInfo, TransitionKey } from './transitions';
import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../common/audit/audit-actions.const';
import { buildEvent } from '../../../common/events/domain-event';
import {
  CASE_STATUS_CHANGED_V1,
  CaseStatusChangedPayload,
} from '../../../common/events/schemas/cases/status-changed';

export interface TransitionOptions {
  reason?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class CaseStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly auditService: AuditService,
  ) {}

  async transition(
    caseId: string,
    toStatus: CaseStatus,
    actor: ActorInfo,
    opts: TransitionOptions = {},
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const found = await tx.$queryRaw<{
        id: string;
        status: CaseStatus;
        consumerUserId: string;
        companyId: string;
      }[]>`
        SELECT
          id,
          status,
          consumer_user_id AS "consumerUserId",
          company_id AS "companyId"
        FROM cases
        WHERE id = ${caseId}::uuid
        FOR UPDATE
      `;

      if (!found.length) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: 'Caso não encontrado.',
        });
      }

      const currentCase = found[0];
      const fromStatus = currentCase.status;

      if (fromStatus === toStatus) {
        throw new ConflictException({
          code: 'CASE_STATE_CONFLICT',
          message: `Caso já está no estado ${toStatus}.`,
        });
      }

      const validNext = TRANSITIONS[fromStatus];
      if (!validNext || !validNext.has(toStatus)) {
        throw new ConflictException({
          code: 'CASE_INVALID_TRANSITION',
          message: `Transição de ${fromStatus} para ${toStatus} não permitida.`,
        });
      }

      const key: TransitionKey = `${fromStatus}->${toStatus}`;
      const allowedRoles = ALLOWED_ACTORS[key] ?? [];
      if (!allowedRoles.includes(actor.role)) {
        throw new ForbiddenException({
          code: 'CASE_TRANSITION_FORBIDDEN',
          message: `Ator com role '${actor.role}' não pode realizar transição ${key}.`,
        });
      }

      await this.assertActorCanAccessCase(tx, currentCase, actor, key);

      const now = new Date();
      const extraFields: Record<string, unknown> = {};
      if (toStatus === CaseStatus.PUBLICADO) extraFields.publishedAt = now;
      if (toStatus === CaseStatus.RESOLVIDO || toStatus === CaseStatus.NAO_RESOLVIDO) {
        extraFields.closedAt = now;
      }

      await tx.case.update({
        where: { id: caseId },
        data: { status: toStatus, ...extraFields },
      });

      const transition = await tx.caseStatusTransition.create({
        data: {
          caseId,
          fromStatus,
          toStatus,
          actorUserId: actor.id ?? null,
          actorRole: actor.role,
          reason: opts.reason ?? null,
          payload: (opts.payload ?? Prisma.DbNull) as Prisma.InputJsonValue,
          ip: actor.ip ?? null,
        },
      });

      return {
        caseId,
        fromStatus,
        toStatus,
        transitionId: transition.id,
        occurredAt: transition.occurredAt,
        actorRole: actor.role,
      };
    });

    await this.auditService.log({
      actorUserId: actor.id,
      action: AuditAction.CASE_STATUS_TRANSITION,
      entity: 'case',
      entityId: caseId,
      payload: {
        fromStatus: result.fromStatus,
        toStatus: result.toStatus,
        transitionId: result.transitionId,
        actorRole: result.actorRole,
        reason: opts.reason ?? null,
      },
      ip: actor.ip,
    });

    const payload: CaseStatusChangedPayload = {
      caseId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      actorRole: actor.role,
      transitionId: result.transitionId,
      occurredAt: result.occurredAt.toISOString(),
    };

    this.events.emit(CASE_STATUS_CHANGED_V1, buildEvent(CASE_STATUS_CHANGED_V1, 1, payload));

    this.events.emit('case.status.changed', {
      caseId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      actorRole: actor.role,
      transitionId: result.transitionId,
      occurredAt: result.occurredAt,
    });

    return {
      caseId: result.caseId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      transitionId: result.transitionId,
    };
  }

  private async assertActorCanAccessCase(
    tx: Prisma.TransactionClient,
    currentCase: { consumerUserId: string; companyId: string },
    actor: ActorInfo,
    transitionKey: TransitionKey,
  ): Promise<void> {
    if (actor.role === ActorRole.admin || actor.role === ActorRole.system) return;

    if (!actor.id) {
      throw new ForbiddenException({
        code: 'CASE_ACTOR_REQUIRED',
        message: `Ator autenticado é obrigatório para a transição ${transitionKey}.`,
      });
    }

    if (actor.role === ActorRole.consumer && currentCase.consumerUserId !== actor.id) {
      throw new ForbiddenException({
        code: 'CASE_CONSUMER_ACCESS_FORBIDDEN',
        message: 'Consumidor não possui acesso a este caso.',
      });
    }

    if (actor.role === ActorRole.company) {
      const linkedProfiles = await tx.companyProfile.count({
        where: {
          userId: actor.id,
          companyId: currentCase.companyId,
        },
      });

      if (linkedProfiles === 0) {
        throw new ForbiddenException({
          code: 'CASE_COMPANY_ACCESS_FORBIDDEN',
          message: 'Empresa não possui acesso a este caso.',
        });
      }
    }
  }
}
