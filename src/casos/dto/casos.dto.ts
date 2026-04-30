import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusCaso } from '@prisma/client';

// ─── STEP 1: Identificar empresa ─────────────────────────────────────────────

export class CasoStep1Dto {
  @ApiProperty({ description: 'ID da empresa alvo da denúncia' })
  @IsUUID()
  empresaId: string;
}

// ─── STEP 2: Registrar ocorrido ───────────────────────────────────────────────

export class CasoStep2Dto {
  @ApiProperty({ example: 'PRODUTO_DEFEITUOSO' })
  @IsString()
  tipoExperiencia: string;

  @ApiProperty({ example: 'Recebi produto com defeito e a empresa se recusou a trocar.' })
  @IsString()
  @MinLength(30, { message: 'Descrição deve ter ao menos 30 caracteres' })
  @MaxLength(5000, { message: 'Descrição não pode ultrapassar 5000 caracteres' })
  descricao: string;

  @ApiPropertyOptional({ example: 'Produto com defeito na embalagem' })
  @IsOptional()
  @IsString()
  titulo?: string;
}

// ─── STEP 3: Evidências (metadados — upload via MIDIA module) ─────────────────

export class EvidenciaDto {
  @ApiProperty({ example: 'imagem' })
  @IsEnum(['imagem', 'video', 'audio', 'documento'])
  tipo: string;

  @ApiProperty({ example: 'https://s3.bucket/evidencia.jpg' })
  @IsString()
  url: string;

  @ApiProperty({ example: 2048000 })
  tamanho: number;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType: string;
}

export class CasoStep3Dto {
  @ApiPropertyOptional({ type: [EvidenciaDto] })
  @IsOptional()
  evidencias?: EvidenciaDto[];
}

// ─── STEP 4: Questionário + Aceite do Termo Legal ────────────────────────────

export class CasoStep4Dto {
  @ApiProperty({ description: 'Respostas do questionário estruturado', example: { tentouResolver: true, canaisUsados: ['telefone', 'email'] } })
  @IsObject()
  respostas: Record<string, unknown>;

  @ApiProperty({ description: 'Indica que o consumidor aceitou o termo legal' })
  @IsBoolean()
  termoAceito: boolean;
}

// ─── MODERAÇÃO ───────────────────────────────────────────────────────────────

export class ModerarCasoDto {
  @ApiProperty({ enum: ['PUBLICADO', 'NAO_RESOLVIDO'], description: 'Decisão do moderador' })
  @IsEnum(['PUBLICADO', 'NAO_RESOLVIDO'])
  decisao: 'PUBLICADO' | 'NAO_RESOLVIDO';

  @ApiPropertyOptional({ example: 'Conteúdo inadequado detectado' })
  @IsOptional()
  @IsString()
  observacao?: string;
}

// ─── AVANÇO DE STATUS (admin/moderador) ──────────────────────────────────────

export class AlterarStatusDto {
  @ApiProperty({ enum: StatusCaso })
  @IsEnum(StatusCaso)
  novoStatus: StatusCaso;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  observacao?: string;
}

// ─── FILTROS DE LISTAGEM ─────────────────────────────────────────────────────

export class FiltrosCasosDto {
  @ApiPropertyOptional({ enum: StatusCaso })
  @IsOptional()
  @IsEnum(StatusCaso)
  status?: StatusCaso;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  empresaId?: string;
}
