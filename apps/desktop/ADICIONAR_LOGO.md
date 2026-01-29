# 🎨 ADICIONAR LOGO DA OLIFANT

## ✅ Logo Copiada!

A logo `logo.png` foi copiada para `apps/desktop/assets/icon.png`.

---

## 📋 Próximos Passos

### 1. Converter para Formatos Específicos

Você precisa converter a logo para os formatos nativos:

#### Windows (.ico)
1. Acesse: https://convertio.co/png-ico/
2. Faça upload de `apps/desktop/assets/icon.png`
3. Baixe o arquivo `.ico`
4. Salve como `apps/desktop/assets/icon.ico`

#### Mac (.icns)
1. Acesse: https://cloudconvert.com/png-to-icns
2. Faça upload de `apps/desktop/assets/icon.png`
3. Baixe o arquivo `.icns`
4. Salve como `apps/desktop/assets/icon.icns`

---

## 🎯 Resultado Final

Após adicionar os ícones, você terá:

```
apps/desktop/assets/
├── icon.png   ✅ (já copiado)
├── icon.ico   ⏳ (converter)
└── icon.icns  ⏳ (converter)
```

---

## 🖼️ Onde a Logo Vai Aparecer

### Windows
✅ **Instalador:** Logo no topo da janela de instalação  
✅ **Desktop:** Ícone com a logo da Olifant  
✅ **Barra de Tarefas:** Logo da Olifant  
✅ **Menu Iniciar:** Logo + "Olifant CRM"  
✅ **Painel de Controle:** Logo na lista de programas  
✅ **Janela do App:** Logo na barra de título  

### Mac
✅ **Arquivo .dmg:** Logo no instalador  
✅ **Applications:** Logo + "Olifant CRM"  
✅ **Dock:** Logo da Olifant  
✅ **Launchpad:** Logo da Olifant  
✅ **Janela do App:** Logo na barra de título  

---

## ⚡ Alternativa Rápida (Apenas PNG)

Se você não quiser converter agora, pode buildar apenas com o PNG:

```bash
npm run build:win
```

O Electron vai usar o PNG e converter automaticamente (mas pode não ficar perfeito).

**Recomendado:** Converter para .ico e .icns para melhor qualidade.

---

## 🎨 Dicas de Design

### Tamanho Ideal
- **Mínimo:** 256x256
- **Recomendado:** 512x512
- **Máximo:** 1024x1024

### Formato
- Fundo transparente (PNG)
- Logo centralizada
- Margens de 10-15% nas bordas

### Cores
- Evite detalhes muito pequenos
- Use cores sólidas
- Teste em fundo claro e escuro

---

## ✅ Checklist

- [x] Logo copiada para `assets/icon.png`
- [ ] Converter para `assets/icon.ico` (Windows)
- [ ] Converter para `assets/icon.icns` (Mac)
- [ ] Testar com `npm run dev`
- [ ] Buildar instaladores

---

## 🚀 Após Adicionar os Ícones

```bash
cd apps/desktop
npm run build:win   # Windows com logo
npm run build:mac   # Mac com logo
```

**Pronto! Instaladores com a logo da Olifant! 🎉**

---

**Desenvolvido com ❤️ para Clínica Olifant - Pediatria Interdisciplinar**
