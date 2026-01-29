# Instalação Rápida na VPS

## Passo 1: Clonar o Repositório

```bash
ssh usuario@seu-ip-vps
cd /home/usuario/
git clone https://github.com/seu-usuario/seu-repo.git app
cd app
```

## Passo 2: Executar Script Automático

```bash
bash infra/install-vps.sh
```

## Passo 3: Criar os .env quando o script pausar

O script vai pausar 3 vezes pedindo para você criar os arquivos .env:

### 3.1 - API (.env)
```bash
nano apps/api/.env
```
Cole o conteúdo do seu arquivo local `apps/api/.env.production`

Salvar: `Ctrl+O` → `Enter` → `Ctrl+X`

### 3.2 - Worker (.env)
```bash
nano apps/worker/.env
```
Cole o conteúdo do seu arquivo local `apps/worker/.env.production`

Salvar: `Ctrl+O` → `Enter` → `Ctrl+X`

### 3.3 - Web (.env.production)
```bash
nano apps/web/.env.production
```
Cole o conteúdo do seu arquivo local `apps/web/.env.production`

Salvar: `Ctrl+O` → `Enter` → `Ctrl+X`

## Passo 4: Pressionar ENTER

Depois de criar cada .env, pressione ENTER e o script continua automaticamente!

## Pronto! 🚀

O script vai:
- ✅ Instalar todas as dependências
- ✅ Fazer todos os builds
- ✅ Iniciar com PM2
- ✅ Configurar auto-start

## Verificar Status

```bash
pm2 status
pm2 logs
curl http://localhost:3001/health
```

## Comandos Úteis

```bash
pm2 logs              # Ver logs
pm2 restart all       # Reiniciar tudo
pm2 stop all          # Parar tudo
```

## Atualizar (Deploy de nova versão)

```bash
cd /home/usuario/app
pm2 stop all
git pull origin main
npm install --production
npm run build --workspace=packages/shared
npm run build --workspace=apps/api
npm run build --workspace=apps/worker
npm run build --workspace=apps/web
pm2 restart all
```

---

**Tempo estimado:** 5-10 minutos (dependendo da velocidade da VPS)

**Documentação completa:** Ver `COMO_INSTALAR_NA_VPS.md`
