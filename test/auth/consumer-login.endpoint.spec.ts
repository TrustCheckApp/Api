import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { ConsumerAuthController } from '../../src/modules/auth/consumer-auth.controller';
import { ConsumerAuthService } from '../../src/modules/auth/consumer-auth.service';

describe('POST /auth/consumer/login', () => {
  let app: INestApplication;
  const loginWithPassword = jest.fn();

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ConsumerAuthController],
      providers: [
        {
          provide: ConsumerAuthService,
          useValue: {
            register: jest.fn(),
            confirm: jest.fn(),
            ssoAuth: jest.fn(),
            loginWithPassword,
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna 200 com tokens quando credenciais são válidas', async () => {
    loginWithPassword.mockResolvedValueOnce({
      accessToken: 'access.valid',
      refreshToken: 'refresh.valid',
    });

    await request(app.getHttpServer())
      .post('/auth/consumer/login')
      .send({ email: 'User@Email.com', password: 'StrongPass@123' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.accessToken).toBe('access.valid');
        expect(body.refreshToken).toBe('refresh.valid');
      });

    expect(loginWithPassword).toHaveBeenCalledWith(
      'user@email.com',
      'StrongPass@123',
      expect.objectContaining({ ip: expect.any(String) }),
    );
  });

  it('retorna 401 quando serviço rejeita credenciais inválidas', async () => {
    loginWithPassword.mockRejectedValueOnce(
      new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha invÃ¡lidos.' }),
    );

    await request(app.getHttpServer())
      .post('/auth/consumer/login')
      .send({ email: 'user@email.com', password: 'wrong' })
      .expect(401);
  });
});
