import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';

export class RequestCaseEvidenceUploadDto {
  @IsString()
  @MaxLength(180)
  @Matches(/^[^\\/<>:"|?*\u0000-\u001F]+$/, {
    message: 'Nome de arquivo invalido.',
  })
  fileName: string;

  @IsString()
  @MaxLength(120)
  mimeType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;
}
