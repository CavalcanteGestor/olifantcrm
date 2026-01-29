#!/usr/bin/env python3
"""
Recria o icon.ico com tamanhos corretos para o electron-builder
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

print(f"🎨 Recriando {output.name} com tamanhos corretos...")

img = Image.open(source)

if img.mode != 'RGBA':
    img = img.convert('RGBA')

# Tamanhos necessários (incluindo 256x256 obrigatório)
sizes = [16, 32, 48, 64, 128, 256]

icon_sizes = []
for size in sizes:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    icon_sizes.append(resized)

# Salvar como .ico
icon_sizes[0].save(
    output,
    format='ICO',
    sizes=[(s, s) for s in sizes],
    append_images=icon_sizes[1:]
)

print(f"✅ {output.name} criado com sucesso!")
print(f"📦 Tamanhos incluídos: {sizes}")
