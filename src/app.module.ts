import { Module, Controller, Get } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { CasosModule } from './casos/casos.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { ConsumerAuthModule } from './modules/auth/consumer-auth.module';
import { CompanyAuthModule } from './modules/auth/company/company-auth.module';
import { AuditModule } from './common/audit/audit.module';
import { CasesModule as CasesModuleV2 } from './modules/cases/cases.module';
import { LegalTermsModule } from './modules/legal-terms/legal-terms.module';
import { EventsModule } from './common/events/events.module';
import { TestHelperModule } from './common/test-helpers/test-helper.module';

@Controller('health')
class HealthController {
  @Get()
  health() { return { status: 'ok' }; }
}

@Module({ controllers: [HealthController] })
class HealthModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    EventsModule,
    PrismaModule,
    RedisModule,
    AuditoriaModule,
    AuthModule,
    CasosModule,
    ConsumerAuthModule,
    CompanyAuthModule,
    AuditModule,
    CasesModuleV2,
    LegalTermsModule,
    HealthModule,
    ...(process.env.NODE_ENV === 'test' ? [TestHelperModule] : []),
  ],
})
export class AppModule {}
