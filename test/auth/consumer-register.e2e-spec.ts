/**
 * E2E — Cadastro de consumidor com OTP e SSO (TC1-API-03)
 * Requer: DATABASE_URL e REDIS_URL configurados (ou docker-compose.test.yml ativo)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { OTP_PROVIDER_TOKEN } from '../../src/modules/auth/providers/otp-provider.interface';

const TEST_EMAIL = `consumer-e2e-${Date.now()}@trustcheck.test`;
const TEST_PASSWORD = 'SenhaForte@123';

describe('POST /auth/consumer/register (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let jwt: JwtService;
  let config: ConfigService;
  let capturedOtp: string | null = null;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(OTP_PROVIDER_TOKEN)
      .useValue({
        send: async (params: { userId: string; email: string; code: string }) => {
          capturedOtp = params.code;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    redis = moduleRef.get(RedisService);
    jwt = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);
  });

  afterAll(async () => {
    await prisma.ssoIdentity.deleteMany({ where: { user: { email: { contains: 'trustcheck.test' } } } });
    await prisma.consumerProfile.deleteMany({ where: { user: { email: { contains: 'trustcheck.test' } } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await app.close();
  });

  describe('Fluxo completo de cadastro', () => {
    let registrationToken: string;
    let userId: string;

    it('201 — cria usuário e retorna registrationToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/consumer/register')
        .send({
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          fullName: 'Consumidor Teste E2E',
          lgpdAccepted: true,
          lgpdVersion: '1.0',
        })
        .expect(201);

      expect(res.body).toHaveProperty('userId');
      expect(res.body).toHaveProperty('registrationToken');
      expect(res.body).not.toHaveProperty('otp');
      expect(res.body).not.toHaveProperty('password');
      expect(capturedOtp).toMatch(/^\d{6}$/);

      registrationToken = res.body.registrationToken;
      userId = res.body.userId;
    });

    it('200 — confirma OTP e recebe tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/consumer/register/confirm')
        .send({ registrationToken, otp: capturedOtp })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).not.toHaveProperty('otp');
      expect(res.body.accessToken).toBeTruthy();
    });

    it('usuário deve ter status=active após confirmação', async () => {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      expect(user?.status).toBe('active');
    });
  });

  it('409 EMAIL_ALREADY_REGISTERED — e-mail já cadastrado', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/consumer/register')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        fullName: 'Outro Nome',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      })
      .expect(409);

    expect(res.body.message).toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
  });

  it('422 LGPD_NOT_ACCEPTED — lgpdAccepted=false', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/consumer/register')
      .send({
        email: `novo-${Date.now()}@trustcheck.test`,
        password: TEST_PASSWORD,
        fullName: 'Sem LGPD',
        lgpdAccepted: false,
        lgpdVersion: '1.0',
      })
      .expect(422);

    expect(res.body.message).toMatchObject({ code: 'LGPD_NOT_ACCEPTED' });
  });

  describe('Confirmação com OTP inválido', () => {
    let regToken: string;

    beforeAll(async () => {
      capturedOtp = null;
      const res = await request(app.getHttpServer())
        .post('/auth/consumer/register')
        .send({
          email: `otp-test-${Date.now()}@trustcheck.test`,
          password: TEST_PASSWORD,
          fullName: 'Teste OTP Inválido',
          lgpdAccepted: true,
          lgpdVersion: '1.0',
        });
      regToken = res.body.registrationToken;
    });

    it('400 OTP_INVALID — código errado', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/consumer/register/confirm')
        .send({ registrationToken: regToken, otp: '000000' })
        .expect(400);

      expect(res.body.message).toMatchObject({ code: 'OTP_INVALID' });
    });

    it('400 OTP_MAX_ATTEMPTS — 5 tentativas incorretas invalidam o código', async () => {
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/consumer/register/confirm')
          .send({ registrationToken: regToken, otp: '111111' });
      }

      const res = await request(app.getHttpServer())
        .post('/auth/consumer/register/confirm')
        .send({ registrationToken: regToken, otp: '111111' })
        .expect(400);

      expect(res.body.message).toMatchObject({ code: 'OTP_MAX_ATTEMPTS' });
    });
  });

  it('401 REQUEST_INVALID — rejeita token de cadastro que não pertence ao perfil consumidor', async () => {
    const companyUser = await prisma.user.create({
      data: {
        email: `company-token-${Date.now()}@trustcheck.test`,
        role: 'company',
        status: 'pending_otp',
      },
    });

    const registrationToken = await jwt.signAsync(
      { sub: companyUser.id, scope: 'otp_pending', role: 'company' },
      { expiresIn: '10m', secret: config.get<string>('JWT_SECRET') },
    );

    const res = await request(app.getHttpServer())
      .post('/auth/consumer/register/confirm')
      .send({ registrationToken, otp: '123456' })
      .expect(401);

    expect(res.body.message).toMatchObject({ code: 'REQUEST_INVALID' });

    const persisted = await prisma.user.findUnique({ where: { id: companyUser.id } });
    expect(persisted?.status).toBe('pending_otp');
  });

  it('400 OTP_EXPIRED — código removido do Redis', async () => {
    capturedOtp = null;
    const res = await request(app.getHttpServer())
      .post('/auth/consumer/register')
      .send({
        email: `expired-otp-${Date.now()}@trustcheck.test`,
        password: TEST_PASSWORD,
        fullName: 'Teste OTP Expirado',
        lgpdAccepted: true,
        lgpdVersion: '1.0',
      });

    const { registrationToken } = res.body;

    const payload = JSON.parse(
      Buffer.from(registrationToken.split('.')[1], 'base64').toString(),
    );
    await redis.del(`otp:code:${payload.sub}`);

    const confirm = await request(app.getHttpServer())
      .post('/auth/consumer/register/confirm')
      .send({ registrationToken, otp: capturedOtp ?? '000000' })
      .expect(400);

    expect(confirm.body.message).toMatchObject({ code: 'OTP_EXPIRED' });
  });
});
