# 🖥️ Olifant CRM - Desktop App

Aplicativo desktop para Windows e Mac do CRM Olifant.

## 📋 Pré-requisitos

- Node.js >= 20
- npm ou yarn

## 🚀 Desenvolvimento

```bash
# Instalar dependências
npm install

# Rodar em modo desenvolvimento
npm run dev
```

## 📦 Build

### Windows
```bash
npm run build:win
```
Gera instalador em `dist/Olifant CRM Setup 1.0.0.exe`

### Mac
```bash
npm run build:mac
```
Gera instalador em `dist/Olifant CRM-1.0.0.dmg`

### Ambos
```bash
npm run build:all
```

## ⚙️ Configuração

### URL da Aplicação

Por padrão, o app aponta para `http://localhost:3000`.

Para apontar para produção, edite `src/main.js`:

```javascript
const APP_URL = 'https://seu-dominio.com';
```

Ou use variável de ambiente:

```bash
export OLIFANT_URL=https://seu-dominio.com
npm run build
```

## 📁 Estrutura

```
apps/desktop/
├── src/
│   └── main.js          # Processo principal do Electron
├── assets/
│   ├── icon.png         # Ícone PNG (512x512)
│   ├── icon.ico         # Ícone Windows
│   └── icon.icns        # Ícone Mac
├── dist/                # Builds gerados
├── package.json
└── README.md
```

## 🎨 Ícones

Para gerar os ícones:

1. Crie um PNG 512x512 em `assets/icon.png`
2. Use ferramentas online para converter:
   - **Windows (.ico):** https://convertio.co/png-ico/
   - **Mac (.icns):** https://cloudconvert.com/png-to-icns

## 🔒 Segurança

- ✅ `nodeIntegration: false`
- ✅ `contextIsolation: true`
- ✅ `webSecurity: true`
- ✅ Links externos abrem no navegador
- ✅ Navegação restrita ao domínio da app

## 📝 Notas

### Assinatura de Código

Para distribuição em produção, você deve assinar o aplicativo:

**Windows:**
- Precisa de certificado de assinatura de código
- Configure em `package.json` > `build.win.certificateFile`

**Mac:**
- Precisa de Apple Developer Account
- Configure em `package.json` > `build.mac.identity`

### Atualização Automática

Para adicionar atualização automática, use `electron-updater`:

```bash
npm install electron-updater
```

## 🎯 Distribuição

### Windows
- Instalador NSIS (.exe)
- Permite escolher diretório de instalação
- Cria atalhos no desktop e menu iniciar

### Mac
- Imagem de disco (.dmg)
- Arraste e solte para instalar
- Categoria: Business

## 🆘 Troubleshooting

### Erro ao buildar no Mac
```bash
# Instalar dependências do Mac
brew install wine
```

### Erro ao buildar no Windows
```bash
# Executar como administrador
npm run build:win
```

## 📞 Suporte

Consulte a documentação principal em `../../docs/`
