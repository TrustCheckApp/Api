/**
 * E2E — Abertura de caso por consumidor autenticado (TC1-API-05)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus, CompanyStatus, TermKind } from '@prisma/client';

const PUBLIC_ID_RE = /^TC-\d{4}-\d{6}$/;
const CASE_DESCRIPTION = 'Produto entregue com avaria grave após 15 dias de espera. A empresa ignorou todos os chamados de suporte abertos pelo consumidor.';

describe('POST /cases (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  let consumerToken: string;
  let companyToken: string;
  let adminToken: string;
  let otherConsumerToken: string;
  let companyId: string;
  let testUserId: string;
  let legalTerm: { id: string; contentHash: string };
  let inactiveLegalTerm: { id: string; contentHash: string };

  const makeToken = (userId: string, role: string) =>
    jwt.sign(
      { sub: userId, role },
      { secret: config.get<string>('JWT_SECRET'), expiresIn: '10m' },
    );

  const validPayload = () => ({
    companyId,
    experienceType: 'reclamacao',
    category: 'ecommerce',
    description: CASE_DESCRIPTION,
    monetaryValue: 349.9,
    occurredAt: '2026-04-10',
    legalAcceptance: {
      termId: legalTerm.id,
      contentHashEcho: legalTerm.contentHash,
    },
  });

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

    const otherConsumer = await prisma.user.create({
      data: {
        email: `e2e-cases-other-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.consumer,
        status: UserStatus.active,
      },
    });

    const companyUser = await prisma.user.create({
      data: {
        email: `e2e-cases-company-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.company,
        status: UserStatus.active,
      },
    });

    const adminUser = await prisma.user.create({
      data: {
        email: `e2e-cases-admin-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.admin,
        status: UserStatus.active,
      },
    });

    const company = await prisma.company.create({
      data: {
        cnpj: `${Date.now()}`.slice(0, 14).padEnd(14, '0'),
        legalName: 'Empresa E2E Cases LTDA',
        status: CompanyStatus.active,
      },
    });
    companyId = company.id;

    const content = `Termo denúncia open-case ${Date.now()}`;
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    legalTerm = await prisma.legalTermV2.create({
      data: {
        version: `open-case-${Date.now()}`,
        kind: TermKind.denuncia,
        content,
        contentHash,
        active: true,
        publishedBy: adminUser.id,
      },
      select: { id: true, contentHash: true },
    });

    const inactiveContent = `Termo inativo open-case ${Date.now()}`;
    inactiveLegalTerm = await prisma.legalTermV2.create({
      data: {
        version: `open-case-inactive-${Date.now()}`,
        kind: TermKind.denuncia,
        content: inactiveContent,
        contentHash: crypto.createHash('sha256').update(inactiveContent).digest('hex'),
        active: false,
        publishedBy: adminUser.id,
      },
      select: { id: true, contentHash: true },
    });

    consumerToken = makeToken(user.id, 'consumer');
    otherConsumerToken = makeToken(otherConsumer.id, 'consumer');
    companyToken = makeToken(companyUser.id, 'company');
    adminToken = makeToken(adminUser.id, 'admin');
  });

  afterAll(async () => {
    await prisma.caseStatusTransition.deleteMany({ where: { case: { consumerUserId: testUserId } } });
    await prisma.caseTermAcceptance.deleteMany({ where: { userId: testUserId } });
    await prisma.case.deleteMany({ where: { consumerUserId: testUserId } });
    await prisma.legalTermV2.deleteMany({ where: { version: { startsWith: 'open-case' } } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await app.close();
  });

  it('201 — cria caso e aceite legal de forma atômica', async () => {
    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(validPayload())
      .expect(201);

    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('publicId');
    expect(res.body.publicId).toMatch(PUBLIC_ID_RE);
    expect(res.body.status).toBe('ENVIADO');
    expect(res.body).not.toHaveProperty('consumerUserId');
    expect(res.body).not.toHaveProperty('company');

    const acceptance = await prisma.caseTermAcceptance.findUnique({ where: { caseId: res.body.id } });
    expect(acceptance?.termId).toBe(legalTerm.id);
    expect(acceptance?.contentHash).toBe(legalTerm.contentHash);
  });

  it('401 — sem token de autorização', async () => {
    await request(app.getHttpServer())
      .post('/cases')
      .send(validPayload())
      .expect(401);
  });

  it('403 — empresa não pode abrir caso como consumidor', async () => {
    await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${companyToken}`)
      .send(validPayload())
      .expect(403);
  });

  it('403 — admin não pode abrir caso como consumidor', async () => {
    await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(validPayload())
      .expect(403);
  });

  it('404 COMPANY_NOT_FOUND — companyId inexistente', async () => {
    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...validPayload(),
        companyId: '00000000-0000-4000-a000-000000000000',
      })
      .expect(404);

    expect(res.body.message).toMatchObject({ code: 'COMPANY_NOT_FOUND' });
  });

  it('409 LEGAL_TERM_HASH_MISMATCH — não deixa caso órfão quando hash diverge', async () => {
    const before = await prisma.case.count({ where: { consumerUserId: testUserId } });

    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...validPayload(),
        legalAcceptance: {
          termId: legalTerm.id,
          contentHashEcho: '0'.repeat(64),
        },
      })
      .expect(409);

    expect(res.body.message).toMatchObject({ code: 'LEGAL_TERM_HASH_MISMATCH' });

    const after = await prisma.case.count({ where: { consumerUserId: testUserId } });
    expect(after).toBe(before);
  });

  it('410 LEGAL_TERM_INACTIVE — não deixa caso órfão com termo inativo', async () => {
    const before = await prisma.case.count({ where: { consumerUserId: testUserId } });

    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...validPayload(),
        legalAcceptance: {
          termId: inactiveLegalTerm.id,
          contentHashEcho: inactiveLegalTerm.contentHash,
        },
      })
      .expect(410);

    expect(res.body.message).toMatchObject({ code: 'LEGAL_TERM_INACTIVE' });

    const after = await prisma.case.count({ where: { consumerUserId: testUserId } });
    expect(after).toBe(before);
  });

  it('422 CASE_OCCURRED_AT_FUTURE — occurredAt amanhã', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...validPayload(),
        occurredAt: tomorrow.toISOString().split('T')[0],
      })
      .expect(422);

    expect(res.body.message).toMatchObject({ code: 'CASE_OCCURRED_AT_FUTURE' });
  });

  it('422 — descrição curta', async () => {
    await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...validPayload(),
        description: 'curta',
      })
      .expect(422);
  });

  it('GET /cases/:publicId — retorna caso com payload minimizado', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...validPayload(),
        experienceType: 'elogio',
        category: 'saude',
        description: 'Atendimento excelente e resolutivo dentro do prazo estipulado. Empresa superou as expectativas do consumidor em todos os aspectos.',
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
    expect(getRes.body).not.toHaveProperty('consumerUserId');
    expect(getRes.body).not.toHaveProperty('termAcceptance');
    expect(getRes.body).not.toHaveProperty('evidences');
  });

  it('GET /cases/:id/audit — bloqueia consumidor que não é dono', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(validPayload())
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/cases/${createRes.body.id}/audit`)
      .set('Authorization', `Bearer ${otherConsumerToken}`)
      .expect(403);

    expect(res.body.message).toMatchObject({ code: 'CASE_AUDIT_FORBIDDEN' });
  });

  it('GET /cases/:id/audit — admin acessa aceite legal minimizado', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(validPayload())
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/cases/${createRes.body.id}/audit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.case).toMatchObject({ id: createRes.body.id, status: 'ENVIADO' });
    expect(res.body.termAcceptance).toHaveProperty('termVersion');
    expect(res.body.termAcceptance).toHaveProperty('contentHash');
    expect(res.body.termAcceptance).toHaveProperty('acceptedAt');
    expect(res.body.termAcceptance).toHaveProperty('ip');
    expect(res.body.termAcceptance).not.toHaveProperty('userId');
    expect(res.body.termAcceptance).not.toHaveProperty('termId');
  });
});
