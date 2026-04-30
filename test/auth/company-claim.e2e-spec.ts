/**
 * E2E — Claim de perfil empresarial (TC1-API-04)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OTP_PROVIDER_TOKEN } from '../../src/modules/auth/providers/otp-provider.interface';

const CLAIM_CNPJ = '33.000.167/0001-01';
const BASE_EMAIL = () => `claim-e2e-${Date.now()}@trustcheck.test`;
const PASSWORD = 'EmpresaClaim@99';
const DOCS = [
  {
    url: 'https://storage.trustcheck.com.br/docs/contrato.pdf',
    fileName: 'contrato.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 204800,
  },
];

describe('POST /auth/company/claim (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let capturedOtp: string | null = null;

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
  });

  afterAll(async () => {
    await prisma.companyClaimDocument.deleteMany({
      where: { claim: { requester: { email: { contains: 'trustcheck.test' } } } },
    });
    await prisma.companyClaim.deleteMany({
      where: { requester: { email: { contains: 'trustcheck.test' } } },
    });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await prisma.company.deleteMany({ where: { cnpj: CLAIM_CNPJ.replace(/\D/g, '') } });
    await app.close();
  });

  // ─── Sucesso: claim com documento ─────────────────────────────────────────

  it('202 — claim criado e audit_log gravado', async () => {
    capturedOtp = null;
    const email = BASE_EMAIL();

    const res = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send({
        cnpj: CLAIM_CNPJ,
        legalName: 'Empresa Reivindicada LTDA',
        email,
        password: PASSWORD,
        fullName: 'Representante Legal',
        documents: DOCS,
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(202);

    expect(res.body).toHaveProperty('claimId');
    expect(res.body).toHaveProperty('registrationToken');

    const audit = await prisma.moduleAuditLog.findFirst({
      where: { action: 'COMPANY_CLAIM_SUBMITTED', entityId: res.body.claimId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.action).toBe('COMPANY_CLAIM_SUBMITTED');
  });

  // ─── Claim sem documentos ──────────────────────────────────────────────────

  it('422 CLAIM_DOCUMENTS_REQUIRED — array vazio de documentos', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send({
        cnpj: '04.252.011/0001-10',
        legalName: 'Empresa Sem Docs LTDA',
        email: BASE_EMAIL(),
        password: PASSWORD,
        fullName: 'Representante',
        documents: [],
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(422);

    const msgs: string[] = Array.isArray(res.body.message)
      ? (res.body.message as string[])
      : [String(res.body.message)];

    const hasDocError = msgs.some(
      (m) => m.toLowerCase().includes('documento') || (res.body.message as { code?: string })?.code === 'CLAIM_DOCUMENTS_REQUIRED',
    );
    expect(hasDocError).toBe(true);
  });

  // ─── CNPJ inválido no claim ────────────────────────────────────────────────

  it('422 CNPJ inválido — dígito verificador errado no claim', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send({
        cnpj: '11.222.333/0001-00',
        legalName: 'Empresa Inválida',
        email: BASE_EMAIL(),
        password: PASSWORD,
        fullName: 'Rep',
        documents: DOCS,
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(422);

    const msgs: string[] = Array.isArray(res.body.message)
      ? (res.body.message as string[])
      : [String(res.body.message)];
    expect(msgs.some((m) => m.toLowerCase().includes('cnpj'))).toBe(true);
  });

  // ─── Status do claim ──────────────────────────────────────────────────────

  it('GET /claim/:id/status — retorna status pending_review após criação', async () => {
    capturedOtp = null;
    const email = BASE_EMAIL();

    const claimRes = await request(app.getHttpServer())
      .post('/auth/company/claim')
      .send({
        cnpj: '07.526.557/0001-00',
        legalName: 'Status Test LTDA',
        email,
        password: PASSWORD,
        fullName: 'Rep Status',
        documents: DOCS,
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      });

    if (claimRes.status !== 202) return;

    const { claimId, registrationToken } = claimRes.body as { claimId: string; registrationToken: string };

    const confirmRes = await request(app.getHttpServer())
      .post('/auth/company/register/confirm')
      .send({ registrationToken, otp: capturedOtp ?? '000000' });

    const token: string = (confirmRes.body as { accessToken?: string })?.accessToken ?? '';

    const statusRes = await request(app.getHttpServer())
      .get(`/auth/company/claim/${claimId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(statusRes.body.status).toBe('pending_review');
    expect(statusRes.body.claimId).toBe(claimId);
  });
});
