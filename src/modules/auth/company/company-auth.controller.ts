import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CompanyAuthService } from './company-auth.service';
import { RegisterCompanyDto, ClaimCompanyDto } from './dto/company-auth.dto';
import { RegisterConfirmDto } from '../dto/register-consumer.dto';
import { JwtGuard } from '../../../auth/guards/auth.guard';

@ApiTags('auth-empresa')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller('auth/company')
export class CompanyAuthController {
  constructor(private readonly companyAuthService: CompanyAuthService) {}

  private extractMeta(req: Request): { ip?: string; userAgent?: string } {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return { ip, userAgent };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastro empresarial com CNPJ (E01 — HU-AUTH-07)' })
  @ApiResponse({ status: 201, description: 'Cadastro iniciado — OTP enviado ao e-mail' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado ou CNPJ com titular ativo' })
  @ApiResponse({ status: 422, description: 'CNPJ inválido ou LGPD não aceita' })
  async register(@Body() dto: RegisterCompanyDto, @Req() req: Request) {
    const { ip, userAgent } = this.extractMeta(req);
    return this.companyAuthService.register(dto, ip, userAgent);
  }

  @Post('register/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar OTP do cadastro empresa + enrolamento TOTP (HU-AUTH-09)' })
  @ApiResponse({ status: 200, description: 'OTP válido — retorna TOTP secret, QR Code e recovery codes (one-shot)' })
  @ApiResponse({ status: 400, description: 'OTP inválido/expirado' })
  @ApiResponse({ status: 401, description: 'Token de registro inválido' })
  async confirmAndEnroll(@Body() dto: RegisterConfirmDto, @Req() req: Request) {
    const { ip, userAgent } = this.extractMeta(req);
    return this.companyAuthService.confirmAndEnrollTotp(dto.registrationToken, dto.otp, { ip, userAgent });
  }

  @Post('claim')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Reivindicação de perfil empresarial por CNPJ (E02 — HU-AUTH-08)' })
  @ApiResponse({ status: 202, description: 'Claim registrado para análise — OTP enviado' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado' })
  @ApiResponse({ status: 422, description: 'CNPJ inválido, LGPD não aceita ou sem documentos' })
  async claim(@Body() dto: ClaimCompanyDto, @Req() req: Request) {
    const { ip, userAgent } = this.extractMeta(req);
    return this.companyAuthService.claim(dto, ip, userAgent);
  }

  @Get('claim/:claimId/status')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Consultar status da reivindicação (requerente autenticado)' })
  @ApiResponse({ status: 200, description: 'Status do claim retornado' })
  @ApiResponse({ status: 404, description: 'Claim não encontrado' })
  async claimStatus(
    @Param('claimId') claimId: string,
    @Req() req: Request & { user?: { id: string } },
  ) {
    const requesterId = req.user?.id ?? '';
    return this.companyAuthService.claimStatus(claimId, requesterId);
  }
}
