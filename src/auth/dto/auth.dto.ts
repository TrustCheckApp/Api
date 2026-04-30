import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Perfil } from '@prisma/client';
import { IsCnpj, normalizarCnpj } from '../../common/validators/cnpj.validator';

export class CadastroConsumidorDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'MinhaSenh@123' })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' })
  senha: string;

  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  nome: string;

  @ApiPropertyOptional({ example: '+5511999990000' })
  @IsOptional()
  @IsString()
  telefone?: string;
}

export class CadastroEmpresaDto {
  @ApiProperty({ example: 'empresa@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'MinhaSenh@123' })
  @IsString()
  @MinLength(8, { message: 'Senha deve ter ao menos 8 caracteres' })
  senha: string;

  @ApiProperty({ example: 'Acme S.A.' })
  @IsString()
  nome: string;

  @ApiProperty({ example: '12.345.678/0001-99' })
  @IsCnpj({ message: 'CNPJ inválido — verifique o número e os dígitos verificadores' })
  @Transform(({ value }) => normalizarCnpj(value))
  cnpj: string;

  @ApiProperty({ example: 'Acme Comércio' })
  @IsString()
  razaoSocial: string;

  @ApiPropertyOptional({ example: 'Acme' })
  @IsOptional()
  @IsString()
  nomeFantasia?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: 'MinhaSenh@123' })
  @IsString()
  senha: string;
}

export class ValidarOtpDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  codigo: string;
}

export class SolicitarOtpDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;
}

export class Validar2FaDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  codigo: string;
}

export class ReivindicarEmpresaDto {
  @ApiProperty({ example: '12.345.678/0001-99' })
  @IsCnpj({ message: 'CNPJ inválido — verifique o número e os dígitos verificadores' })
  @Transform(({ value }) => normalizarCnpj(value))
  cnpj: string;

  @ApiProperty({ example: 'Documento comprobatório de representação' })
  @IsString()
  justificativa: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}
