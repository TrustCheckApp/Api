import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CompanyAuthController } from './company-auth.controller';
import { CompanyAuthService } from './company-auth.service';
import { OtpService } from '../otp.service';
import { LogOtpProvider } from '../providers/log-otp.provider';
import { OTP_PROVIDER_TOKEN } from '../providers/otp-provider.interface';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '1d') },
      }),
    }),
  ],
  controllers: [CompanyAuthController],
  providers: [
    CompanyAuthService,
    OtpService,
    LogOtpProvider,
    { provide: OTP_PROVIDER_TOKEN, useClass: LogOtpProvider },
  ],
  exports: [CompanyAuthService],
})
export class CompanyAuthModule {}
