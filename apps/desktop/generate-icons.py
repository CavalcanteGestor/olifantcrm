#!/usr/bin/env python3
"""
Script para gerar todos os ícones necessários para o app desktop e web
Gera: .ico (Windows), .icns (Mac), favicon.ico (Web)
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("❌ Pillow não está instalado!")
    print("📦 Instalando Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image

# Caminhos
DESKTOP_ASSETS = Path("apps/desktop/assets")
WEB_PUBLIC = Path("apps/web/public")
SOURCE_LOGO = DESKTOP_ASSETS / "icon.png"

def create_ico(source_path, output_path, sizes=[16, 32, 48, 64, 128, 256]):
    """Cria arquivo .ico com múltiplos tamanhos"""
    print(f"🎨 Criando {output_path.name}...")
    
    img = Image.open(source_path)
    
    # Converter para RGBA se necessário
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Criar lista de imagens em diferentes tamanhos
    icon_sizes = []
    for size in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        icon_sizes.append(resized)
    
    # Salvar como .ico
    icon_sizes[0].save(
        output_path,
        format='ICO',
        sizes=[(s, s) for s in sizes],
        append_images=icon_sizes[1:]
    )
    print(f"✅ {output_path.name} criado com sucesso!")

def create_icns(source_path, output_path):
    """Cria arquivo .icns para Mac"""
    print(f"🍎 Criando {output_path.name}...")
    
    img = Image.open(source_path)
    
    # Converter para RGBA se necessário
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Tamanhos necessários para .icns
    icns_sizes = [16, 32, 64, 128, 256, 512, 1024]
    
    # Criar diretório temporário para iconset
    iconset_dir = output_path.parent / f"{output_path.stem}.iconset"
    iconset_dir.mkdir(exist_ok=True)
    
    try:
        # Gerar todos os tamanhos necessários
        for size in icns_sizes:
            # Versão normal
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(iconset_dir / f"icon_{size}x{size}.png")
            
            # Versão @2x (retina)
            if size <= 512:
                resized_2x = img.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
                resized_2x.save(iconset_dir / f"icon_{size}x{size}@2x.png")
        
        # Converter iconset para icns usando iconutil (Mac) ou alternativa
        if sys.platform == 'darwin':
            # No Mac, usar iconutil
            os.system(f"iconutil -c icns {iconset_dir} -o {output_path}")
            print(f"✅ {output_path.name} criado com sucesso!")
        else:
            # No Windows/Linux, criar um PNG de alta resolução como fallback
            print(f"⚠️  iconutil não disponível (apenas Mac)")
            print(f"📦 Criando PNG de alta resolução como alternativa...")
            high_res = img.resize((1024, 1024), Image.Resampling.LANCZOS)
            high_res.save(output_path.with_suffix('.png'))
            print(f"✅ {output_path.with_suffix('.png').name} criado!")
            print(f"💡 Para criar .icns real, use: https://cloudconvert.com/png-to-icns")
    finally:
        # Limpar iconset temporário
        import shutil
        if iconset_dir.exists():
            shutil.rmtree(iconset_dir)

def create_favicon(source_path, output_path):
    """Cria favicon.ico para web"""
    print(f"🌐 Criando {output_path.name}...")
    
    img = Image.open(source_path)
    
    # Converter para RGBA se necessário
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Tamanhos para favicon
    favicon_sizes = [16, 32, 48]
    
    # Criar lista de imagens
    icon_sizes = []
    for size in favicon_sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        icon_sizes.append(resized)
    
    # Salvar como .ico
    icon_sizes[0].save(
        output_path,
        format='ICO',
        sizes=[(s, s) for s in favicon_sizes],
        append_images=icon_sizes[1:]
    )
    print(f"✅ {output_path.name} criado com sucesso!")

def main():
    print("🚀 Gerando ícones para Olifant CRM\n")
    
    # Verificar se o logo fonte existe
    if not SOURCE_LOGO.exists():
        print(f"❌ Logo fonte não encontrada: {SOURCE_LOGO}")
        print(f"📁 Certifique-se de que {SOURCE_LOGO} existe")
        return 1
    
    print(f"📂 Logo fonte: {SOURCE_LOGO}\n")
    
    # 1. Criar icon.ico para Windows (se não existir ou forçar)
    windows_ico = DESKTOP_ASSETS / "icon.ico"
    if windows_ico.exists():
        print(f"ℹ️  {windows_ico.name} já existe, pulando...")
    else:
        create_ico(SOURCE_LOGO, windows_ico)
    
    print()
    
    # 2. Criar icon.icns para Mac
    mac_icns = DESKTOP_ASSETS / "icon.icns"
    create_icns(SOURCE_LOGO, mac_icns)
    
    print()
    
    # 3. Criar favicon.ico para Web
    favicon = WEB_PUBLIC / "favicon.ico"
    # Usar logo.png da web se existir, senão usar do desktop
    web_logo = WEB_PUBLIC / "logo.png"
    source_for_favicon = web_logo if web_logo.exists() else SOURCE_LOGO
    create_favicon(source_for_favicon, favicon)
    
    print("\n" + "="*50)
    print("✅ Todos os ícones foram gerados com sucesso!")
    print("="*50)
    print("\n📦 Arquivos criados:")
    print(f"  • {windows_ico} (Windows)")
    print(f"  • {mac_icns} ou {mac_icns.with_suffix('.png')} (Mac)")
    print(f"  • {favicon} (Web)")
    print("\n🎯 Próximos passos:")
    print("  1. Testar o app desktop: cd apps/desktop && npm run dev")
    print("  2. Buildar instaladores: npm run build:win ou npm run build:mac")
    print("  3. Verificar o favicon no navegador")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
