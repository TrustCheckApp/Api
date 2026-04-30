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

export interface TransitionOptions {
  reason?: string;
  payload?: Record<string, unknown>;
}

@Injectable()
export class CaseStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async transition(
    caseId: string,
    toStatus: CaseStatus,
    actor: ActorInfo,
    opts: TransitionOptions = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.$queryRaw<{ id: string; status: CaseStatus }[]>`
        SELECT id, status FROM cases WHERE id = ${caseId}::uuid FOR UPDATE
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

      this.events.emit('case.status.changed', {
        caseId,
        fromStatus,
        toStatus,
        actorRole: actor.role,
        transitionId: transition.id,
        occurredAt: transition.occurredAt,
      });

      return {
        caseId,
        fromStatus,
        toStatus,
        transitionId: transition.id,
      };
    });
  }
}
