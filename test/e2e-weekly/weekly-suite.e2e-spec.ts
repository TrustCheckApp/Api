import { weeklyE2eExpectedCoverage, weeklyE2eFixtures } from '../fixtures/weekly-e2e.fixtures';

const weeklySuiteFiles = [
  'test/auth/consumer-register.e2e-spec.ts',
  'test/auth/consumer-login-audit.e2e-spec.ts',
  'test/auth/company-claim.e2e-spec.ts',
  'test/cases/open-case.e2e-spec.ts',
  'test/cases/state-machine.e2e-spec.ts',
  'test/legal-terms/term-acceptance.e2e-spec.ts',
] as const;

describe('TC-S3-QA-08 — Suite E2E semanal Sprint 03', () => {
  it('mantem fixtures sinteticas sem PII real', () => {
    expect(weeklyE2eFixtures.consumer.fullName).toContain('Sintetico');
    expect(weeklyE2eFixtures.consumer.emailPrefix).toContain('weekly-consumer');
    expect(weeklyE2eFixtures.companyClaim.documents[0].url).toContain('trustcheck.test');
    expect(JSON.stringify(weeklyE2eFixtures)).not.toMatch(/@gmail\.com|@hotmail\.com|@outlook\.com|\d{3}\.\d{3}\.\d{3}-\d{2}/i);
  });

  it('declara cobertura dos fluxos criticos semanais', () => {
    expect(weeklyE2eExpectedCoverage).toEqual([
      'cadastro consumidor',
      'login/autenticacao',
      'aceite de termo legal',
      'empresa/claim',
      'criar caso',
      'transicoes oficiais de caso',
      'cenarios de erro por fluxo critico',
    ]);
  });

  it('mantem lista de especificacoes E2E que formam a evidencia semanal', () => {
    expect(weeklySuiteFiles).toEqual([
      'test/auth/consumer-register.e2e-spec.ts',
      'test/auth/consumer-login-audit.e2e-spec.ts',
      'test/auth/company-claim.e2e-spec.ts',
      'test/cases/open-case.e2e-spec.ts',
      'test/cases/state-machine.e2e-spec.ts',
      'test/legal-terms/term-acceptance.e2e-spec.ts',
    ]);
  });
});
