import { Module } from '@nestjs/common';
import { LegalTermsController } from './legal-terms.controller';
import { LegalTermsService } from './legal-terms.service';
import { LegalTermsRepository } from './legal-terms.repository';

@Module({
  controllers: [LegalTermsController],
  providers: [LegalTermsService, LegalTermsRepository],
  exports: [LegalTermsService, LegalTermsRepository],
})
export class LegalTermsModule {}
