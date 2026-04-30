import { IsString, IsNotEmpty, IsEnum, MinLength } from 'class-validator';
import { TermKind } from '@prisma/client';

export class PublishTermDto {
  @IsString()
  @IsNotEmpty()
  version: string;

  @IsEnum(TermKind, {
    message: `kind deve ser um dos valores: ${Object.values(TermKind).join(', ')}`,
  })
  kind: TermKind;

  @IsString()
  @MinLength(10, { message: 'content deve ter no mínimo 10 caracteres' })
  content: string;
}

export class LegalAcceptanceDto {
  @IsString()
  @IsNotEmpty()
  termId: string;

  @IsString()
  @IsNotEmpty()
  contentHashEcho: string;
}
