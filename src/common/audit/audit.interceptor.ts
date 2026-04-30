import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { AuditService } from './audit.service';
import { extractClientIp } from '../net/extract-ip.util';

export interface AuditInterceptorMeta {
  action: string;
  entity: string;
  resolveEntityId?: (body: unknown, result: unknown) => string | undefined;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly meta: AuditInterceptorMeta,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const actorUserId = (req as Request & { user?: { id?: string } }).user?.id;

    const ip = extractClientIp(req);
    const userAgent = req.headers['user-agent'];

    return next.handle().pipe(
      tap((result) => {
        const entityId = this.meta.resolveEntityId?.(req.body as unknown, result);
        void this.auditService.log({
          actorUserId,
          action: this.meta.action,
          entity: this.meta.entity,
          entityId,
          payload: {},
          ip,
          userAgent,
        });
      }),
    );
  }
}
