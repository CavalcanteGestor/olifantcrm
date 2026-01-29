# Deploy remoto (sem commitar `.env`)

Este guia faz deploy na VPS **sem colocar credenciais no Git**.

## Pré-requisitos

- Você tem acesso SSH na VPS.
- Na VPS: `node >= 20`, `npm`, `git`.
- No seu PC: `ssh` e `scp`.

## 1) Coloque os envs na raiz do repo (local)

Crie (localmente) estes arquivos **na raiz do projeto**:

- `api.env`
- `web.env`
- `worker.env`

> Não commite esses arquivos.

## 2) Executar o deploy remoto

No seu PC, na raiz do repo:

```bash
bash infra/deploy-remote.sh \
  --host SEU_IP_OU_DOMINIO \
  --user ubuntu \
  --repo https://github.com/CavalcanteGestor/olifanttest.git \
  --branch main
```

O script vai:
- copiar envs para `/opt/crm/env/*.env`
- atualizar/clonar o repo em `/opt/crm/current`
- `npm ci`, `npm run build`
- iniciar/reiniciar PM2

## 3) Ver logs

Na VPS:

```bash
sudo -u crmapp pm2 list
sudo -u crmapp pm2 logs --lines 100
```

