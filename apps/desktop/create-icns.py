#!/usr/bin/env python3
"""
Script para criar arquivo .icns para Mac usando pypng
Funciona no Windows/Linux/Mac
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
    import struct
except ImportError:
    print("📦 Instalando dependências...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image
    import struct

def create_icns_file(source_path, output_path):
    """
    Cria um arquivo .icns básico que funciona no Mac
    """
    print(f"🍎 Criando {output_path.name} para Mac...")
    
    img = Image.open(source_path)
    
    # Converter para RGBA
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Tamanhos necessários para .icns moderno
    sizes = {
        'ic07': 128,   # 128x128
        'ic08': 256,   # 256x256
        'ic09': 512,   # 512x512
        'ic10': 1024,  # 1024x1024 (retina)
        'ic11': 32,    # 32x32
        'ic12': 64,    # 64x64
        'ic13': 256,   # 256x256 (retina)
        'ic14': 512,   # 512x512 (retina)
    }
    
    # Criar arquivo .icns
    with open(output_path, 'wb') as f:
        # Header do arquivo .icns
        f.write(b'icns')
        
        # Placeholder para o tamanho total (será atualizado depois)
        size_pos = f.tell()
        f.write(struct.pack('>I', 0))
        
        # Gerar cada tamanho
        for icon_type, size in sizes.items():
            # Redimensionar imagem
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            
            # Converter para PNG em memória
            from io import BytesIO
            png_buffer = BytesIO()
            resized.save(png_buffer, format='PNG')
            png_data = png_buffer.getvalue()
            
            # Escrever entrada do ícone
            f.write(icon_type.encode('ascii'))
            f.write(struct.pack('>I', len(png_data) + 8))  # tamanho = dados + header
            f.write(png_data)
        
        # Atualizar tamanho total no header
        total_size = f.tell()
        f.seek(size_pos)
        f.write(struct.pack('>I', total_size))
    
    print(f"✅ {output_path.name} criado com sucesso!")
    print(f"📦 Tamanho: {total_size / 1024:.1f} KB")

def main():
    source = Path("apps/desktop/assets/icon.png")
    output = Path("apps/desktop/assets/icon.icns")
    
    if not source.exists():
        print(f"❌ Logo fonte não encontrada: {source}")
        return 1
    
    create_icns_file(source, output)
    
    print("\n✅ Arquivo .icns criado!")
    print("🎯 Agora você pode buildar para Mac: npm run build:mac")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
