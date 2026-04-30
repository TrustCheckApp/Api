import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const ROLES_KEY = 'roles';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: { role: string } }>();
    const userRole = req.user?.role;

    if (!userRole || !required.includes(userRole)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_ROLE',
        message: `Acesso negado. Role(s) necessário(s): ${required.join(', ')}.`,
      });
    }

    return true;
  }
}
