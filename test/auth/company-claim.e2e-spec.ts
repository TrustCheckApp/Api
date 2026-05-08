/**
 * E2E — Claim de perfil empresarial (TC-S1-API-03)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OTP_PROVIDER_TOKEN } from '../../src/modules/auth/providers/otp-provider.interface';
import { CompanyStatus, UserRole, UserStatus } from '@prisma/client';

const PASSWORD = 'EmpresaClaim@99';
const DOCS = [
  {
    url: 'https://storage.trustcheck.com.br/docs/contrato.pdf',
    fileName: 'contrato.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 204800,
  },
];

const VALID_CNPJS = [
  '33.000.167/0001-01',
  '07.526.557/0001-00',
  '48.282.795/0001-40',
  '81.529.276/0001-72',
  '13.339.532/0001-09',
  '60.746.948/0001-12',
];
let cnpjIndex = 0;
const nextCnpj = () => VALID_CNPJS[cnpjIndex++ % VALID_CNPJS.length];
const BASE_EMAIL = () => `claim-e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@trustcheck.test`;

describe('POST /auth/company/claim (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;
  let capturedOtp: string | null = null;
  let adminToken: string;
  let companyToken: string;

  const makeToken = (userId: string, role: string) =>
    jwt.sign({ sub: userId, role }, { secret: config.get<string>('JWT_SECRET'), expiresIn: '10m' });

  const claimPayload = (overrides: Record<string, unknown> = {}) => ({
    cnpj: nextCnpj(),
    legalName: 'Empresa Reivindicada LTDA',
    email: BASE_EMAIL(),
    password: PASSWORD,
    fullName: 'Representante Legal',
    documents: DOCS,
    lgpdAccepted: true,
    lgpdVersion: '1.0',
    ...overrides,
  });

  const createClaim = async (overrides: Record<string, unknown> = {}) => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send(claimPayload(overrides))
      .expect(202);
    return res.body as { claimId: string; registrationToken: string };
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OTP_PROVIDER_TOKEN)
      .useValue({ send: async (p: { code: string }) => { capturedOtp = p.code; } })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);

    const admin = await prisma.user.create({
      data: {
        email: `claim-admin-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.admin,
        status: UserStatus.active,
      },
    });

    const companyUser = await prisma.user.create({
      data: {
        email: `claim-company-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.company,
        status: UserStatus.active,
      },
    });

    adminToken = makeToken(admin.id, 'admin');
    companyToken = makeToken(companyUser.id, 'company');
  });

  afterAll(async () => {
    await prisma.companyClaimDocument.deleteMany({
      where: { claim: { requester: { email: { contains: 'trustcheck.test' } } } },
    });
    await prisma.companyClaim.deleteMany({
      where: { requester: { email: { contains: 'trustcheck.test' } } },
    });
    await prisma.companyProfile.deleteMany({
      where: { user: { email: { contains: 'trustcheck.test' } } },
    });
    await prisma.company.deleteMany({
      where: { legalName: { contains: 'Empresa' } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await app.close();
  });

  it('202 — claim criado e audit_log gravado', async () => {
    capturedOtp = null;
    const res = await createClaim();

    expect(res).toHaveProperty('claimId');
    expect(res).toHaveProperty('registrationToken');
    expect(capturedOtp).toMatch(/^\d{6}$/);

    const audit = await prisma.moduleAuditLog.findFirst({
      where: { action: 'COMPANY_CLAIM_SUBMITTED', entityId: res.claimId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.action).toBe('COMPANY_CLAIM_SUBMITTED');
  });

  it('422 CLAIM_DOCUMENTS_REQUIRED — array vazio de documentos', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send(claimPayload({ documents: [] }))
      .expect(422);

    const msgs: string[] = Array.isArray(res.body.message)
      ? (res.body.message as string[])
      : [String(res.body.message)];

    const hasDocError = msgs.some(
      (m) => m.toLowerCase().includes('documento') || (res.body.message as { code?: string })?.code === 'CLAIM_DOCUMENTS_REQUIRED',
    );
    expect(hasDocError).toBe(true);
  });

  it('422 CNPJ inválido — dígito verificador errado no claim', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send(claimPayload({ cnpj: '11.222.333/0001-00' }))
      .expect(422);

    const msgs: string[] = Array.isArray(res.body.message)
      ? (res.body.message as string[])
      : [String(res.body.message)];
    expect(msgs.some((m) => m.toLowerCase().includes('cnpj'))).toBe(true);
  });

  it('401 — GET status de claim exige autenticação', async () => {
    const { claimId } = await createClaim();

    await request(app.getHttpServer())
      .get(`/auth/company/claim/${claimId}/status`)
      .expect(401);
  });

  it('200 — GET status retorna pending_review após criação', async () => {
    capturedOtp = null;
    const { claimId, registrationToken } = await createClaim();

    const confirmRes = await request(app.getHttpServer())
      .post('/auth/company/register/confirm')
      .send({ registrationToken, otp: capturedOtp ?? '000000' });

    const token: string = (confirmRes.body as { accessToken?: string }).accessToken ?? '';

    const statusRes = await request(app.getHttpServer())
      .get(`/auth/company/claim/${claimId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(statusRes.body.status).toBe('pending_review');
    expect(statusRes.body.claimId).toBe(claimId);
  });

  it('403 — usuário company não pode aprovar claim', async () => {
    const { claimId } = await createClaim();

    await request(app.getHttpServer())
      .post(`/auth/company/claim/${claimId}/approve`)
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(403);
  });

  it('404 — approve claim inexistente', async () => {
    await request(app.getHttpServer())
      .post('/auth/company/claim/00000000-0000-4000-a000-000000000000/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('200 — admin aprova claim, ativa empresa, cria companyProfile e gera auditoria', async () => {
    const { claimId } = await createClaim();

    const res = await request(app.getHttpServer())
      .post(`/auth/company/claim/${claimId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.status).toBe('approved');
    expect(res.body.claimId).toBe(claimId);
    expect(res.body.reviewedAt).toBeTruthy();

    const claim = await prisma.companyClaim.findUnique({ where: { id: claimId } });
    expect(claim?.status).toBe('approved');

    const company = await prisma.company.findUnique({ where: { id: claim!.companyId } });
    expect(company?.status).toBe(CompanyStatus.active);

    const profile = await prisma.companyProfile.findUnique({ where: { userId: claim!.requesterUserId } });
    expect(profile?.companyId).toBe(claim!.companyId);

    const audit = await prisma.moduleAuditLog.findFirst({
      where: { action: 'COMPANY_CLAIM_APPROVED', entityId: claimId },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.payload)).not.toContain('https://storage.trustcheck.com.br/docs/contrato.pdf');
  });

  it('409 — não aprova claim já aprovado', async () => {
    const { claimId } = await createClaim();

    await request(app.getHttpServer())
      .post(`/auth/company/claim/${claimId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/auth/company/claim/${claimId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    expect(second.body.message).toMatchObject({ code: 'CLAIM_ALREADY_REVIEWED' });
  });

  it('422 — rejeição exige motivo válido', async () => {
    const { claimId } = await createClaim();

    await request(app.getHttpServer())
      .post(`/auth/company/claim/${claimId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '' })
      .expect(422);
  });

  it('200 — admin rejeita claim e gera auditoria', async () => {
    const { claimId } = await createClaim();

    const res = await request(app.getHttpServer())
      .post(`/auth/company/claim/${claimId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Documento comprobatório ilegível.' })
      .expect(200);

    expect(res.body.status).toBe('rejected');
    expect(res.body.claimId).toBe(claimId);
    expect(res.body.rejectionReason).toBe('Documento comprobatório ilegível.');

    const audit = await prisma.moduleAuditLog.findFirst({
      where: { action: 'COMPANY_CLAIM_REJECTED', entityId: claimId },
    });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.payload)).toContain('Documento comprobatório ilegível.');
    expect(JSON.stringify(audit?.payload)).not.toContain('https://storage.trustcheck.com.br/docs/contrato.pdf');
  });
});
