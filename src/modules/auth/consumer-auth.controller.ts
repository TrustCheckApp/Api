import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { ConsumerAuthService } from './consumer-auth.service';
import {
  RegisterConsumerDto,
  RegisterConfirmDto,
  ConsumerLoginDto,
  SsoAuthDto,
} from './dto/register-consumer.dto';
import { SsoProvider } from '@prisma/client';

@ApiTags('auth-consumer')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
@Controller('auth')
export class ConsumerAuthController {
  constructor(private readonly authService: ConsumerAuthService) {}

  @Post('consumer/register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastro de consumidor com e-mail e OTP (M03 — HU-AUTH-02)' })
  @ApiBody({ type: RegisterConsumerDto })
  @ApiResponse({ status: 201, description: 'Cadastro iniciado — OTP enviado ao e-mail' })
  @ApiResponse({ status: 409, description: 'E-mail já cadastrado (EMAIL_ALREADY_REGISTERED)' })
  @ApiResponse({ status: 422, description: 'LGPD não aceita (LGPD_NOT_ACCEPTED)' })
  async register(@Body() dto: RegisterConsumerDto) {
    return this.authService.register(dto);
  }

  @Post('consumer/register/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar cadastro com código OTP (HU-AUTH-02)' })
  @ApiBody({ type: RegisterConfirmDto })
  @ApiResponse({ status: 200, description: 'Conta ativada — tokens emitidos' })
  @ApiResponse({ status: 400, description: 'OTP inválido/expirado/tentativas excedidas' })
  @ApiResponse({ status: 401, description: 'Token de registro inválido' })
  async confirm(@Body() dto: RegisterConfirmDto, @Req() req: Request) {
    const meta = this._extractMeta(req);
    return this.authService.confirm(dto, meta);
  }

  @Post('consumer/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login do consumidor com e-mail e senha (M04)' })
  @ApiBody({ type: ConsumerLoginDto })
  @ApiResponse({ status: 200, description: 'Autenticado com sucesso â€” tokens emitidos' })
  @ApiResponse({ status: 401, description: 'Credenciais invÃ¡lidas ou conta inativa' })
  async login(@Body() dto: ConsumerLoginDto, @Req() req: Request) {
    const meta = this._extractMeta(req);
    return this.authService.loginWithPassword(dto.email, dto.password, meta);
  }

  @Post('sso/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login / cadastro via SSO Google (M03, M04 — HU-AUTH-06)' })
  @ApiBody({ type: SsoAuthDto })
  @ApiResponse({ status: 200, description: 'Autenticado via Google — tokens emitidos' })
  @ApiResponse({ status: 422, description: 'LGPD não aceita' })
  async ssoGoogle(@Body() dto: SsoAuthDto, @Req() req: Request) {
    const meta = this._extractMeta(req);
    return this.authService.ssoAuth(SsoProvider.google, dto, meta);
  }

  @Post('sso/apple')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login / cadastro via SSO Apple (M03, M04 — HU-AUTH-06)' })
  @ApiBody({ type: SsoAuthDto })
  @ApiResponse({ status: 200, description: 'Autenticado via Apple — tokens emitidos' })
  @ApiResponse({ status: 422, description: 'LGPD não aceita' })
  async ssoApple(@Body() dto: SsoAuthDto, @Req() req: Request) {
    const meta = this._extractMeta(req);
    return this.authService.ssoAuth(SsoProvider.apple, dto, meta);
  }

  private _extractMeta(req: Request): { ip?: string; userAgent?: string } {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress;
    return { ip, userAgent: req.headers['user-agent'] };
  }
}
