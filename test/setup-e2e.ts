/**
 * Setup global para E2E tests.
 * Se CI=true, espera DATABASE_URL e REDIS_URL do ambiente.
 * Caso contrário, assume docker-compose.test.yml já em execução.
 */
export default async function setup() {
  if (process.env.CI === 'true') {
    console.log('[E2E setup] CI=true — usando DATABASE_URL e REDIS_URL do ambiente');
  } else {
    console.log('[E2E setup] Aguardando serviços do docker-compose.test.yml...');
  }
}
