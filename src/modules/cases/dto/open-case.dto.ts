import {
  IsEnum,
  IsString,
  MinLength,
  MaxLength,
  IsUUID,
  IsOptional,
  IsDateString,
  IsNumber,
  IsNotEmpty,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CaseCategory, ExperienceType } from '@prisma/client';

export class LegalAcceptanceEmbeddedDto {
  @IsString()
  @IsNotEmpty()
  termId: string;

  @IsString()
  @IsNotEmpty()
  contentHashEcho: string;
}

export class OpenCaseDto {
  @IsUUID('4', { message: 'companyId deve ser um UUID v4 válido' })
  companyId: string;

  @IsEnum(ExperienceType, {
    message: `experienceType deve ser um dos valores: ${Object.values(ExperienceType).join(', ')}`,
  })
  experienceType: ExperienceType;

  @IsEnum(CaseCategory, {
    message: `category deve ser um dos valores: ${Object.values(CaseCategory).join(', ')}`,
  })
  category: CaseCategory;

  @IsString()
  @MinLength(50, { message: 'Descrição deve ter no mínimo 50 caracteres' })
  @MaxLength(4000, { message: 'Descrição deve ter no máximo 4000 caracteres' })
  description: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'monetaryValue deve ser um número com até 2 casas decimais' })
  @Min(0)
  @Max(99999999999.99)
  @Type(() => Number)
  monetaryValue?: number;

  @IsDateString({}, { message: 'occurredAt deve ser uma data válida no formato ISO 8601 (YYYY-MM-DD)' })
  occurredAt: string;

  @ValidateNested()
  @Type(() => LegalAcceptanceEmbeddedDto)
  legalAcceptance: LegalAcceptanceEmbeddedDto;
}
