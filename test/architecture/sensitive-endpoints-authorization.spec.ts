import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('autorização de endpoints sensíveis', () => {
  it('exige autenticação e perfil empresa para reivindicação empresarial', () => {
    const controller = read('src/modules/auth/company/company-auth.controller.ts');
    const claimBlock = controller.slice(controller.indexOf("@Post('claim')"), controller.indexOf("@Post('claim/:claimId/approve')"));

    expect(claimBlock).toContain('@UseGuards(JwtGuard, RolesGuard)');
    expect(claimBlock).toContain("@Roles('company')");
    expect(claimBlock).toContain('@ApiBearerAuth()');
  });

  it('exige autenticação e perfis autorizados para consulta de detalhe de caso', () => {
    const controller = read('src/modules/cases/cases.controller.ts');
    const getCaseBlock = controller.slice(controller.indexOf("@Get(':id')"), controller.indexOf("@Get(':id/audit')"));

    expect(getCaseBlock).toContain('@ApiBearerAuth()');
    expect(getCaseBlock).toContain('@UseGuards(JwtGuard, RolesGuard)');
    expect(getCaseBlock).toContain("@Roles('admin', 'consumer', 'company')");
  });

  it('permite resolução apenas para perfis participantes ou admin e preserva dupla confirmação', () => {
    const controller = read('src/modules/cases/cases.controller.ts');
    const resolveBlock = controller.slice(controller.indexOf("@Post(':id/resolve')"), controller.indexOf("@Post(':id/close-unresolved')"));

    expect(resolveBlock).toContain('@ApiBearerAuth()');
    expect(resolveBlock).toContain('@UseGuards(JwtGuard, RolesGuard)');
    expect(resolveBlock).toContain("@Roles('admin', 'consumer', 'company')");
    expect(resolveBlock).toContain('CASE_RESOLUTION_CONFIRMATION_REQUIRED');
    expect(resolveBlock).toContain('consumerConfirmed');
    expect(resolveBlock).toContain('companyConfirmed');
  });
});
