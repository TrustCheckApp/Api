import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private cliente: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.cliente = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    });
  }

  async onModuleDestroy() {
    await this.cliente.quit();
  }

  async set(chave: string, valor: string, ttlSegundos?: number): Promise<void> {
    if (ttlSegundos) {
      await this.cliente.set(chave, valor, 'EX', ttlSegundos);
    } else {
      await this.cliente.set(chave, valor);
    }
  }

  async get(chave: string): Promise<string | null> {
    return this.cliente.get(chave);
  }

  async del(chave: string): Promise<void> {
    await this.cliente.del(chave);
  }

  async exists(chave: string): Promise<boolean> {
    const resultado = await this.cliente.exists(chave);
    return resultado === 1;
  }
}
