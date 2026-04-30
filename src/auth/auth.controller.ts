import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import {
  CadastroConsumidorDto,
  CadastroEmpresaDto,
  LoginDto,
  ValidarOtpDto,
  SolicitarOtpDto,
  Validar2FaDto,
  ReivindicarEmpresaDto,
  RefreshTokenDto,
} from './dto/auth.dto';
import { JwtGuard, GoogleGuard } from './guards/auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('consumidor/cadastro')
  @ApiOperation({ summary: 'Cadastro de novo consumidor (M03)' })
  async cadastrarConsumidor(@Body() dto: CadastroConsumidorDto, @Req() req: Request) {
    return this.authService.cadastrarConsumidor(dto, req.ip);
  }

  @Post('empresa/cadastro')
  @ApiOperation({ summary: 'Cadastro de nova empresa (E01)' })
  async cadastrarEmpresa(@Body() dto: CadastroEmpresaDto, @Req() req: Request) {
    return this.authService.cadastrarEmpresa(dto, req.ip);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login com e-mail + senha (M04, E03, W01)' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent'] ?? '');
  }

  @Post('otp/solicitar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar código OTP por e-mail' })
  async solicitarOtp(@Body() dto: SolicitarOtpDto, @Req() req: Request) {
    return this.authService.solicitarOtp(dto, req.ip);
  }

  @Post('otp/validar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar código OTP e obter tokens (M03)' })
  async validarOtp(@Body() dto: ValidarOtpDto, @Req() req: Request) {
    return this.authService.validarOtp(dto, req.ip, req.headers['user-agent'] ?? '');
  }

  @Get('google')
  @UseGuards(GoogleGuard)
  @ApiOperation({ summary: 'Iniciar fluxo SSO Google (M03)' })
  async googleLogin() {}

  @Get('google/callback')
  @UseGuards(GoogleGuard)
  @ApiOperation({ summary: 'Callback SSO Google' })
  async googleCallback(@Req() req: any) {
    return this.authService.loginOuCriarViaGoogle(req.user, req.ip, req.headers['user-agent'] ?? '');
  }

  @Post('2fa/ativar')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ativar 2FA — gera QR Code (E03, W01)' })
  async ativar2fa(@Req() req: any) {
    return this.authService.ativar2fa(req.user.id, req.ip);
  }

  @Post('2fa/confirmar')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirmar e validar código 2FA' })
  async confirmar2fa(@Body() dto: Validar2FaDto, @Req() req: any) {
    return this.authService.confirmar2fa(req.user.id, dto, req.ip, req.headers['user-agent'] ?? '');
  }

  @Post('empresa/reivindicar')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reivindicar perfil empresarial por CNPJ (E02)' })
  async reivindicarEmpresa(@Body() dto: ReivindicarEmpresaDto, @Req() req: any) {
    return this.authService.reivindicarEmpresa(req.user.id, dto, req.ip);
  }

  @Post('token/renovar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token via refresh token' })
  async renovarTokens(@Body() dto: RefreshTokenDto, @Req() req: Request) {
    return this.authService.renovarTokens(dto.refreshToken, req.ip, req.headers['user-agent'] ?? '');
  }

  @Post('logout')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Encerrar sessão e revogar tokens' })
  async logout(@Req() req: any) {
    return this.authService.logout(req.user.id, req.ip);
  }
}
