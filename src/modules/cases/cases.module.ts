import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { CasesRepository } from './cases.repository';
import { CaseStateMachineService } from './state-machine/case-state-machine.service';
import { LegalTermsModule } from '../legal-terms/legal-terms.module';

@Module({
  imports: [EventEmitterModule.forRoot(), LegalTermsModule],
  controllers: [CasesController],
  providers: [CasesService, CasesRepository, CaseStateMachineService],
  exports: [CasesService, CasesRepository, CaseStateMachineService],
})
export class CasesModule {}
