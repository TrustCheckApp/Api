import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('arquitetura canônica da API', () => {
  it('usa src/modules/* como composição canônica no AppModule', () => {
    const appModule = read('src/app.module.ts');

    expect(appModule).toContain("./modules/auth/consumer-auth.module");
    expect(appModule).toContain("./modules/auth/company/company-auth.module");
    expect(appModule).toContain("./modules/cases/cases.module");
    expect(appModule).toContain("./modules/legal-terms/legal-terms.module");

    expect(appModule).not.toContain("from './auth/auth.module'");
    expect(appModule).not.toContain("from './casos/casos.module'");
    expect(appModule).not.toContain("from './auditoria/auditoria.module'");
    expect(appModule).not.toContain('AuthModule,');
    expect(appModule).not.toContain('CasosModule,');
    expect(appModule).not.toContain('AuditoriaModule,');
  });
});

describe('autorização por perfil nos controllers canônicos', () => {
  it('protege endpoints sensíveis de casos com JWT e RolesGuard', () => {
    const controller = read('src/modules/cases/cases.controller.ts');

    expect(controller).toContain('@UseGuards(JwtGuard, RolesGuard)');
    expect(controller).toContain("@Roles('consumer')");
    expect(controller).toContain("@Roles('admin')");
    expect(controller).toContain("@Roles('company')");
    expect(controller).toContain("@Roles('admin', 'consumer')");
    expect(controller).toContain('@UseGuards(InternalGuard)');
  });

  it('protege evidências com JWT, RolesGuard e papéis mínimos por operação', () => {
    const controller = read('src/modules/cases/evidences/case-evidences.controller.ts');

    expect(controller).toContain('@UseGuards(JwtGuard, RolesGuard)');
    expect(controller).toContain("@Roles('consumer', 'company')");
    expect(controller).toContain("@Roles('consumer', 'company', 'admin')");
    expect(controller).not.toContain('storageKey');
  });
});
