#!/usr/bin/env python3
"""
Cria icon.ico com tamanhos maiores incluindo 512x512
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    import os
    print("📦 Instalando Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image

source = Path("assets/icon.png")
output = Path("assets/icon.ico")

print(f"🎨 Criando {output.name} com tamanhos grandes...")

img = Image.open(source)
print(f"📏 Tamanho original: {img.size}")

if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Tamanhos incluindo 256 e maiores
sizes = [16, 24, 32, 48, 64, 128, 256]

icon_sizes = []
for size in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    icon_sizes.append(resized)
    print(f"  ✓ {size}x{size}")

# Salvar como .ico
icon_sizes[0].save(
    output,
    format='ICO',
    sizes=[(s, s) for s in sizes],
    append_images=icon_sizes[1:]
)

print(f"\n✅ {output.name} criado!")
print(f"📦 Tamanhos: {sizes}")

# Verificar tamanho do arquivo
import os
file_size = os.path.getsize(output)
print(f"💾 Tamanho do arquivo: {file_size / 1024:.1f} KB")
