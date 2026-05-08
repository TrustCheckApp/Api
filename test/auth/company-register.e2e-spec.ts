/**
 * E2E — Cadastro empresarial com CNPJ, OTP e enrolamento 2FA/TOTP (TC1-API-04)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
  let jwt: JwtService;
  let config: ConfigService;
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
    jwt = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);
  });

  afterAll(async () => {
    await prisma.companyProfile.deleteMany({ where: { user: { email: { contains: 'trustcheck.test' } } } });
    await prisma.companyClaim.deleteMany({ where: { requester: { email: { contains: 'trustcheck.test' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await prisma.company.deleteMany({ where: { legalName: { contains: 'Empresa' } } });
    await app.close();
  });

  it('201 — cria empresa e retorna registrationToken sem expor OTP/senha', async () => {
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
    expect(res.body).not.toHaveProperty('otp');
    expect(res.body).not.toHaveProperty('password');
    expect(capturedOtp).toMatch(/^\d{6}$/);
  });

  it('200 — confirma OTP e retorna material TOTP one-shot com token temporário', async () => {
    capturedOtp = null;
    const register = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
        password: PASSWORD,
        cnpj: '81.529.276/0001-72',
        legalName: 'Empresa TOTP LTDA',
        fullName: 'Maria Representante',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/auth/company/register/confirm')
      .send({ registrationToken: register.body.registrationToken, otp: capturedOtp })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('totpSecret');
    expect(res.body).toHaveProperty('qrCodeDataUrl');
    expect(res.body).toHaveProperty('recoveryCodes');
    expect(res.body).not.toHaveProperty('refreshToken');
    expect(res.body).not.toHaveProperty('otp');
    expect(res.body).not.toHaveProperty('password');
    expect(Array.isArray(res.body.recoveryCodes)).toBe(true);
    expect(res.body.recoveryCodes).toHaveLength(10);

    const payload = await jwt.verifyAsync(res.body.accessToken, {
      secret: config.get<string>('JWT_SECRET'),
    });
    expect(payload.scope).toBe('totp_pending');
    expect(payload.role).toBe('company');

    const user = await prisma.user.findUnique({ where: { id: register.body.userId } });
    expect(user?.status).toBe('active');
  });

  it('401 REQUEST_INVALID — rejeita confirmationToken que não pertence ao perfil empresa', async () => {
    const consumerUser = await prisma.user.create({
      data: {
        email: `consumer-token-${Date.now()}@trustcheck.test`,
        role: 'consumer',
        status: 'pending_otp',
      },
    });

    const registrationToken = await jwt.signAsync(
      { sub: consumerUser.id, scope: 'otp_pending', role: 'consumer' },
      { expiresIn: '10m', secret: config.get<string>('JWT_SECRET') },
    );

    const res = await request(app.getHttpServer())
      .post('/auth/company/register/confirm')
      .send({ registrationToken, otp: '123456' })
      .expect(401);

    expect(res.body.message).toMatchObject({ code: 'REQUEST_INVALID' });

    const persisted = await prisma.user.findUnique({ where: { id: consumerUser.id } });
    expect(persisted?.status).toBe('pending_otp');
  });

  it('400 OTP_ALREADY_CONFIRMED — bloqueia segunda confirmação do mesmo cadastro', async () => {
    capturedOtp = null;
    const register = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
        password: PASSWORD,
        cnpj: '13.339.532/0001-09',
        legalName: 'Empresa Reconfirmacao LTDA',
        fullName: 'Ana Representante',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/company/register/confirm')
      .send({ registrationToken: register.body.registrationToken, otp: capturedOtp })
      .expect(200);

    const second = await request(app.getHttpServer())
      .post('/auth/company/register/confirm')
      .send({ registrationToken: register.body.registrationToken, otp: capturedOtp })
      .expect(400);

    expect(second.body.message).toMatchObject({ code: 'OTP_ALREADY_CONFIRMED' });
  });

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

  it('409 CNPJ_ALREADY_OWNED — segundo cadastro com mesmo CNPJ ativo', async () => {
    capturedOtp = null;
    const firstRes = await request(app.getHttpServer())
      .post('/auth/company/register')
      .send({
        email: BASE_EMAIL(),
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
