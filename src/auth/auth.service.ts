import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Perfil } from '@prisma/client';
import { OTP_PROVIDER } from '../otp/otp.module';
import { OtpProvider } from '../otp/otp-provider.interface';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import * as crypto from 'crypto';
import * as OTPLib from 'otplib';
import * as QRCode from 'qrcode';
import dayjs from 'dayjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import {
  CadastroConsumidorDto,
  CadastroEmpresaDto,
  LoginDto,
  ValidarOtpDto,
  SolicitarOtpDto,
  Validar2FaDto,
  ReivindicarEmpresaDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
    private readonly auditoria: AuditoriaService,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
  ) {}

  // ─── CADASTRO CONSUMIDOR ──────────────────────────────────────────────────

  async cadastrarConsumidor(dto: CadastroConsumidorDto, ip: string): Promise<{ mensagem: string }> {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) {
      throw new ConflictException('E-mail já cadastrado');
    }

    const senhaHash = await bcrypt.hash(dto.senha, 12);
    const usuario = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        senhaHash,
        nome: dto.nome,
        telefone: dto.telefone ?? null,
        perfil: Perfil.CONSUMIDOR,
      },
    });

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      tipo: 'AUTH_CONTA_CRIADA',
      detalhe: { perfil: Perfil.CONSUMIDOR },
      ip,
    });

    await this._enviarOtpEmail(usuario.email, usuario.id);

    return { mensagem: 'Cadastro realizado. Verifique seu e-mail para ativar a conta.' };
  }

  // ─── CADASTRO EMPRESA ─────────────────────────────────────────────────────

  async cadastrarEmpresa(dto: CadastroEmpresaDto, ip: string): Promise<{ mensagem: string }> {
    const existente = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (existente) throw new ConflictException('E-mail já cadastrado');

    const empresaExistente = await this.prisma.empresa.findUnique({ where: { cnpj: dto.cnpj } });
    if (empresaExistente) throw new ConflictException('CNPJ já cadastrado');

    const senhaHash = await bcrypt.hash(dto.senha, 12);
    const usuario = await this.prisma.usuario.create({
      data: {
        email: dto.email,
        senhaHash,
        nome: dto.nome,
        perfil: Perfil.EMPRESA,
      },
    });

    await this.prisma.empresa.create({
      data: {
        usuarioId: usuario.id,
        cnpj: dto.cnpj,
        razaoSocial: dto.razaoSocial,
        nomeFantasia: dto.nomeFantasia ?? null,
      },
    });

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      tipo: 'AUTH_CONTA_CRIADA',
      detalhe: { perfil: Perfil.EMPRESA, cnpj: dto.cnpj },
      ip,
    });

    await this._enviarOtpEmail(usuario.email, usuario.id);

    return { mensagem: 'Cadastro empresarial realizado. Verifique seu e-mail.' };
  }

  // ─── LOGIN EMAIL + SENHA ──────────────────────────────────────────────────

  async login(dto: LoginDto, ip: string, userAgent: string): Promise<any> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario || !usuario.senhaHash) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const senhaValida = await bcrypt.compare(dto.senha, usuario.senhaHash);
    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!usuario.ativo) {
      throw new UnauthorizedException('Conta inativa. Entre em contato com o suporte.');
    }

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      tipo: 'AUTH_LOGIN',
      detalhe: { perfil: usuario.perfil },
      ip,
      userAgent,
    });

    // Empresa e Admin exigem 2FA
    if ((usuario.perfil === Perfil.EMPRESA || usuario.perfil === Perfil.ADMIN) && usuario.twoFaAtivado) {
      return {
        requer2fa: true,
        mensagem: 'Informe o código 2FA para continuar.',
        tokenTemporario: await this._gerarTokenTemporario(usuario.id),
      };
    }

    return this._gerarTokens(usuario, ip, userAgent);
  }

  // ─── SOLICITAR OTP (reenvio) ──────────────────────────────────────────────

  async solicitarOtp(dto: SolicitarOtpDto, ip: string): Promise<{ mensagem: string }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario) {
      // Resposta genérica para não expor existência de contas
      return { mensagem: 'Se o e-mail estiver cadastrado, você receberá um código.' };
    }

    await this._enviarOtpEmail(usuario.email, usuario.id);

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      tipo: 'AUTH_OTP_ENVIADO',
      ip,
    });

    return { mensagem: 'Se o e-mail estiver cadastrado, você receberá um código.' };
  }

  // ─── VALIDAR OTP ─────────────────────────────────────────────────────────

  async validarOtp(dto: ValidarOtpDto, ip: string, userAgent: string): Promise<any> {
    const chaveRedis = `otp:${dto.email}`;
    const codigoArmazenado = await this.redis.get(chaveRedis);

    if (!codigoArmazenado || codigoArmazenado !== dto.codigo) {
      throw new UnauthorizedException('Código OTP inválido ou expirado');
    }

    await this.redis.del(chaveRedis);

    const usuario = await this.prisma.usuario.findUnique({ where: { email: dto.email } });
    if (!usuario) throw new UnauthorizedException('Usuário não encontrado');

    if (!usuario.emailVerificado) {
      await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { emailVerificado: true },
      });
    }

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      tipo: 'AUTH_OTP_VALIDADO',
      ip,
      userAgent,
    });

    return this._gerarTokens(usuario, ip, userAgent);
  }

  // ─── ATIVAR 2FA ──────────────────────────────────────────────────────────

  async ativar2fa(usuarioId: string, ip: string): Promise<{ qrCodeUrl: string; segredo: string }> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) throw new UnauthorizedException('Usuário não encontrado');

    const segredo = OTPLib.authenticator.generateSecret();
    const otpAuthUrl = OTPLib.authenticator.keyuri(usuario.email, 'TrustCheck', segredo);
    const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);

    await this.prisma.usuario.update({
      where: { id: usuarioId },
      data: { twoFaSegredo: segredo },
    });

    await this.auditoria.registrar({
      usuarioId,
      tipo: 'AUTH_2FA_ATIVADO',
      ip,
    });

    return { qrCodeUrl, segredo };
  }

  // ─── CONFIRMAR / VALIDAR 2FA ─────────────────────────────────────────────

  async confirmar2fa(usuarioId: string, dto: Validar2FaDto, ip: string, userAgent: string): Promise<any> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario || !usuario.twoFaSegredo) {
      throw new BadRequestException('2FA não configurado para este usuário');
    }

    const valido = OTPLib.authenticator.verify({ token: dto.codigo, secret: usuario.twoFaSegredo });
    if (!valido) throw new UnauthorizedException('Código 2FA inválido');

    if (!usuario.twoFaAtivado) {
      await this.prisma.usuario.update({
        where: { id: usuarioId },
        data: { twoFaAtivado: true },
      });
    }

    await this.auditoria.registrar({
      usuarioId,
      tipo: 'AUTH_2FA_VALIDADO',
      ip,
      userAgent,
    });

    return this._gerarTokens(usuario, ip, userAgent);
  }

  // ─── REIVINDICAR PERFIL EMPRESARIAL ──────────────────────────────────────

  async reivindicarEmpresa(usuarioId: string, dto: ReivindicarEmpresaDto, ip: string): Promise<{ mensagem: string }> {
    const empresa = await this.prisma.empresa.findUnique({ where: { cnpj: dto.cnpj } });
    if (!empresa) throw new BadRequestException('Empresa não encontrada com este CNPJ');

    await this.auditoria.registrar({
      usuarioId,
      tipo: 'ADMIN_ACAO',
      detalhe: { acao: 'REIVINDICACAO_EMPRESA', cnpj: dto.cnpj, justificativa: dto.justificativa },
      ip,
    });

    return { mensagem: 'Solicitação de reivindicação registrada. Aguarde análise do administrador.' };
  }

  // ─── REFRESH TOKEN ───────────────────────────────────────────────────────

  async renovarTokens(refreshTokenRaw: string, ip: string, userAgent: string): Promise<any> {
    const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');
    const token = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!token || token.revogado || dayjs().isAfter(token.expiradoEm)) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    await this.prisma.refreshToken.update({ where: { id: token.id }, data: { revogado: true } });

    const usuario = await this.prisma.usuario.findUnique({ where: { id: token.usuarioId } });
    if (!usuario || !usuario.ativo) throw new UnauthorizedException('Usuário inativo');

    return this._gerarTokens(usuario, ip, userAgent);
  }

  // ─── LOGOUT ──────────────────────────────────────────────────────────────

  async logout(usuarioId: string, ip: string): Promise<{ mensagem: string }> {
    await this.prisma.refreshToken.updateMany({
      where: { usuarioId, revogado: false },
      data: { revogado: true },
    });

    await this.auditoria.registrar({ usuarioId, tipo: 'AUTH_LOGOUT', ip });

    return { mensagem: 'Sessão encerrada com sucesso.' };
  }

  // ─── GOOGLE SSO ──────────────────────────────────────────────────────────

  async loginOuCriarViaGoogle(perfil: { email: string; nome: string; googleId: string }, ip: string, userAgent: string): Promise<any> {
    let usuario = await this.prisma.usuario.findFirst({
      where: { OR: [{ googleId: perfil.googleId }, { email: perfil.email }] },
    });

    if (!usuario) {
      usuario = await this.prisma.usuario.create({
        data: {
          email: perfil.email,
          nome: perfil.nome,
          googleId: perfil.googleId,
          perfil: Perfil.CONSUMIDOR,
          emailVerificado: true,
        },
      });
    } else if (!usuario.googleId) {
      usuario = await this.prisma.usuario.update({
        where: { id: usuario.id },
        data: { googleId: perfil.googleId, emailVerificado: true },
      });
    }

    await this.auditoria.registrar({
      usuarioId: usuario.id,
      tipo: 'AUTH_SSO_LOGIN',
      detalhe: { provedor: 'google' },
      ip,
      userAgent,
    });

    return this._gerarTokens(usuario, ip, userAgent);
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────────────────────

  private async _enviarOtpEmail(email: string, usuarioId: string): Promise<void> {
    const comprimento = this.config.get<number>('OTP_LENGTH', 6);
    const ttl = this.config.get<number>('OTP_EXPIRATION_SECONDS', 300);

    const codigo = Array.from({ length: comprimento }, () => Math.floor(Math.random() * 10)).join('');
    const chaveRedis = `otp:${email}`;

    await this.redis.set(chaveRedis, codigo, ttl);

    await this.prisma.otpToken.create({
      data: {
        usuarioId,
        email,
        codigo,
        expiradoEm: dayjs().add(ttl, 'second').toDate(),
      },
    });

    await this.otpProvider.enviar({ destinatario: email, codigo, canal: 'email' });
  }

  private async _gerarTokenTemporario(usuarioId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: usuarioId, temp: true },
      { expiresIn: '5m', secret: this.config.get<string>('JWT_SECRET') },
    );
  }

  private async _gerarTokens(usuario: any, ip: string, userAgent: string): Promise<any> {
    const payload = { sub: usuario.id, email: usuario.email, perfil: usuario.perfil };

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '1d'),
      secret: this.config.get<string>('JWT_SECRET'),
    });

    const refreshTokenRaw = uuid();
    const tokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

    await this.prisma.refreshToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiradoEm: dayjs().add(7, 'day').toDate(),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      perfil: usuario.perfil,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    };
  }
}
