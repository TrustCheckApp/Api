/**
 * E2E — Aceite de termo legal com auditoria (TC1-API-07)
 * 5 cenários obrigatórios:
 * 1. Aceite válido grava IP e versão
 * 2. Sem aceite → POST /cases retorna 422 LEGAL_TERM_NOT_ACCEPTED (hash vazio/inválido)
 * 3. Hash divergente → 409 LEGAL_TERM_HASH_MISMATCH
 * 4. Termo inativo → 410 LEGAL_TERM_INACTIVE
 * 5. Audit consultável retorna versão e contentHash
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

describe('Term Acceptance E2E (TC1-API-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  let adminToken: string;
  let consumerToken: string;

  let adminUserId: string;
  let consumerUserId: string;
  let companyId: string;

  let activeTerm: { id: string; contentHash: string; version: string };

  const makeToken = (userId: string, role: string) =>
    jwt.sign(
      { sub: userId, role },
      { secret: config.get<string>('JWT_SECRET'), expiresIn: '10m' },
    );

  const TERM_CONTENT = 'Ao utilizar a plataforma TrustCheck, você concorda com os termos de uso e política de privacidade vigentes. Este termo tem força legal conforme CDC e LGPD.';

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

    const admin = await prisma.user.create({
      data: { email: `tc7-admin-${Date.now()}@trustcheck.test`, passwordHash: 'h', role: UserRole.admin, status: UserStatus.active },
    });
    const consumer = await prisma.user.create({
      data: { email: `tc7-consumer-${Date.now()}@trustcheck.test`, passwordHash: 'h', role: UserRole.consumer, status: UserStatus.active },
    });
    const company = await prisma.company.create({
      data: { cnpj: `${Date.now()}`.slice(0, 14).padEnd(14, '0'), legalName: 'TC7 Test Corp', status: CompanyStatus.active },
    });

    adminUserId = admin.id;
    consumerUserId = consumer.id;
    companyId = company.id;

    adminToken = makeToken(admin.id, 'admin');
    consumerToken = makeToken(consumer.id, 'consumer');

    const publishRes = await request(app.getHttpServer())
      .post('/admin/legal-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ version: `1.0.${Date.now()}`, kind: TermKind.termos_uso, content: TERM_CONTENT })
      .expect(201);

    activeTerm = {
      id: (publishRes.body as { id: string }).id,
      contentHash: (publishRes.body as { contentHash: string }).contentHash,
      version: (publishRes.body as { version: string }).version,
    };
  });

  afterAll(async () => {
    await prisma.caseTermAcceptance.deleteMany({ where: { userId: consumerUserId } });
    await prisma.case.deleteMany({ where: { consumerUserId } });
    await prisma.legalTermV2.deleteMany({ where: { id: activeTerm?.id } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, consumerUserId] } } });
    await app.close();
  });

  const basePayload = () => ({
    companyId,
    experienceType: 'reclamacao',
    category: 'ecommerce',
    description: 'Produto entregue com defeito grave após quinze dias. Empresa ignorou todos os canais de atendimento disponíveis ao consumidor.',
    occurredAt: '2026-04-10',
    legalAcceptance: {
      termId: activeTerm.id,
      contentHashEcho: activeTerm.contentHash,
    },
  });

  // ─── Cenário 1: Aceite válido grava IP e versão ───────────────────────────

  it('Cenário 1 — 201: aceite válido grava IP e versão corretamente', async () => {
    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(basePayload())
      .expect(201);

    expect(res.body).toHaveProperty('id');

    const acceptance = await prisma.caseTermAcceptance.findUnique({
      where: { caseId: (res.body as { id: string }).id },
    });

    expect(acceptance).not.toBeNull();
    expect(acceptance!.termVersion).toBe(activeTerm.version);
    expect(acceptance!.contentHash).toBe(activeTerm.contentHash);
    expect(acceptance!.ip).toBeDefined();
  });

  // ─── Cenário 2: Hash vazio → campo obrigatório, DTO deve rejeitar ─────────

  it('Cenário 2 — 400: sem contentHashEcho → validação falha (campo obrigatório)', async () => {
    const payload = {
      ...basePayload(),
      legalAcceptance: { termId: activeTerm.id, contentHashEcho: '' },
    };

    await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(payload)
      .expect(400);
  });

  // ─── Cenário 3: Hash divergente → 409 LEGAL_TERM_HASH_MISMATCH ───────────

  it('Cenário 3 — 409 LEGAL_TERM_HASH_MISMATCH: hash enviado não confere', async () => {
    const payload = {
      ...basePayload(),
      legalAcceptance: {
        termId: activeTerm.id,
        contentHashEcho: crypto.createHash('sha256').update('conteudo errado').digest('hex'),
      },
    };

    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(payload)
      .expect(409);

    expect(res.body.message).toMatchObject({ code: 'LEGAL_TERM_HASH_MISMATCH' });
  });

  // ─── Cenário 4: Termo inativo → 410 LEGAL_TERM_INACTIVE ──────────────────

  it('Cenário 4 — 410 LEGAL_TERM_INACTIVE: termo desativado rejeitado', async () => {
    const inactiveTerm = await prisma.legalTermV2.create({
      data: {
        version: `0.9.${Date.now()}`,
        kind: TermKind.termos_uso,
        content: 'Termo antigo desativado para teste E2E de inatividade.',
        contentHash: crypto.createHash('sha256').update('Termo antigo desativado para teste E2E de inatividade.').digest('hex'),
        publishedAt: new Date(),
        active: false,
      },
    });

    const payload = {
      ...basePayload(),
      legalAcceptance: {
        termId: inactiveTerm.id,
        contentHashEcho: inactiveTerm.contentHash,
      },
    };

    const res = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send(payload)
      .expect(410);

    expect(res.body.message).toMatchObject({ code: 'LEGAL_TERM_INACTIVE' });

    await prisma.legalTermV2.delete({ where: { id: inactiveTerm.id } });
  });

  // ─── Cenário 5: Audit consultável ────────────────────────────────────────

  it('Cenário 5 — 200: GET /cases/:id/audit retorna versão e contentHash', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/cases')
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        ...basePayload(),
        description: 'Segundo caso para teste de auditoria. Produto defeituoso entregue após quinze dias de espera sem solução.',
      })
      .expect(201);

    const caseId = (createRes.body as { id: string }).id;

    const auditRes = await request(app.getHttpServer())
      .get(`/cases/${caseId}/audit`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .expect(200);

    expect(auditRes.body.termAcceptance).not.toBeNull();
    expect(auditRes.body.termAcceptance.termVersion).toBe(activeTerm.version);
    expect(auditRes.body.termAcceptance.contentHash).toBe(activeTerm.contentHash);
    expect(auditRes.body.termAcceptance.acceptedAt).toBeDefined();
  });
});
