import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { JwtModule } from '@nestjs/jwt';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { CasesRepository } from './cases.repository';
import { CaseStateMachineService } from './state-machine/case-state-machine.service';
import { LegalTermsModule } from '../legal-terms/legal-terms.module';
import { CaseEvidencesController } from './evidences/case-evidences.controller';
import { CaseEvidencesService } from './evidences/case-evidences.service';
import { CaseEvidencesRepository } from './evidences/case-evidences.repository';

@Module({
  imports: [EventEmitterModule.forRoot(), LegalTermsModule, JwtModule.register({})],
  controllers: [CasesController, CaseEvidencesController],
  providers: [
    CasesService,
    CasesRepository,
    CaseStateMachineService,
    CaseEvidencesService,
    CaseEvidencesRepository,
  ],
  exports: [
    CasesService,
    CasesRepository,
    CaseStateMachineService,
    CaseEvidencesService,
    CaseEvidencesRepository,
  ],
})
export class CasesModule {}
