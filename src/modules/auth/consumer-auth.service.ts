import {
  Injectable,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  UnauthorizedException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpService } from './otp.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuditAction } from '../../common/audit/audit-actions.const';
import { RegisterConsumerDto, RegisterConfirmDto, SsoAuthDto } from './dto/register-consumer.dto';
import { SsoProvider, UserRole, UserStatus } from '@prisma/client';
import { EVENT_PUBLISHER_TOKEN, EventPublisher } from '../../common/events/event-publisher';
import { buildEvent } from '../../common/events/domain-event';
import { AUTH_STREAM } from '../../common/events/schemas/auth/login-succeeded';
import { AUTH_LOGIN_SUCCEEDED_V1, LoginSucceededPayload } from '../../common/events/schemas/auth/login-succeeded';

const BCRYPT_ROUNDS = 12;
const REG_TOKEN_TTL = '10m';

type RequestMeta = { ip?: string; userAgent?: string };
type RegistrationTokenPayload = { sub: string; scope: string; role?: UserRole };

@Injectable()
export class ConsumerAuthService {
  private readonly logger = new Logger(ConsumerAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otpService: OtpService,
    @Inject(EVENT_PUBLISHER_TOKEN) private readonly events: EventPublisher,
    private readonly auditService: AuditService,
  ) {}

