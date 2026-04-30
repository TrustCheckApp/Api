/**
 * E2E — Abertura de caso por consumidor autenticado (TC1-API-05)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus, CompanyStatus } from '@prisma/client';

const PUBLIC_ID_RE = /^TC-\d{4}-\d{6}$/;

describe('POST /cases (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  let consumerToken: string;
  let companyId: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);

    const user = await prisma.user.create({
      data: {
        email: `e2e-cases-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.consumer,
        status: UserStatus.active,
      },
    });
    testUserId = user.id;

    const company = await prisma.company.create({
      data: {
        cnpj: `${Date.now()}`.slice(0, 14).padEnd(14, '0'),
        legalName: 'Empresa E2E Cases LTDA',
        status: CompanyStatus.active,
      },
    });
    companyId = company.id;

    consumerToken = await jwt.signAsync(
      { sub: user.id, role: 'consumer' },
      { secret: config.get<string>('JWT_SECRET'), expiresIn: '10m' },
    );
  });

  afterAll(async () => {
    await prisma.case.deleteMany({ where: { consumerUserId: testUserId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await app.close();
  });

  // ─── Sucesso ──────────────────────────────────────────────────────────────

  it('201 — cria caso e retorna public_id no formato TC-YYYY-NNNNNN', async () => {
    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        companyId,
        experienceType: 'reclamacao',
        category: 'ecommerce',
        description: 'Produto entregue com avaria grave após 15 dias de espera. A empresa ignorou todos os chamados de suporte abertos pelo consumidor.',
        monetaryValue: 349.90,
        occurredAt: '2026-04-10',
      })
      .expect(201);

    expect(res.body).toHaveProperty('publicId');
    expect(res.body.publicId).toMatch(PUBLIC_ID_RE);
    expect(res.body.status).toBe('ENVIADO');
  });

  // ─── Data futura ─────────────────────────────────────────────────────────

  it('422 CASE_OCCURRED_AT_FUTURE — occurredAt amanhã', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        companyId,
        experienceType: 'reclamacao',
        category: 'servicos',
        description: 'Descrição com tamanho adequado para passar na validação do campo de descrição do caso aberto.',
        occurredAt: tomorrow.toISOString().split('T')[0],
      })
      .expect(422);

    expect(res.body.message).toMatchObject({ code: 'CASE_OCCURRED_AT_FUTURE' });
  });

  // ─── Sem autenticação ────────────────────────────────────────────────────

  it('401 — sem token de autorização', async () => {
    await request(app.getHttpServer())
      .post('/cases')
      .send({
        companyId,
        experienceType: 'reclamacao',
        category: 'ecommerce',
        description: 'Descrição qualquer',
        occurredAt: '2026-01-01',
      })
      .expect(401);
  });

  // ─── Empresa não encontrada ───────────────────────────────────────────────

  it('404 COMPANY_NOT_FOUND — companyId inexistente', async () => {
    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        companyId: '00000000-0000-4000-a000-000000000000',
        experienceType: 'reclamacao',
        category: 'financeiro',
        description: 'Descrição com tamanho adequado para passar na validação do campo de descrição do caso aberto.',
        occurredAt: '2026-03-01',
      })
      .expect(404);

    expect(res.body.message).toMatchObject({ code: 'COMPANY_NOT_FOUND' });
  });

  // ─── GET por public_id ────────────────────────────────────────────────────

  it('GET /cases/:publicId — retorna caso criado', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        companyId,
        experienceType: 'elogio',
        category: 'saude',
        description: 'Atendimento excelente e resolutivo dentro do prazo estipulado. Empresa superou as expectativas do consumidor em todos os aspectos.',
        occurredAt: '2026-04-05',
      })
      .expect(201);

    const { publicId } = createRes.body as { publicId: string };
    expect(publicId).toMatch(PUBLIC_ID_RE);

    const getRes = await request(app.getHttpServer())
      .get(`/cases/${publicId}`)
      .expect(200);

    expect(getRes.body.publicId).toBe(publicId);
    expect(getRes.body).toHaveProperty('company');
    expect(getRes.body.company).not.toHaveProperty('cnpj');
  });
});
