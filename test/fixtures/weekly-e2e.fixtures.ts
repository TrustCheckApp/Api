export const weeklyE2eFixtures = {
  consumer: {
    emailPrefix: 'weekly-consumer',
    password: 'Consumidor@123',
    fullName: 'Consumidor Sintetico QA',
    lgpdAccepted: true,
    lgpdVersion: 'sprint-03-weekly',
  },
  companyClaim: {
    cnpjSamples: [
      '33.000.167/0001-01',
      '07.526.557/0001-00',
      '48.282.795/0001-40',
    ],
    legalName: 'Empresa Sintetica QA LTDA',
    tradeName: 'Empresa QA',
    emailPrefix: 'weekly-company-claim',
    password: 'EmpresaQA@123',
    fullName: 'Representante Sintetico QA',
    lgpdAccepted: true,
    lgpdVersion: 'sprint-03-weekly',
    documents: [
      {
        url: 'https://storage.trustcheck.test/e2e/claim-document.pdf',
        fileName: 'claim-document.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 204800,
      },
    ],
  },
  casePayload: {
    experienceType: 'reclamacao',
    category: 'ecommerce',
    description: 'Produto sintetico entregue com avaria relevante. Empresa sintetica nao respondeu aos chamados de suporte do consumidor dentro do prazo informado.',
    occurredAt: '2026-04-10',
  },
  legalTerm: {
    kind: 'denuncia',
    content: 'Termo sintetico de aceite legal para suite semanal E2E da Sprint 03, sem dados pessoais reais.',
  },
};

export const weeklyE2eExpectedCoverage = [
  'cadastro consumidor',
  'login/autenticacao',
  'aceite de termo legal',
  'empresa/claim',
  'criar caso',
  'transicoes oficiais de caso',
  'cenarios de erro por fluxo critico',
] as const;
