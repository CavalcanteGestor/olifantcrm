#!/usr/bin/env python3
"""
Script para converter logo.png para os formatos necessários (.ico e .icns)
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("❌ Pillow não está instalado!")
    print("\n📦 Instalando Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image

def convert_to_ico(png_path, ico_path):
    """Converte PNG para ICO (Windows)"""
    print(f"🔄 Convertendo para .ico...")
    
    img = Image.open(png_path)
    
    # Converter para RGBA se necessário
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Criar múltiplos tamanhos para o ICO
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    icon_sizes = []
    
    for size in sizes:
        resized = img.resize(size, Image.Resampling.LANCZOS)
        icon_sizes.append(resized)
    
    # Salvar como ICO
    icon_sizes[0].save(
        ico_path,
        format='ICO',
        sizes=[(img.width, img.height) for img in icon_sizes]
    )
    
    print(f"✅ Criado: {ico_path}")

def convert_to_icns(png_path, icns_path):
    """Converte PNG para ICNS (Mac)"""
    print(f"🔄 Convertendo para .icns...")
    
    # Para ICNS, precisamos criar um iconset
    iconset_dir = Path('assets/icon.iconset')
    iconset_dir.mkdir(exist_ok=True)
    
    img = Image.open(png_path)
    
    # Converter para RGBA se necessário
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Tamanhos necessários para ICNS
    sizes = [
        (16, 'icon_16x16.png'),
        (32, 'icon_16x16@2x.png'),
        (32, 'icon_32x32.png'),
        (64, 'icon_32x32@2x.png'),
        (128, 'icon_128x128.png'),
        (256, 'icon_128x128@2x.png'),
        (256, 'icon_256x256.png'),
        (512, 'icon_256x256@2x.png'),
        (512, 'icon_512x512.png'),
        (1024, 'icon_512x512@2x.png'),
    ]
    
    for size, filename in sizes:
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(iconset_dir / filename)
    
    # Converter iconset para icns usando iconutil (Mac) ou alternativa
    if sys.platform == 'darwin':
        # No Mac, usar iconutil
        os.system(f'iconutil -c icns {iconset_dir} -o {icns_path}')
        print(f"✅ Criado: {icns_path}")
    else:
        # No Windows/Linux, criar um PNG de alta resolução como fallback
        print("⚠️  iconutil não disponível (apenas no Mac)")
        print("📝 Criando PNG de alta resolução como alternativa...")
        high_res = img.resize((1024, 1024), Image.Resampling.LANCZOS)
        high_res_path = str(icns_path).replace('.icns', '_1024.png')
        high_res.save(high_res_path)
        print(f"✅ Criado: {high_res_path}")
        print("\n💡 Para criar .icns real, use:")
        print("   - No Mac: Este script criará automaticamente")
        print("   - Online: https://cloudconvert.com/png-to-icns")
    
    # Limpar iconset
    import shutil
    shutil.rmtree(iconset_dir)

def main():
    print("\n" + "="*50)
    print("🎨 CONVERSOR DE ÍCONES - OLIFANT CRM")
    print("="*50 + "\n")
    
    # Caminhos
    assets_dir = Path('assets')
    png_path = assets_dir / 'icon.png'
    ico_path = assets_dir / 'icon.ico'
    icns_path = assets_dir / 'icon.icns'
    
    # Verificar se o PNG existe
    if not png_path.exists():
        print(f"❌ Erro: {png_path} não encontrado!")
        print("\n📋 Certifique-se de que a logo está em:")
        print(f"   {png_path.absolute()}")
        return 1
    
    print(f"📂 Logo encontrada: {png_path}")
    print(f"📏 Verificando dimensões...")
    
    img = Image.open(png_path)
    width, height = img.size
    print(f"   Tamanho: {width}x{height}")
    
    if width < 256 or height < 256:
        print("⚠️  Aviso: Imagem pequena (recomendado: 512x512 ou maior)")
    
    print("\n🔄 Iniciando conversões...\n")
    
    # Converter para ICO (Windows)
    try:
        convert_to_ico(png_path, ico_path)
    except Exception as e:
        print(f"❌ Erro ao criar .ico: {e}")
        return 1
    
    # Converter para ICNS (Mac)
    try:
        convert_to_icns(png_path, str(icns_path))
    except Exception as e:
        print(f"❌ Erro ao criar .icns: {e}")
        return 1
    
    print("\n" + "="*50)
    print("✅ CONVERSÃO CONCLUÍDA!")
    print("="*50)
    print("\n📁 Arquivos criados:")
    print(f"   ✓ {ico_path} (Windows)")
    if sys.platform == 'darwin':
        print(f"   ✓ {icns_path} (Mac)")
    else:
        icns_alt = str(icns_path).replace('.icns', '_1024.png')
        print(f"   ✓ {icns_alt} (Alta resolução)")
    
    print("\n🚀 Próximos passos:")
    print("   1. Verifique os ícones criados")
    print("   2. Execute: npm run build:win (Windows)")
    print("   3. Execute: npm run build:mac (Mac)")
    
    print("\n🎉 Pronto para buildar o instalador!\n")
    
    return 0

if __name__ == '__main__':
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  Conversão cancelada pelo usuário")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Erro inesperado: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
