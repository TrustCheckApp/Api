/**
 * E2E — Cadastro empresarial com CNPJ (TC1-API-04)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OTP_PROVIDER_TOKEN } from '../../src/modules/auth/providers/otp-provider.interface';

const VALID_CNPJ = '11.222.333/0001-81';
const INVALID_CNPJ = '11.222.333/0001-00';
const BASE_EMAIL = () => `company-e2e-${Date.now()}@trustcheck.test`;
const PASSWORD = 'EmpresaForte@99';

describe('POST /auth/company/register (E2E)', () => {
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
    await prisma.companyProfile.deleteMany({ where: { user: { email: { contains: 'trustcheck.test' } } } });
    await prisma.companyClaim.deleteMany({ where: { requester: { email: { contains: 'trustcheck.test' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await prisma.company.deleteMany({ where: { cnpj: VALID_CNPJ.replace(/\D/g, '') } });
    await app.close();
  });

  // ─── Sucesso: CNPJ novo ────────────────────────────────────────────────────

  it('201 — cria empresa e retorna registrationToken', async () => {
    capturedOtp = null;
    const res = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
        password: PASSWORD,
        cnpj: VALID_CNPJ,
        legalName: 'Empresa Teste LTDA',
        fullName: 'João Representante',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(201);

    expect(res.body).toHaveProperty('userId');
    expect(res.body).toHaveProperty('registrationToken');
    expect(capturedOtp).toMatch(/^\d{6}$/);
  });

  // ─── CNPJ inválido por DV ──────────────────────────────────────────────────

  it('422 CNPJ_INVALID — dígito verificador errado', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
        password: PASSWORD,
        cnpj: INVALID_CNPJ,
        legalName: 'Empresa Inválida LTDA',
        fullName: 'Teste DV',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(422);

    const msgs: string[] = Array.isArray(res.body.message)
      ? (res.body.message as string[])
      : [String(res.body.message)];
    expect(msgs.some((m) => m.toLowerCase().includes('cnpj'))).toBe(true);
  });

  // ─── CNPJ já com titular ativo ────────────────────────────────────────────

  it('409 CNPJ_ALREADY_OWNED — segundo cadastro com mesmo CNPJ ativo', async () => {
    const firstEmail = BASE_EMAIL();
    const firstRes = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: firstEmail,
        password: PASSWORD,
        cnpj: '60.746.948/0001-12',
        legalName: 'Empresa Dono LTDA',
        fullName: 'Primeiro Dono',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      });

    if (firstRes.status === 201) {
      await request(app.getHttpServer())
        .post('/auth/company/register/confirm')
        .send({ registrationToken: firstRes.body.registrationToken, otp: capturedOtp });
    }

    const res = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
        password: PASSWORD,
        cnpj: '60.746.948/0001-12',
        legalName: 'Empresa Dono LTDA',
        fullName: 'Segundo Tentante',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(409);

    expect(res.body.message).toMatchObject({ code: 'CNPJ_ALREADY_OWNED' });
  });

  // ─── LGPD não aceita ──────────────────────────────────────────────────────

  it('422 LGPD_NOT_ACCEPTED — lgpdAccepted=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
        password: PASSWORD,
        cnpj: VALID_CNPJ,
        legalName: 'Empresa Sem LGPD',
        fullName: 'Rep Teste',
        lgpdAccepted: false,
        lgpdVersion: '1.0',
      })
      .expect(422);

    expect(res.body.message).toMatchObject({ code: 'LGPD_NOT_ACCEPTED' });
  });
});
