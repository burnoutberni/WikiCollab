#!/usr/bin/env python3
"""Generate WikiCollab icons from lucide-file-text SVG with proper padding.

Usage:
    python3 scripts/generate-icons.py

Output:
    packages/client/public/icons/*.png
"""

from PIL import Image, ImageDraw
import os
import subprocess
import tempfile
import sys

# Configuration
ICONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'packages', 'client', 'public', 'icons')
SVG_PATH = os.path.join(os.path.dirname(__file__), 'lucide-file-text.svg')
BG_COLOR = (26, 29, 35)  # #1a1d23

# Icon configurations: (filename, size, padding_percent)
ICON_CONFIGS = [
    ('favicon-16x16.png', 16, 18),
    ('favicon-32x32.png', 32, 18),
    ('favicon-48x48.png', 48, 18),
    ('apple-touch-icon.png', 180, 18),
    ('icon-192x192.png', 192, 18),
    ('icon-512x512.png', 512, 18),
    ('icon-maskable.png', 512, 28),  # More padding for maskable
]


def convert_svg_to_png(svg_path, output_path, size=512):
    """Convert SVG to PNG using available converters."""
    # Read and modify SVG to use white color
    with open(svg_path, 'r', encoding='utf-8') as f:
        svg_content = f.read()
    
    svg_content = svg_content.replace('stroke="currentColor"', 'stroke="white"')
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.svg', delete=False, encoding='utf-8') as temp_svg:
        temp_svg.write(svg_content)
        temp_svg_path = temp_svg.name
    
    try:
        # Try rsvg-convert first
        subprocess.run(
            ['rsvg-convert', '-w', str(size), '-h', str(size), temp_svg_path, '-o', output_path],
            check=True, capture_output=True, timeout=30
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    try:
        # Try inkscape
        subprocess.run(
            ['inkscape', '--export-type=png', f'--export-width={size}',
             f'--export-height={size}', temp_svg_path, '-o', output_path],
            check=True, capture_output=True, timeout=30
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    try:
        # Try ImageMagick convert
        subprocess.run(
            ['convert', '-background', 'none', '-resize', f'{size}x{size}',
             temp_svg_path, output_path],
            check=True, capture_output=True, timeout=30
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    finally:
        os.unlink(temp_svg_path)
    
    return False


def create_icon_from_svg(svg_path, size, padding_percent):
    """Create icon from SVG with proper padding on dark background."""
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as temp_png:
        temp_png_path = temp_png.name
    
    try:
        # Convert SVG to high-res PNG
        if not convert_svg_to_png(svg_path, temp_png_path, 512):
            raise RuntimeError("No SVG converter available. Install librsvg, inkscape, or imagemagick.")
        
        # Open the converted PNG
        with Image.open(temp_png_path) as icon_img:
            if icon_img.mode != 'RGBA':
                icon_img = icon_img.convert('RGBA')
            
            # Create the final icon with dark background
            final_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
            draw = ImageDraw.Draw(final_img)
            
            # Draw dark background rounded rectangle
            padding = int(size * padding_percent / 100)
            bg_width = size - (2 * padding)
            bg_height = size - (2 * padding)
            corner_radius = int(size * 0.15)
            
            x1, y1 = padding, padding
            x2, y2 = padding + bg_width, padding + bg_height
            
            # Draw background
            draw.rounded_rectangle([x1, y1, x2, y2], radius=corner_radius, fill=(*BG_COLOR, 255))
            
            # Resize icon to fit inside the background with margin
            icon_margin = int(bg_width * 0.2)
            icon_max_size = bg_width - (2 * icon_margin)
            icon_img.thumbnail((icon_max_size, icon_max_size), Image.Resampling.LANCZOS)
            
            # Center icon
            icon_x = x1 + (bg_width - icon_img.width) // 2
            icon_y = y1 + (bg_height - icon_img.height) // 2
            
            # Paste icon
            final_img.paste(icon_img, (icon_x, icon_y), icon_img)
            
            return final_img
    
    finally:
        if os.path.exists(temp_png_path):
            os.unlink(temp_png_path)


def main():
    """Generate all icons."""
    if not os.path.exists(SVG_PATH):
        print(f"Error: SVG file not found at {SVG_PATH}")
        sys.exit(1)
    
    os.makedirs(ICONS_DIR, exist_ok=True)
    
    for filename, size, padding in ICON_CONFIGS:
        output_path = os.path.join(ICONS_DIR, filename)
        new_icon = create_icon_from_svg(SVG_PATH, size, padding)
        new_icon.save(output_path, 'PNG', optimize=True)
        print(f"Generated {filename} ({size}x{size}) with {padding}% padding")
    
    print("\nAll icons generated successfully!")


if __name__ == '__main__':
    main()
