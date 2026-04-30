/**
 * Seed de desenvolvimento — TC1-API-05
 * 2 consumidores, 2 empresas, 3 casos em estados diferentes.
 * Executar: npx prisma db seed
 */

import { PrismaClient, UserRole, UserStatus, CompanyStatus, CaseStatus, ExperienceType, CaseCategory } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Iniciando seed de desenvolvimento…');

  // ─── Consumidores ─────────────────────────────────────────────────────────

  const hash = await bcrypt.hash('Senha@Dev123', 12);

  const consumer1 = await prisma.user.upsert({
    where: { email: 'consumidor1@seed.dev' },
    update: {},
    create: {
      email: 'consumidor1@seed.dev',
      passwordHash: hash,
      role: UserRole.consumer,
      status: UserStatus.active,
      consumerProfile: {
        create: {
          fullName: 'Ana Silva (seed)',
          phone: '+5511999990001',
          acceptedLgpdAt: new Date(),
          acceptedLgpdVersion: '1.0',
        },
      },
    },
  });

  const consumer2 = await prisma.user.upsert({
    where: { email: 'consumidor2@seed.dev' },
    update: {},
    create: {
      email: 'consumidor2@seed.dev',
      passwordHash: hash,
      role: UserRole.consumer,
      status: UserStatus.active,
      consumerProfile: {
        create: {
          fullName: 'Bruno Costa (seed)',
          phone: '+5511999990002',
          acceptedLgpdAt: new Date(),
          acceptedLgpdVersion: '1.0',
        },
      },
    },
  });

  // ─── Empresas ─────────────────────────────────────────────────────────────

  const company1 = await prisma.company.upsert({
    where: { cnpj: '11222333000181' },
    update: {},
    create: {
      cnpj: '11222333000181',
      legalName: 'Acme Tecnologia LTDA (seed)',
      tradeName: 'Acme Tech',
      status: CompanyStatus.active,
    },
  });

  const company2 = await prisma.company.upsert({
    where: { cnpj: '60746948000112' },
    update: {},
    create: {
      cnpj: '60746948000112',
      legalName: 'Banco Digital S.A. (seed)',
      tradeName: 'BankDigital',
      status: CompanyStatus.active,
    },
  });

  // ─── Casos ────────────────────────────────────────────────────────────────

  const caso1 = await prisma.case.create({
    data: {
      consumerUserId: consumer1.id,
      companyId: company1.id,
      experienceType: ExperienceType.reclamacao,
      category: CaseCategory.ecommerce,
      description: 'Produto entregue com defeito após 15 dias de espera. A empresa não respondeu ao chamado de suporte e ignorou os prazos do CDC.',
      monetaryValue: 349.90,
      occurredAt: new Date('2026-04-10'),
      status: CaseStatus.ENVIADO,
    },
  });

  const caso2 = await prisma.case.create({
    data: {
      consumerUserId: consumer2.id,
      companyId: company1.id,
      experienceType: ExperienceType.denuncia,
      category: CaseCategory.financeiro,
      description: 'Cobrança indevida realizada após cancelamento do serviço devidamente confirmado. Valor debitado sem autorização por três meses consecutivos.',
      monetaryValue: 89.70,
      occurredAt: new Date('2026-03-01'),
      status: CaseStatus.EM_MODERACAO,
    },
  });

  const caso3 = await prisma.case.create({
    data: {
      consumerUserId: consumer1.id,
      companyId: company2.id,
      experienceType: ExperienceType.reclamacao,
      category: CaseCategory.servicos,
      description: 'Serviço de atendimento ao cliente não resolveu problema de conta bloqueada indevidamente por mais de 30 dias, causando prejuízo financeiro comprovado.',
      monetaryValue: 1200.00,
      occurredAt: new Date('2026-02-20'),
      status: CaseStatus.PUBLICADO,
      publishedAt: new Date('2026-02-22T10:00:00Z'),
    },
  });

  console.log('✅  Seed concluído:');
  console.log(`   • Consumidores: ${consumer1.email}, ${consumer2.email}`);
  console.log(`   • Empresas: ${company1.legalName}, ${company2.legalName}`);
  console.log(`   • Casos: ${caso1.publicId ?? caso1.id} (ENVIADO)`);
  console.log(`           ${caso2.publicId ?? caso2.id} (EM_MODERACAO)`);
  console.log(`           ${caso3.publicId ?? caso3.id} (PUBLICADO)`);
}

main()
  .catch((e) => {
    console.error('❌  Seed falhou:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
