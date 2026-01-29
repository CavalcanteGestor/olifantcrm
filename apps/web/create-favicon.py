#!/usr/bin/env python3
"""
Cria um favicon.ico de qualidade a partir do logo.png
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

source = Path("public/logo.png")
output = Path("public/favicon.ico")
app_output = Path("src/app/favicon.ico")

print(f"🎨 Criando favicon.ico de qualidade...")

img = Image.open(source)
print(f"📏 Logo original: {img.size}")

if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Tamanhos para favicon (16, 32, 48 são os mais importantes)
sizes = [16, 32, 48, 64]

icon_sizes = []
for size in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    icon_sizes.append(resized)
    print(f"  ✓ {size}x{size}")

# Salvar no public
icon_sizes[0].save(
    output,
    format='ICO',
    sizes=[(s, s) for s in sizes],
    append_images=icon_sizes[1:]
)
print(f"\n✅ {output} criado!")

# Copiar para app
icon_sizes[0].save(
    app_output,
    format='ICO',
    sizes=[(s, s) for s in sizes],
    append_images=icon_sizes[1:]
)
print(f"✅ {app_output} criado!")

import os
file_size = os.path.getsize(output)
print(f"💾 Tamanho: {file_size / 1024:.1f} KB")
