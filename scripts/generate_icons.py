#!/usr/bin/env python3
"""Generate a distinct, legible document-and-scroll icon for Native Longshot."""

from pathlib import Path

from PIL import Image, ImageDraw


def create_icon(size):
    """Draw at high resolution so all toolbar sizes have smooth edges."""
    scale = 4
    image = Image.new('RGBA', (128 * scale, 128 * scale), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    def box(coordinates):
        return tuple(round(value * scale) for value in coordinates)

    draw.rounded_rectangle(box((4, 4, 124, 124)), radius=27 * scale, fill='#4F46E5')
    draw.rounded_rectangle(box((28, 21, 79, 108)), radius=8 * scale, fill='#FFFFFF')
    for top, right in [(39, 65), (53, 65), (67, 59), (81, 65)]:
        draw.rounded_rectangle(box((39, top, right, top + 5)), radius=2 * scale, fill='#7770EE')

    # The contrasting vertical arrow remains recognizable in a 16px toolbar.
    draw.line([box((98, 32)), box((98, 95))], fill='#5EEAD4', width=8 * scale)
    draw.line([box((87, 43)), box((98, 32)), box((109, 43))],
              fill='#5EEAD4', width=8 * scale, joint='curve')
    draw.line([box((87, 84)), box((98, 95)), box((109, 84))],
              fill='#5EEAD4', width=8 * scale, joint='curve')
    return image.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == '__main__':
    directory = Path(__file__).resolve().parent.parent / 'extension' / 'icons'
    for icon_size in (16, 48, 128):
        create_icon(icon_size).save(directory / f'icon{icon_size}.png')
