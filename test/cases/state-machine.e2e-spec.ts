/**
 * E2E — Pipeline de estados (TC1-API-06)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as crypto from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole, UserStatus, CompanyStatus, CaseStatus, TermKind } from '@prisma/client';

describe('State Machine E2E (TC1-API-06)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  let adminToken: string;
  let consumerToken: string;
  let companyToken: string;
  let otherCompanyToken: string;

  let companyId: string;
  let otherCompanyId: string;
  let caseId: string;
  let legalTerm: { id: string; contentHash: string };

  const makeToken = (userId: string, role: string) =>
    jwt.sign(
      { sub: userId, role },
      { secret: config.get<string>('JWT_SECRET'), expiresIn: '10m' },
    );

  const internalHeader = (body = {}) => {
    const secret = config.get<string>('INTERNAL_HMAC_SECRET') ?? 'test-secret';
    return crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
  };

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

    const adminUser = await prisma.user.create({
      data: { email: `sm-admin-${Date.now()}@trustcheck.test`, passwordHash: 'h', role: UserRole.admin, status: UserStatus.active },
    });
    const consumerUser = await prisma.user.create({
      data: { email: `sm-consumer-${Date.now()}@trustcheck.test`, passwordHash: 'h', role: UserRole.consumer, status: UserStatus.active },
    });
    const companyUser = await prisma.user.create({
      data: { email: `sm-company-${Date.now()}@trustcheck.test`, passwordHash: 'h', role: UserRole.company, status: UserStatus.active },
    });
    const otherCompanyUser = await prisma.user.create({
      data: { email: `sm-other-company-${Date.now()}@trustcheck.test`, passwordHash: 'h', role: UserRole.company, status: UserStatus.active },
    });

    const company = await prisma.company.create({
      data: { cnpj: `${Date.now()}`.slice(0, 14).padEnd(14, '0'), legalName: 'SM Test Corp', status: CompanyStatus.active },
    });
    const otherCompany = await prisma.company.create({
      data: { cnpj: `${Date.now() + 1}`.slice(0, 14).padEnd(14, '1'), legalName: 'SM Other Corp', status: CompanyStatus.active },
    });

    companyId = company.id;
    otherCompanyId = otherCompany.id;

    await prisma.companyProfile.create({ data: { userId: companyUser.id, companyId, role: 'owner' } });
    await prisma.companyProfile.create({ data: { userId: otherCompanyUser.id, companyId: otherCompanyId, role: 'owner' } });

    const content = `Termo denúncia state-machine ${Date.now()}`;
    const contentHash = crypto.createHash('sha256').update(content).digest('hex');
    legalTerm = await prisma.legalTermV2.create({
      data: {
        version: `sm-${Date.now()}`,
        kind: TermKind.denuncia,
        content,
        contentHash,
        active: true,
        publishedBy: adminUser.id,
      },
      select: { id: true, contentHash: true },
    });

    adminToken = makeToken(adminUser.id, 'admin');
    consumerToken = makeToken(consumerUser.id, 'consumer');
    companyToken = makeToken(companyUser.id, 'company');
    otherCompanyToken = makeToken(otherCompanyUser.id, 'company');
  });

  afterAll(async () => {
    if (caseId) {
      await prisma.caseStatusTransition.deleteMany({ where: { caseId } });
      await prisma.caseTermAcceptance.deleteMany({ where: { caseId } });
      await prisma.case.deleteMany({ where: { id: caseId } });
    }
    await prisma.legalTermV2.deleteMany({ where: { version: { startsWith: 'sm-' } } });
    await prisma.companyProfile.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId].filter(Boolean) } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await app.close();
  });

  it('Step 1 — 201 cria caso ENVIADO', async () => {
    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        companyId,
        experienceType: 'reclamacao',
        category: 'ecommerce',
        description: 'Produto defeituoso entregue em prazo fora do combinado. Empresa não retornou nenhuma das chamadas abertas.',
        occurredAt: '2026-04-10',
        legalAcceptance: {
          termId: legalTerm.id,
          contentHashEcho: legalTerm.contentHash,
        },
      })
      .expect(201);

    caseId = (res.body as { id: string }).id;
    expect(res.body.status).toBe(CaseStatus.ENVIADO);
  });

  it('Step 2 — 200 admin inicia moderação', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/moderation/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.toStatus).toBe(CaseStatus.EM_MODERACAO);
  });

  it('Step 3 — 200 admin aprova moderação', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/moderation/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.toStatus).toBe(CaseStatus.PUBLICADO);
  });

  it('Step 4 — 200 system notifica empresa', async () => {
    const body = {};
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/notify-company`)
      .set('X-Internal-Signature', internalHeader(body))
      .send(body)
      .expect(200);

    expect(res.body.toStatus).toBe(CaseStatus.AGUARDANDO_RESPOSTA_EMPRESA);
  });

  it('403 — empresa sem vínculo não pode responder caso de outra empresa', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/company/respond`)
      .set('Authorization', `Bearer ${otherCompanyToken}`)
      .expect(403);

    expect(res.body.message).toMatchObject({ code: 'CASE_COMPANY_ACCESS_FORBIDDEN' });
  });

  it('Step 5 — 200 empresa vinculada aceita negociar', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/company/respond`)
      .set('Authorization', `Bearer ${companyToken}`)
      .expect(200);

    expect(res.body.toStatus).toBe(CaseStatus.EM_NEGOCIACAO);
  });

  it('409 — resolução exige dupla confirmação', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ consumerConfirmed: true, companyConfirmed: false })
      .expect(409);

    expect(res.body.message).toMatchObject({ code: 'CASE_RESOLUTION_CONFIRMATION_REQUIRED' });
  });

  it('Step 6 — 200 admin resolve caso', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ consumerConfirmed: true, companyConfirmed: true })
      .expect(200);

    expect(res.body.toStatus).toBe(CaseStatus.RESOLVIDO);
  });

  it('registra timeline e audit log para transições', async () => {
    const transitions = await prisma.caseStatusTransition.count({ where: { caseId } });
    const auditLogs = await prisma.moduleAuditLog.count({
      where: { action: 'CASE_STATUS_TRANSITION', entity: 'case', entityId: caseId },
    });

    expect(transitions).toBeGreaterThanOrEqual(5);
    expect(auditLogs).toBeGreaterThanOrEqual(5);
  });

  it('409 CASE_INVALID_TRANSITION — RESOLVIDO não pode voltar', async () => {
    await request(app.getHttpServer())
      .post(`/cases/${caseId}/moderation/start`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('403 — consumidor tenta iniciar moderação', async () => {
    const anotherCase = await prisma.case.create({
      data: {
        consumerUserId: (await prisma.user.findFirst({ where: { role: UserRole.consumer } }))!.id,
        companyId,
        experienceType: 'elogio',
        category: 'saude',
        description: 'Desc longa o suficiente para passar na validação do campo obrigatório.',
        occurredAt: new Date('2026-03-01'),
        status: CaseStatus.ENVIADO,
      },
    });

    await request(app.getHttpServer())
      .post(`/cases/${anotherCase.id}/moderation/start`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(403);

    await prisma.case.delete({ where: { id: anotherCase.id } });
  });

  it('401 — X-Internal-Signature errada em notify-company', async () => {
    await request(app.getHttpServer())
      .post(`/cases/${caseId}/notify-company`)
      .set('X-Internal-Signature', 'invalido0000')
      .send({})
      .expect(401);
  });
});
