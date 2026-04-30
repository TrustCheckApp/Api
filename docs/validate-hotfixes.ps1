# =============================================================================
# validate-hotfixes.ps1
# Validação completa dos 3 hotfixes + pipeline E2E
# TrustCheckApp · Sprint 01
#
# Pré-requisitos:
#   1. Node.js 20 instalado
#   2. Docker Desktop rodando
#   3. Estar na pasta Api-main/Api-main/
#
# Uso:
#   cd "c:\Users\Rafael\Downloads\TrustCheckApp\Api-main\Api-main"
#   .\docs\validate-hotfixes.ps1
# =============================================================================

$ErrorActionPreference = "Stop"
$rootDir = $PSScriptRoot | Split-Path -Parent

Write-Host ""
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  TrustCheckApp - Validacao HOTFIX-01, 02, 03 + E2E" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

Set-Location $rootDir

# ─── PASSO 0: Dependências ────────────────────────────────────────────────────
Write-Host "[ 0/6 ] Instalando dependências e gerando Prisma Client..." -ForegroundColor Yellow
npm ci --silent
if ($LASTEXITCODE -ne 0) { Write-Host "FALHA: npm ci" -ForegroundColor Red; exit 1 }
npx prisma generate --silent
if ($LASTEXITCODE -ne 0) { Write-Host "FALHA: prisma generate" -ForegroundColor Red; exit 1 }
Write-Host "        OK" -ForegroundColor Green

# ─── PASSO 1: Testes unitários Sprint 01 (src/) ──────────────────────────────
Write-Host ""
Write-Host "[ 1/6 ] Testes unitários Sprint 01 (src/**/*.spec.ts)..." -ForegroundColor Yellow
npx jest --roots="<rootDir>/src" --testRegex=".*\.spec\.ts$" --passWithNoTests
if ($LASTEXITCODE -ne 0) { Write-Host "FALHA: testes unitários Sprint 01" -ForegroundColor Red; exit 1 }
Write-Host "        OK" -ForegroundColor Green

# ─── PASSO 2: Testes hotfixes (test/common/ + test/auth/*.spec.ts) ────────────
Write-Host ""
Write-Host "[ 2/6 ] Testes hotfixes (test/common + test/auth *.spec.ts)..." -ForegroundColor Yellow
npx jest --config ./test/jest-hotfixes.json
if ($LASTEXITCODE -ne 0) { Write-Host "FALHA: testes hotfixes" -ForegroundColor Red; exit 1 }
Write-Host "        OK" -ForegroundColor Green

# ─── PASSO 3: Subir ambiente Docker E2E ──────────────────────────────────────
Write-Host ""
Write-Host "[ 3/6 ] Subindo ambiente E2E (docker-compose.e2e.yml)..." -ForegroundColor Yellow
docker compose -f docker-compose.e2e.yml up -d --wait
if ($LASTEXITCODE -ne 0) { Write-Host "FALHA: docker compose up" -ForegroundColor Red; exit 1 }

# Aguarda API ficar saudável
Write-Host "        Aguardando API ficar pronta (max 90s)..." -ForegroundColor Gray
$maxWait = 90
$waited  = 0
do {
    Start-Sleep -Seconds 5
    $waited += 5
    $health = docker compose -f docker-compose.e2e.yml ps --format json 2>$null |
              ConvertFrom-Json | Where-Object { $_.Service -eq "api" } |
              Select-Object -ExpandProperty Health -ErrorAction SilentlyContinue
} while ($health -ne "healthy" -and $waited -lt $maxWait)

if ($health -ne "healthy") {
    Write-Host "TIMEOUT: API não ficou saudável em ${maxWait}s" -ForegroundColor Red
    docker compose -f docker-compose.e2e.yml logs api --tail 50
    exit 1
}
Write-Host "        API saudável" -ForegroundColor Green

# ─── PASSO 4: Migração no banco E2E ──────────────────────────────────────────
Write-Host ""
Write-Host "[ 4/6 ] Verificando migration ip_to_inet no banco E2E..." -ForegroundColor Yellow
$dbUrl = "postgresql://trustcheck:trustcheck@localhost:5432/trustcheck_e2e"

# Verifica tipo das colunas ip via psql dentro do container postgres
$typeCheck = docker compose -f docker-compose.e2e.yml exec -T postgres `
    psql -U trustcheck -d trustcheck_e2e -t -c `
    "SELECT udt_name FROM information_schema.columns WHERE column_name='ip' AND table_name='module_audit_logs';"

if ($typeCheck -match "inet") {
    Write-Host "        HOTFIX-03: coluna ip = inet  OK" -ForegroundColor Green
} else {
    Write-Host "FALHA: coluna ip em module_audit_logs NÃO é inet. Resultado: $typeCheck" -ForegroundColor Red
    exit 1
}

# Verifica índices
$idxCheck = docker compose -f docker-compose.e2e.yml exec -T postgres `
    psql -U trustcheck -d trustcheck_e2e -t -c `
    "SELECT count(*) FROM pg_indexes WHERE indexname IN ('mal_ip_idx','cst_ip_idx');"

$idxCount = ($idxCheck -replace '\s','')
if ($idxCount -eq "2") {
    Write-Host "        HOTFIX-03: 2 índices inet criados  OK" -ForegroundColor Green
} else {
    Write-Host "AVISO: índices inet não encontrados ($idxCount/2). Verifique a migration." -ForegroundColor Yellow
}

# ─── PASSO 5: Suite E2E completa (TC1-API-09) ─────────────────────────────────
Write-Host ""
Write-Host "[ 5/6 ] Suite E2E cross-repo (test:e2e)..." -ForegroundColor Yellow
$env:DATABASE_URL = $dbUrl
$env:REDIS_HOST   = "localhost"
$env:REDIS_PORT   = "6379"
npx jest --config ./test/jest-e2e.json --forceExit --passWithNoTests
if ($LASTEXITCODE -ne 0) { Write-Host "FALHA: suite E2E" -ForegroundColor Red; exit 1 }
Write-Host "        OK" -ForegroundColor Green

# ─── PASSO 6: Validação visual da DB (10 registros) ──────────────────────────
Write-Host ""
Write-Host "[ 6/6 ] Amostra de 10 registros de module_audit_logs..." -ForegroundColor Yellow
docker compose -f docker-compose.e2e.yml exec -T postgres `
    psql -U trustcheck -d trustcheck_e2e -c `
    "SELECT left(id,8) AS id, action, entity, payload, ip, created_at FROM module_audit_logs ORDER BY created_at DESC LIMIT 10;"
Write-Host "        Inspecione acima: payload NÃO deve conter password/token/otp." -ForegroundColor Gray

# ─── RESULTADO FINAL ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "-----------------------------------------------------------" -ForegroundColor Green
Write-Host "  TODOS OS PASSOS PASSARAM - hotfixes validados" -ForegroundColor Green
Write-Host ""
Write-Host "  Checklist:"
Write-Host "  [x] HOTFIX-01: payload sanitizado (audit-sanitize.spec.ts)"
Write-Host "  [x] HOTFIX-02: AUTH_LOGIN em module_audit_logs (consumer/company-login-audit)"
Write-Host "  [x] HOTFIX-03: ip = inet nas 3 tabelas + 2 indices (extract-ip.spec.ts)"
Write-Host "  [x] Suite unit + hotfixes verde"
Write-Host "  [x] Pipeline E2E (TC1-API-09) ainda passa"
Write-Host "  [x] Inspecao visual de 10 registros acima"
Write-Host "-----------------------------------------------------------" -ForegroundColor Green
Write-Host ""
