import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCaseEvidenceDto {
  @IsString()
  @MaxLength(180)
  @Matches(/^[^\\/<>:"|?*\u0000-\u001F]+$/, {
    message: 'Nome de arquivo inválido.',
  })
  fileName: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;

  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'checksumSha256 deve conter 64 caracteres hexadecimais.',
  })
  checksumSha256?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
