/**
 * E2E — Evidências de casos (TC-S1-API-06)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { CompanyStatus, UserRole, UserStatus, CaseStatus } from '@prisma/client';
import { MAX_EVIDENCE_SIZE_BYTES } from '../../src/modules/cases/evidences/case-evidence.constants';

describe('Case evidences (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let config: ConfigService;

  let caseId: string;
  let companyId: string;
  let consumerId: string;
  let linkedCompanyUserId: string;
  let otherConsumerToken: string;
  let consumerToken: string;
  let companyToken: string;
  let adminToken: string;

  const makeToken = (userId: string, role: string) =>
    jwt.sign({ sub: userId, role }, { secret: config.get<string>('JWT_SECRET'), expiresIn: '10m' });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    config = moduleRef.get(ConfigService);

    const consumer = await prisma.user.create({
      data: {
        email: `evidence-consumer-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.consumer,
        status: UserStatus.active,
      },
    });
    consumerId = consumer.id;

    const otherConsumer = await prisma.user.create({
      data: {
        email: `evidence-other-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.consumer,
        status: UserStatus.active,
      },
    });

    const companyUser = await prisma.user.create({
      data: {
        email: `evidence-company-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.company,
        status: UserStatus.active,
      },
    });
    linkedCompanyUserId = companyUser.id;

    const admin = await prisma.user.create({
      data: {
        email: `evidence-admin-${Date.now()}@trustcheck.test`,
        passwordHash: 'hash-placeholder',
        role: UserRole.admin,
        status: UserStatus.active,
      },
    });

    const company = await prisma.company.create({
      data: {
        cnpj: `${Date.now()}`.slice(0, 14).padEnd(14, '0'),
        legalName: 'Empresa Evidências LTDA',
        status: CompanyStatus.active,
      },
    });
    companyId = company.id;

    await prisma.companyProfile.create({
      data: { userId: linkedCompanyUserId, companyId, role: 'owner' },
    });

    const createdCase = await prisma.case.create({
      data: {
        consumerUserId: consumerId,
        companyId,
        experienceType: 'reclamacao',
        category: 'ecommerce',
        description: 'Caso base para validação dos metadados seguros de evidências.',
        monetaryValue: 120.55,
        occurredAt: new Date('2026-04-10'),
        status: CaseStatus.ENVIADO,
      },
    });
    caseId = createdCase.id;

    consumerToken = makeToken(consumer.id, 'consumer');
    otherConsumerToken = makeToken(otherConsumer.id, 'consumer');
    companyToken = makeToken(companyUser.id, 'company');
    adminToken = makeToken(admin.id, 'admin');
  });

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM case_evidences WHERE case_id = ${caseId}::uuid`;
    await prisma.case.deleteMany({ where: { id: caseId } });
    await prisma.companyProfile.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.user.deleteMany({ where: { email: { contains: 'trustcheck.test' } } });
    await app.close();
  });

  it('201 — consumidor dono registra JPEG sem expor storageKey', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        fileName: 'foto-produto.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        checksumSha256: 'a'.repeat(64),
        description: 'Foto do produto recebido com avaria.',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      caseId,
      fileName: 'foto-produto.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
      checksumSha256: 'a'.repeat(64),
      status: 'pending_upload',
      upload: { method: 'SIGNED_UPLOAD_PENDING' },
    });
    expect(res.body).not.toHaveProperty('storageKey');
    expect(res.body).not.toHaveProperty('privateUrl');
    expect(res.body).not.toHaveProperty('bucket');
  });

  it.each([
    ['contrato.pdf', 'application/pdf'],
    ['relato.doc', 'application/msword'],
    ['planilha.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['video.mp4', 'video/mp4'],
    ['audio.aac', 'audio/aac'],
  ])('201 — aceita formato permitido %s', async (fileName, mimeType) => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ fileName, mimeType, sizeBytes: 2048 })
      .expect(201);

    expect(res.body.fileName).toBe(fileName);
    expect(res.body.mimeType).toBe(mimeType);
    expect(res.body).not.toHaveProperty('storageKey');
  });

  it('201 — empresa vinculada registra evidência', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${companyToken}`)
      .send({ fileName: 'resposta-empresa.pdf', mimeType: 'application/pdf', sizeBytes: 4096 })
      .expect(201);

    expect(res.body.status).toBe('pending_upload');
    expect(res.body.uploadedByUserId).toBe(linkedCompanyUserId);
  });

  it('422 CASE_EVIDENCE_UNSUPPORTED_TYPE — MIME não permitido', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({ fileName: 'script.js', mimeType: 'application/javascript', sizeBytes: 100 })
      .expect(422);

    expect(res.body.message).toMatchObject({ code: 'CASE_EVIDENCE_UNSUPPORTED_TYPE' });
  });

  it('422 CASE_EVIDENCE_SIZE_EXCEEDED — tamanho acima do limite', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${consumerToken}`)
      .send({
        fileName: 'video-grande.mp4',
        mimeType: 'video/mp4',
        sizeBytes: MAX_EVIDENCE_SIZE_BYTES + 1,
      })
      .expect(422);

    expect(res.body.message).toMatchObject({ code: 'CASE_EVIDENCE_SIZE_EXCEEDED' });
  });

  it('403 CASE_EVIDENCE_FORBIDDEN — consumidor sem vínculo não cria evidência', async () => {
    const res = await request(app.getHttpServer())
      .post(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${otherConsumerToken}`)
      .send({ fileName: 'foto.png', mimeType: 'image/png', sizeBytes: 2048 })
      .expect(403);

    expect(res.body.message).toMatchObject({ code: 'CASE_EVIDENCE_FORBIDDEN' });
  });

  it('200 — lista evidências sem storageKey', async () => {
    const res = await request(app.getHttpServer())
      .get(`/cases/${caseId}/evidences`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item).not.toHaveProperty('storageKey');
      expect(item).not.toHaveProperty('privateUrl');
      expect(item).not.toHaveProperty('bucket');
    }
  });
});
