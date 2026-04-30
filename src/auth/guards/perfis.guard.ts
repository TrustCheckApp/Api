import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Perfil } from '@prisma/client';
import { PERFIS_KEY } from '../decorators/perfis.decorator';

@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const perfisExigidos = this.reflector.getAllAndOverride<Perfil[]>(PERFIS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!perfisExigidos || perfisExigidos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    return perfisExigidos.includes(user?.perfil);
  }
}
