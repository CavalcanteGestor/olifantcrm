# 🚀 GUIA RÁPIDO - Desktop App

## ⚡ Criar Instaladores em 3 Passos

### 1️⃣ Instalar Dependências
```bash
cd apps/desktop
npm install
```

### 2️⃣ Adicionar Ícones (Opcional)
Coloque seus ícones em `assets/`:
- `icon.png` (512x512)
- `icon.ico` (Windows)
- `icon.icns` (Mac)

Se não tiver, o app usará o ícone padrão do Electron.

### 3️⃣ Gerar Instaladores

**Windows:**
```bash
npm run build:win
```
📦 Instalador gerado em: `dist/Olifant CRM Setup 1.0.0.exe`

**Mac:**
```bash
npm run build:mac
```
📦 Instalador gerado em: `dist/Olifant CRM-1.0.0.dmg`

**Ambos:**
```bash
npm run build:all
```

---

## ⚙️ Configurar URL de Produção

Antes de buildar para distribuição, configure a URL:

**Opção 1: Editar `src/main.js`**
```javascript
// Linha 9
const APP_URL = 'https://seu-dominio.com';
```

**Opção 2: Variável de Ambiente**
```bash
# Windows
set OLIFANT_URL=https://seu-dominio.com
npm run build:win

# Mac/Linux
export OLIFANT_URL=https://seu-dominio.com
npm run build:mac
```

---

## 🧪 Testar Antes de Buildar

```bash
npm run dev
```

Isso abre o app apontando para `http://localhost:3000`.

---

## 📦 Distribuir

### Windows
1. Envie o arquivo `.exe` para os usuários
2. Eles executam e seguem o instalador
3. App fica instalado em `C:\Program Files\Olifant CRM`

### Mac
1. Envie o arquivo `.dmg` para os usuários
2. Eles abrem e arrastam para Applications
3. App fica instalado em `/Applications/Olifant CRM.app`

---

## 🎯 Dicas

### Tamanho do Instalador
- Windows: ~150MB
- Mac: ~200MB

### Primeira Execução
O app pode demorar alguns segundos para abrir na primeira vez.

### Atualização
Para atualizar, basta gerar novo instalador e distribuir.

---

## ✅ Pronto!

Seus usuários agora podem usar o CRM como um app nativo! 🎉
