import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class RejectCaseDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class CloseUnresolvedDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class ResolveCaseDto {
  @IsBoolean()
  consumerConfirmed: boolean;

  @IsBoolean()
  companyConfirmed: boolean;
}