  async register(dto: RegisterConsumerDto, meta?: RequestMeta): Promise<{ userId: string; registrationToken: string }> {
    if (!dto.lgpdAccepted) {
      throw new UnprocessableEntityException({
        code: 'LGPD_NOT_ACCEPTED',
        message: 'O aceite dos termos de uso e política de privacidade (LGPD) é obrigatório.',
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail já está cadastrado. Faça login ou recupere sua senha.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: UserRole.consumer,
          status: UserStatus.pending_otp,
        },
      });

      await tx.consumerProfile.create({
        data: {
          userId: created.id,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          acceptedLgpdAt: new Date(),
          acceptedLgpdVersion: dto.lgpdVersion,
        },
      });

      return created;
    });

    await this.otpService.generate(user.id, user.email);

    try {
      await this.auditService.log({
        actorUserId: user.id,
        action: AuditAction.CONSUMER_REGISTER_INITIATED,
        entity: 'user',
        entityId: user.id,
        payload: { role: UserRole.consumer, lgpdVersion: dto.lgpdVersion },
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (err) {
      this.logger.error('Falha ao gravar CONSUMER_REGISTER_INITIATED em audit_log — trilha comprometida', String(err));
    }

    const registrationToken = await this.jwt.signAsync(
      { sub: user.id, scope: 'otp_pending', role: UserRole.consumer },
      { expiresIn: REG_TOKEN_TTL, secret: this.config.get<string>('JWT_SECRET') },
    );

    return { userId: user.id, registrationToken };
  }

  async confirm(
    dto: RegisterConfirmDto,
    meta?: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload: RegistrationTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<RegistrationTokenPayload>(dto.registrationToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Token de cadastro inválido ou expirado.',
      });
    }

    if (payload.scope !== 'otp_pending' || payload.role !== UserRole.consumer) {
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Token de cadastro inválido.',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.role !== UserRole.consumer) {
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Token de cadastro inválido.',
      });
    }

    if (user.status !== UserStatus.pending_otp) {
      throw new BadRequestException({
        code: 'OTP_ALREADY_CONFIRMED',
        message: 'Cadastro já confirmado ou em estado inválido para confirmação.',
      });
    }

    await this.otpService.verify(payload.sub, dto.otp, 'register');

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { status: UserStatus.active },
    });

    return this._issueTokens(payload.sub, UserRole.consumer, 'password', meta);
  }

  async loginWithPassword(
    email: string,
    password: string,
    meta?: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash ?? ''))) {
      await this._auditLoginFailed(null, 'password', 'INVALID_PASSWORD', meta);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-mail ou senha inválidos.',
      });
    }

    if (user.role !== UserRole.consumer) {
      await this._auditLoginFailed(user.id, 'password', 'ROLE_NOT_ALLOWED', meta);
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Perfil não autorizado para este fluxo de login.',
      });
    }

    if (user.status !== UserStatus.active) {
      await this._auditLoginFailed(user.id, 'password', 'ACCOUNT_NOT_ACTIVE', meta);
      throw new UnauthorizedException({
        code: 'ACCOUNT_NOT_ACTIVE',
        message: 'Conta ainda não confirmada ou indisponível.',
      });
    }

    return this._issueTokens(user.id, user.role, 'password', meta);
  }

  async ssoAuth(
    provider: SsoProvider,
    dto: SsoAuthDto,
    meta?: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!dto.lgpdAccepted) {
      throw new UnprocessableEntityException({
        code: 'LGPD_NOT_ACCEPTED',
        message: 'O aceite dos termos de uso e política de privacidade (LGPD) é obrigatório.',
      });
    }

    const { email, subject } = await this._verifySsoToken(provider, dto.idToken);

    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      const alreadyLinked = await this.prisma.ssoIdentity.findUnique({
        where: { provider_subject: { provider, subject } },
      });

      if (!alreadyLinked) {
        await this.prisma.ssoIdentity.create({
          data: { userId: user.id, provider, subject },
        });
      }

      if (user.status === UserStatus.suspended || user.status === UserStatus.deleted) {
        throw new UnauthorizedException({
          code: 'REQUEST_INVALID',
          message: 'Conta inativa. Entre em contato com o suporte.',
        });
      }
    } else {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            role: UserRole.consumer,
            status: UserStatus.active,
          },
        });

        await tx.consumerProfile.create({
          data: {
            userId: created.id,
            fullName: email.split('@')[0],
            acceptedLgpdAt: new Date(),
            acceptedLgpdVersion: dto.lgpdVersion,
          },
        });

        await tx.ssoIdentity.create({
          data: { userId: created.id, provider, subject },
        });

        return created;
      });
    }

    return this._issueTokens(user.id, user.role, 'sso', meta);
  }

  private async _issueTokens(
    userId: string,
    role: UserRole,
    method: LoginSucceededPayload['method'] = 'password',
    meta?: RequestMeta,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const secret = this.config.get<string>('JWT_SECRET');
    const refreshSecret = this.config.get<string>('JWT_REFRESH_SECRET');

    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { expiresIn: role === UserRole.admin ? '1h' : '1d', secret },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, type: 'refresh' },
      { expiresIn: '7d', secret: refreshSecret },
    );

    const event = buildEvent<LoginSucceededPayload>(
      AUTH_LOGIN_SUCCEEDED_V1,
      1,
      { userId, role, method, ip: meta?.ip ?? null, userAgent: meta?.userAgent ?? null },
    );
    void this.events.publish(AUTH_STREAM, event);

    try {
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.AUTH_LOGIN,
        entity: 'user',
        entityId: userId,
        payload: { method, role },
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (err) {
      this.logger.error('Falha ao gravar AUTH_LOGIN em audit_log — trilha comprometida', String(err));
    }

    return { accessToken, refreshToken };
  }

  private async _auditLoginFailed(
    userId: string | null,
    method: string,
    reason: string,
    meta?: RequestMeta,
  ): Promise<void> {
    try {
      await this.auditService.log({
        actorUserId: userId ?? undefined,
        action: AuditAction.AUTH_LOGIN_FAILED,
        entity: userId ? 'user' : 'auth_attempt',
        entityId: userId ?? undefined,
        payload: { method, reason },
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (err) {
      this.logger.error('Falha ao gravar AUTH_LOGIN_FAILED em audit_log', String(err));
    }
  }

  private async _verifySsoToken(
    provider: SsoProvider,
    idToken: string,
  ): Promise<{ email: string; subject: string }> {
    try {
      const { createRemoteJWKSet, jwtVerify } = await import('jose');

      const jwksUri =
        provider === SsoProvider.google
          ? 'https://www.googleapis.com/oauth2/v3/certs'
          : 'https://appleid.apple.com/auth/keys';

      const JWKS = createRemoteJWKSet(new URL(jwksUri));
      const { payload } = await jwtVerify(idToken, JWKS);

      const email = payload['email'] as string;
      const subject = payload.sub as string;

      if (!email || !subject) {
        throw new Error('Payload incompleto');
      }

      return { email: email.toLowerCase().trim(), subject };
    } catch {
      throw new BadRequestException({
        code: 'REQUEST_INVALID',
        message: 'Token SSO inválido ou expirado.',
      });
    }
  }
}
