import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsNotEmpty,
  Matches,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsInt,
  Min,
  IsUrl,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { isValidCnpj, normalizeCnpj } from '../utils/cnpj.util';
import { registerDecorator, ValidationOptions } from 'class-validator';

function IsCnpjValid(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCnpjValid',
      target: object.constructor,
      propertyName,
      options: { message: 'CNPJ inválido — verifique o número e os dígitos verificadores', ...options },
      validator: { validate: (v: string) => isValidCnpj(v) },
    });
  };
}

export class DocumentMetaDto {
  @IsUrl({}, { message: 'URL do documento inválida' })
  url: string;

  @IsString()
  @IsNotEmpty()
  fileName: string;

  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;
}

export class RegisterCompanyDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(10, { message: 'Senha deve ter no mínimo 10 caracteres' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/, {
    message: 'Senha deve conter ao menos 1 maiúscula, 1 número e 1 caractere especial',
  })
  password: string;

  @IsString()
  @IsNotEmpty()
  @IsCnpjValid()
  @Transform(({ value }) => normalizeCnpj(value as string))
  cnpj: string;

  @IsString()
  @IsNotEmpty({ message: 'Razão social é obrigatória' })
  legalName: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsString()
  @IsNotEmpty({ message: 'Nome completo do responsável é obrigatório' })
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsBoolean({ message: 'lgpdAccepted deve ser true' })
  lgpdAccepted: boolean;

  @IsString()
  @IsNotEmpty({ message: 'lgpdVersion é obrigatório' })
  lgpdVersion: string;
}

export class ClaimCompanyDto {
  @IsString()
  @IsNotEmpty()
  @IsCnpjValid()
  @Transform(({ value }) => normalizeCnpj(value as string))
  cnpj: string;

  @IsString()
  @IsNotEmpty()
  legalName: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @Transform(({ value }) => (value as string).toLowerCase().trim())
  email: string;

  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{10,}$/, {
    message: 'Senha deve conter ao menos 1 maiúscula, 1 número e 1 caractere especial',
  })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Pelo menos 1 documento comprobatório é obrigatório' })
  @ValidateNested({ each: true })
  @Type(() => DocumentMetaDto)
  documents: DocumentMetaDto[];

  @IsBoolean({ message: 'lgpdAccepted deve ser true' })
  lgpdAccepted: boolean;

  @IsString()
  @IsNotEmpty()
  lgpdVersion: string;
}
