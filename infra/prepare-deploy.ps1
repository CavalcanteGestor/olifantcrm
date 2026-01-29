# Script para preparar deploy manual via SFTP
# Executa builds e organiza arquivos numa pasta deploy-package/

Write-Host "=== Preparando Deploy Manual ===" -ForegroundColor Cyan

# Limpar pasta de deploy anterior
if (Test-Path "deploy-package") {
    Write-Host "Removendo deploy anterior..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force deploy-package
}

# Criar estrutura de pastas
Write-Host "Criando estrutura de pastas..." -ForegroundColor Green
New-Item -ItemType Directory -Path "deploy-package/api" -Force | Out-Null
New-Item -ItemType Directory -Path "deploy-package/worker" -Force | Out-Null
New-Item -ItemType Directory -Path "deploy-package/web" -Force | Out-Null
New-Item -ItemType Directory -Path "deploy-package/packages/shared" -Force | Out-Null

# Build dos projetos
Write-Host "`n=== Executando Builds ===" -ForegroundColor Cyan

# IMPORTANTE: Shared precisa ser buildado primeiro pois API e Worker dependem dele
Write-Host "Building Shared (dependência)..." -ForegroundColor Yellow
npm run build --workspace=packages/shared
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build do Shared!" -ForegroundColor Red
    exit 1
}

Write-Host "Building API..." -ForegroundColor Yellow
npm run build --workspace=apps/api
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build da API!" -ForegroundColor Red
    exit 1
}

Write-Host "Building Worker..." -ForegroundColor Yellow
npm run build --workspace=apps/worker
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build do Worker!" -ForegroundColor Red
    exit 1
}

Write-Host "Building Web..." -ForegroundColor Yellow
npm run build --workspace=apps/web
if ($LASTEXITCODE -ne 0) {
    Write-Host "Erro no build do Web!" -ForegroundColor Red
    exit 1
}

# Copiar builds
Write-Host "`n=== Copiando Builds ===" -ForegroundColor Cyan

Write-Host "Copiando API dist..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "apps/api/dist" "deploy-package/api/"

Write-Host "Copiando Worker dist..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "apps/worker/dist" "deploy-package/worker/"

Write-Host "Copiando Web .next..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "apps/web/.next" "deploy-package/web/"

Write-Host "Copiando Web public..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "apps/web/public" "deploy-package/web/"

Write-Host "Copiando Shared dist..." -ForegroundColor Yellow
Copy-Item -Recurse -Force "packages/shared/dist" "deploy-package/packages/shared/"

# Copiar package.json
Write-Host "`n=== Copiando package.json ===" -ForegroundColor Cyan
Copy-Item "apps/api/package.json" "deploy-package/api/"
Copy-Item "apps/worker/package.json" "deploy-package/worker/"
Copy-Item "apps/web/package.json" "deploy-package/web/"
Copy-Item "packages/shared/package.json" "deploy-package/packages/shared/"
Copy-Item "package.json" "deploy-package/"

# Copiar e renomear .env
Write-Host "`n=== Copiando arquivos .env ===" -ForegroundColor Cyan

if (Test-Path "apps/api/.env.production") {
    Copy-Item "apps/api/.env.production" "deploy-package/api/.env"
    Write-Host "API .env copiado" -ForegroundColor Green
} else {
    Write-Host "AVISO: apps/api/.env.production não encontrado!" -ForegroundColor Red
}

if (Test-Path "apps/worker/.env.production") {
    Copy-Item "apps/worker/.env.production" "deploy-package/worker/.env"
    Write-Host "Worker .env copiado" -ForegroundColor Green
} else {
    Write-Host "AVISO: apps/worker/.env.production não encontrado!" -ForegroundColor Red
}

if (Test-Path "apps/web/.env.production") {
    Copy-Item "apps/web/.env.production" "deploy-package/web/.env.production"
    Write-Host "Web .env.production copiado" -ForegroundColor Green
} else {
    Write-Host "AVISO: apps/web/.env.production não encontrado!" -ForegroundColor Red
}

# Copiar ecosystem.config.cjs
Write-Host "`n=== Copiando ecosystem.config.cjs ===" -ForegroundColor Cyan
if (Test-Path "ecosystem.config.cjs") {
    Copy-Item "ecosystem.config.cjs" "deploy-package/"
    Write-Host "ecosystem.config.cjs copiado" -ForegroundColor Green
} else {
    Write-Host "AVISO: ecosystem.config.cjs não encontrado!" -ForegroundColor Red
}

# Criar arquivo README com instruções
Write-Host "`n=== Criando README de deploy ===" -ForegroundColor Cyan
$readmeContent = @"
# Deploy Package - Pronto para Upload

Esta pasta contém todos os arquivos necessários para deploy na VPS.

## Estrutura:
- api/ - Backend API compilado
- worker/ - Worker compilado
- web/ - Frontend Next.js compilado
- packages/shared/ - Pacote compartilhado
- ecosystem.config.cjs - Configuração PM2

## Como fazer deploy:

1. Abra o Termius e conecte via SFTP na sua VPS
2. Navegue até /home/seu-usuario/
3. Crie uma pasta 'app' (se não existir)
4. Arraste TODO o conteúdo desta pasta para /home/seu-usuario/app/
5. Conecte via SSH e execute:

```bash
cd /home/seu-usuario/app

# Instalar dependências
npm install --production
cd api && npm install --production && cd ..
cd worker && npm install --production && cd ..
cd web && npm install --production && cd ..

# Iniciar com PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

6. Verifique os logs: pm2 logs

## Arquivos .env incluídos:
- api/.env (de .env.production)
- worker/.env (de .env.production)
- web/.env.production

Gerado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

Set-Content -Path "deploy-package/README.txt" -Value $readmeContent

Write-Host "`n=== Deploy Package Pronto! ===" -ForegroundColor Green
Write-Host "Pasta: deploy-package/" -ForegroundColor Cyan
Write-Host "`nPróximos passos:" -ForegroundColor Yellow
Write-Host "1. Abra o Termius" -ForegroundColor White
Write-Host "2. Conecte via SFTP na VPS" -ForegroundColor White
Write-Host "3. Arraste a pasta 'deploy-package' para /home/usuario/app/" -ForegroundColor White
Write-Host "4. Conecte via SSH e siga as instruções do README.txt" -ForegroundColor White
Write-Host "`nLeia: docs/DEPLOY_MANUAL_SFTP.md para mais detalhes" -ForegroundColor Cyan
