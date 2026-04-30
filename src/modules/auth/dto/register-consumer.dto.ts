import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterConsumerDto {
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
  @IsNotEmpty({ message: 'Nome completo é obrigatório' })
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

export class RegisterConfirmDto {
  @IsString()
  @IsNotEmpty()
  registrationToken: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP deve conter exatamente 6 dígitos numéricos' })
  otp: string;
}

export class SsoAuthDto {
  @IsString()
  @IsNotEmpty({ message: 'idToken é obrigatório' })
  idToken: string;

  @IsBoolean({ message: 'lgpdAccepted deve ser true' })
  lgpdAccepted: boolean;

  @IsString()
  @IsNotEmpty({ message: 'lgpdVersion é obrigatório' })
  lgpdVersion: string;
}
