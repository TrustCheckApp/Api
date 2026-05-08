import {
  Injectable,
  ConflictException,
  UnprocessableEntityException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../../prisma/prisma.service';
import { OtpService } from '../otp.service';
import { AuditService } from '../../../common/audit/audit.service';
import { AuditAction } from '../../../common/audit/audit-actions.const';
import { RegisterCompanyDto, ClaimCompanyDto, RejectCompanyClaimDto } from './dto/company-auth.dto';
import { ClaimStatus, CompanyStatus, UserRole, UserStatus } from '@prisma/client';

const BCRYPT_ROUNDS = 12;
const REG_TOKEN_TTL = '10m';
const RECOVERY_COUNT = 10;

type CompanyRegistrationTokenPayload = {
  sub: string;
  scope: string;
  role?: string;
  claimId?: string;
};

type RequestMeta = { ip?: string; userAgent?: string };

type ClaimReviewResponse = {
  claimId: string;
  status: ClaimStatus;
  reviewedAt: Date | null;
  rejectionReason: string | null;
};

@Injectable()
export class CompanyAuthService {
  private readonly logger = new Logger(CompanyAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otpService: OtpService,
    private readonly auditService: AuditService,
  ) {}

  async register(
    dto: RegisterCompanyDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ userId: string; registrationToken: string }> {
    if (!dto.lgpdAccepted) {
      throw new UnprocessableEntityException({
        code: 'LGPD_NOT_ACCEPTED',
        message: 'O aceite dos termos de uso e política de privacidade (LGPD) é obrigatório.',
      });
    }

    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingEmail) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail já está cadastrado.',
      });
    }

    const existingCompany = await this.prisma.company.findUnique({ where: { cnpj: dto.cnpj } });

    if (existingCompany) {
      const hasOwner = await this.prisma.companyProfile.findFirst({
        where: { companyId: existingCompany.id, role: 'owner' },
      });

      if (hasOwner && existingCompany.status === CompanyStatus.active) {
        throw new ConflictException({
          code: 'CNPJ_ALREADY_OWNED',
          message: 'Este CNPJ já possui um titular ativo. Use o fluxo de reivindicação (POST /auth/company/claim).',
        });
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, company } = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: UserRole.company,
          status: UserStatus.pending_otp,
        },
      });

      const createdCompany = existingCompany
        ? existingCompany
        : await tx.company.create({
            data: {
              cnpj: dto.cnpj,
              legalName: dto.legalName,
              tradeName: dto.tradeName ?? null,
              status: CompanyStatus.active,
            },
          });

      await tx.companyProfile.create({
        data: {
          userId: createdUser.id,
          companyId: createdCompany.id,
          role: 'owner',
        },
      });

      return { user: createdUser, company: createdCompany };
    });

    await this.otpService.generate(user.id, user.email);

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.COMPANY_REGISTER_INITIATED,
      entity: 'Company',
      entityId: company.id,
      payload: { legalName: dto.legalName },
      ip,
      userAgent,
    });

    const registrationToken = await this.jwt.signAsync(
      { sub: user.id, scope: 'otp_pending', role: UserRole.company },
      { expiresIn: REG_TOKEN_TTL, secret: this.config.get<string>('JWT_SECRET') },
    );

    return { userId: user.id, registrationToken };
  }

  async confirmAndEnrollTotp(
    registrationToken: string,
    otp: string,
    meta?: RequestMeta,
  ): Promise<{
    accessToken: string;
    totpSecret: string;
    qrCodeDataUrl: string;
    recoveryCodes: string[];
  }> {
    let payload: CompanyRegistrationTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<CompanyRegistrationTokenPayload>(registrationToken, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Token de cadastro inválido ou expirado.',
      });
    }

    if (payload.scope !== 'otp_pending' || payload.role !== UserRole.company) {
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Token de cadastro inválido.',
      });
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.role !== UserRole.company) {
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

    await this.otpService.verify(payload.sub, otp, 'register');

    const updatedUser = await this.prisma.user.update({
      where: { id: payload.sub },
      data: { status: UserStatus.active },
    });

    const secret = authenticator.generateSecret(20);
    const otpauthUri = authenticator.keyuri(updatedUser.email, 'TrustCheck', secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

    const recoveryCodes = Array.from({ length: RECOVERY_COUNT }, () =>
      Math.floor(Math.random() * 1e10)
        .toString()
        .padStart(10, '0'),
    );

    const tempToken = await this.jwt.signAsync(
      {
        sub: updatedUser.id,
        role: UserRole.company,
        scope: 'totp_pending',
        totpSecret: secret,
        recoveryCodes,
      },
      { expiresIn: '30m', secret: this.config.get<string>('JWT_SECRET') },
    );

    try {
      await this.auditService.log({
        actorUserId: updatedUser.id,
        action: AuditAction.AUTH_LOGIN,
        entity: 'user',
        entityId: updatedUser.id,
        payload: { method: 'password_totp', role: updatedUser.role, totpEnrollment: 'started' },
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      });
    } catch (err) {
      this.logger.error('Falha ao gravar AUTH_LOGIN em audit_log — trilha comprometida', String(err));
    }

    return {
      accessToken: tempToken,
      totpSecret: secret,
      qrCodeDataUrl,
      recoveryCodes,
    };
  }

  async claim(
    dto: ClaimCompanyDto,
    ip?: string,
    userAgent?: string,
  ): Promise<{ claimId: string; registrationToken: string }> {
    if (!dto.lgpdAccepted) {
      throw new UnprocessableEntityException({
        code: 'LGPD_NOT_ACCEPTED',
        message: 'O aceite dos termos de uso e política de privacidade (LGPD) é obrigatório.',
      });
    }

    if (!dto.documents || dto.documents.length === 0) {
      throw new UnprocessableEntityException({
        code: 'CLAIM_DOCUMENTS_REQUIRED',
        message: 'Pelo menos 1 documento comprobatório é obrigatório para reivindicar um perfil.',
      });
    }

    const existingEmail = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingEmail) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'Este e-mail já está cadastrado.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const { user, claim } = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: UserRole.company,
          status: UserStatus.pending_otp,
        },
      });

      let company = await tx.company.findUnique({ where: { cnpj: dto.cnpj } });

      if (!company) {
        company = await tx.company.create({
          data: {
            cnpj: dto.cnpj,
            legalName: dto.legalName,
            tradeName: dto.tradeName ?? null,
            status: CompanyStatus.pending_review,
          },
        });
      }

      const createdClaim = await tx.companyClaim.create({
        data: {
          companyId: company.id,
          requesterUserId: createdUser.id,
          status: 'pending_review',
          documents: {
            create: dto.documents.map((d) => ({
              url: d.url,
              fileName: d.fileName,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes,
            })),
          },
        },
      });

      return { user: createdUser, company, claim: createdClaim };
    });

    await this.otpService.generate(user.id, user.email);

    await this.auditService.log({
      actorUserId: user.id,
      action: AuditAction.COMPANY_CLAIM_SUBMITTED,
      entity: 'CompanyClaim',
      entityId: claim.id,
      payload: {
        companyId: claim.companyId,
        requesterUserId: user.id,
        documentsCount: dto.documents.length,
      },
      ip,
      userAgent,
    });

    const registrationToken = await this.jwt.signAsync(
      { sub: user.id, scope: 'otp_pending', role: UserRole.company, claimId: claim.id },
      { expiresIn: REG_TOKEN_TTL, secret: this.config.get<string>('JWT_SECRET') },
    );

    return { claimId: claim.id, registrationToken };
  }

  async approveClaim(claimId: string, reviewerUserId: string, meta?: RequestMeta): Promise<ClaimReviewResponse> {
    const reviewed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.companyClaim.findUnique({ where: { id: claimId } });

      if (!claim) {
        throw new NotFoundException({ code: 'CLAIM_NOT_FOUND', message: 'Solicitação de reivindicação não encontrada.' });
      }

      if (claim.status !== ClaimStatus.pending_review) {
        throw new ConflictException({ code: 'CLAIM_ALREADY_REVIEWED', message: 'Solicitação de reivindicação já foi revisada.' });
      }

      await tx.company.update({ where: { id: claim.companyId }, data: { status: CompanyStatus.active } });

      await tx.companyProfile.upsert({
        where: { userId: claim.requesterUserId },
        update: { companyId: claim.companyId, role: 'owner' },
        create: { userId: claim.requesterUserId, companyId: claim.companyId, role: 'owner' },
      });

      return tx.companyClaim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.approved,
          reviewedAt: new Date(),
          reviewedBy: reviewerUserId,
          rejectionReason: null,
        },
      });
    });

    await this.auditService.log({
      actorUserId: reviewerUserId,
      action: AuditAction.COMPANY_CLAIM_APPROVED,
      entity: 'CompanyClaim',
      entityId: reviewed.id,
      payload: {
        claimId: reviewed.id,
        companyId: reviewed.companyId,
        requesterUserId: reviewed.requesterUserId,
        reviewerUserId,
        fromStatus: ClaimStatus.pending_review,
        toStatus: ClaimStatus.approved,
      },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      claimId: reviewed.id,
      status: reviewed.status,
      reviewedAt: reviewed.reviewedAt,
      rejectionReason: reviewed.rejectionReason,
    };
  }

  async rejectClaim(
    claimId: string,
    reviewerUserId: string,
    dto: RejectCompanyClaimDto,
    meta?: RequestMeta,
  ): Promise<ClaimReviewResponse> {
    const reviewed = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.companyClaim.findUnique({ where: { id: claimId } });

      if (!claim) {
        throw new NotFoundException({ code: 'CLAIM_NOT_FOUND', message: 'Solicitação de reivindicação não encontrada.' });
      }

      if (claim.status !== ClaimStatus.pending_review) {
        throw new ConflictException({ code: 'CLAIM_ALREADY_REVIEWED', message: 'Solicitação de reivindicação já foi revisada.' });
      }

      return tx.companyClaim.update({
        where: { id: claimId },
        data: {
          status: ClaimStatus.rejected,
          reviewedAt: new Date(),
          reviewedBy: reviewerUserId,
          rejectionReason: dto.reason,
        },
      });
    });

    await this.auditService.log({
      actorUserId: reviewerUserId,
      action: AuditAction.COMPANY_CLAIM_REJECTED,
      entity: 'CompanyClaim',
      entityId: reviewed.id,
      payload: {
        claimId: reviewed.id,
        companyId: reviewed.companyId,
        requesterUserId: reviewed.requesterUserId,
        reviewerUserId,
        fromStatus: ClaimStatus.pending_review,
        toStatus: ClaimStatus.rejected,
        reason: dto.reason,
      },
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });

    return {
      claimId: reviewed.id,
      status: reviewed.status,
      reviewedAt: reviewed.reviewedAt,
      rejectionReason: reviewed.rejectionReason,
    };
  }

  async claimStatus(
    claimId: string,
    requesterId: string,
  ): Promise<{ claimId: string; status: string; submittedAt: Date; reviewedAt: Date | null; rejectionReason: string | null }> {
    const claim = await this.prisma.companyClaim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException({
        code: 'CLAIM_NOT_FOUND',
        message: 'Solicitação de reivindicação não encontrada.',
      });
    }

    if (claim.requesterUserId !== requesterId) {
      throw new UnauthorizedException({
        code: 'REQUEST_INVALID',
        message: 'Acesso negado a esta solicitação.',
      });
    }

    return {
      claimId: claim.id,
      status: claim.status,
      submittedAt: claim.submittedAt,
      reviewedAt: claim.reviewedAt,
      rejectionReason: claim.rejectionReason,
    };
  }
}
