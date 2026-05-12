import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

type InternalRequest = Request & { user?: { id?: string; role: 'system' } };

@Injectable()
export class InternalGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<InternalRequest>();
    const signature = req.headers['x-internal-signature'] as string | undefined;

    if (!signature) {
      throw new UnauthorizedException({
        code: 'INTERNAL_SIGNATURE_MISSING',
        message: 'X-Internal-Signature header obrigatório para chamadas internas.',
      });
    }

    const secret = this.config.get<string>('INTERNAL_HMAC_SECRET') ?? '';
    const body = JSON.stringify(req.body ?? {});
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const isHex = /^[a-fA-F0-9]+$/.test(signature);

    if (!isHex || signature.length !== expected.length) {
      throw new UnauthorizedException({
        code: 'INTERNAL_SIGNATURE_INVALID',
        message: 'Assinatura HMAC interna invÃ¡lida.',
      });
    }

    if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      throw new UnauthorizedException({
        code: 'INTERNAL_SIGNATURE_INVALID',
        message: 'Assinatura HMAC interna inválida.',
      });
    }

    req.user = { id: undefined, role: 'system' };
    return true;
  }
}
