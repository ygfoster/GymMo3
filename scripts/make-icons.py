#!/usr/bin/env python3
"""GymMo3 のアイコンを一括生成する。

  python3 scripts/make-icons.py

デザイン: オレンジのグラデーション背景に白いダンベル、その下に伸びる3本のバー（記録の積み上げ）。
GymMo2（黒地に3色のリング）と並べても見分けがつくようにしている。
出力:
  web/icons/icon.svg, favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-32.png
  android/app/src/main/res/mipmap-*/ic_launcher_foreground.png / ic_launcher_background.png / ic_launcher_monochrome.png
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'web', 'icons')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
SS = 4  # スーパーサンプリング倍率（縮小して輪郭を滑らかにする）

TOP = (255, 179, 64)    # #FFB340
BOTTOM = (255, 122, 0)  # #FF7A00
WHITE = (255, 255, 255)

# 512 基準のデザイン座標: (x, y, w, h, 角丸, 不透明度)
DUMBBELL_CY = 206
SHAPES = [
    (166, DUMBBELL_CY - 11, 180, 22, 11, 1.0),   # シャフト
    (132, DUMBBELL_CY - 54, 34, 108, 12, 1.0),   # 内側プレート
    (346, DUMBBELL_CY - 54, 34, 108, 12, 1.0),
    (106, DUMBBELL_CY - 36, 26, 72, 10, 1.0),    # 外側プレート
    (380, DUMBBELL_CY - 36, 26, 72, 10, 1.0),
    (176, 380 - 48, 40, 48, 10, 0.5),            # バー 3本
    (236, 380 - 76, 40, 76, 10, 0.75),
    (296, 380 - 104, 40, 104, 10, 1.0),
]
CONTENT_CX, CONTENT_CY = 256, (152 + 380) / 2  # 図形全体の中心


def gradient(size):
    """縦グラデーション + 中央やや上のハイライト"""
    mask = Image.linear_gradient('L').resize((size, size))
    top = Image.new('RGBA', (size, size), TOP + (255,))
    bottom = Image.new('RGBA', (size, size), BOTTOM + (255,))
    im = Image.composite(bottom, top, mask)
    glow_size = int(size * 1.25)
    radial = Image.radial_gradient('L').resize((glow_size, glow_size))
    alpha = Image.new('L', (size, size), 0)
    alpha.paste(radial.point(lambda v: int((255 - v) * 0.16)), (int(size * 0.5 - glow_size / 2), int(size * 0.42 - glow_size / 2)))
    glow = Image.new('RGBA', (size, size), WHITE + (0,))
    glow.putalpha(alpha)
    return Image.alpha_composite(im, glow)


def shapes(size, scale, cx=None, cy=None):
    """図形だけの透明レイヤー。scale は 512 基準 → size への倍率、(cx, cy) は図形中心を置く位置"""
    cx = size / 2 if cx is None else cx
    cy = size / 2 if cy is None else cy
    big = size * SS
    layer = Image.new('RGBA', (big, big), WHITE + (0,))
    d = ImageDraw.Draw(layer)
    s = scale * SS
    ox = cx * SS - CONTENT_CX * s
    oy = cy * SS - CONTENT_CY * s
    for x, y, w, h, r, a in SHAPES:
        d.rounded_rectangle([ox + x * s, oy + y * s, ox + (x + w) * s, oy + (y + h) * s], radius=r * s, fill=WHITE + (round(255 * a),))
    return layer.resize((size, size), Image.LANCZOS)


def full_icon(size):
    """背景込みの正方形アイコン（Web 用）"""
    im = gradient(size)
    im.alpha_composite(shapes(size, size / 512, cy=size / 2 + size * 0.01))
    return im.convert('RGB')


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print('wrote', os.path.relpath(path, ROOT), im.size)


def write_svg(path):
    rects = ''.join(
        f'    <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}"{"" if a == 1 else f" opacity=\"{a}\""}/>\n'
        for x, y, w, h, r, a in SHAPES)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFB340"/>
      <stop offset="1" stop-color="#FF7A00"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="62%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#glow)"/>
  <g fill="#fff" transform="translate(0 5)">
{rects}  </g>
</svg>
'''
    with open(path, 'w') as f:
        f.write(svg)
    print('wrote', os.path.relpath(path, ROOT))


def main():
    # Web
    write_svg(os.path.join(WEB, 'icon.svg'))
    write_svg(os.path.join(WEB, 'favicon.svg'))
    for name, size in [('icon-512.png', 512), ('icon-192.png', 192), ('icon-maskable-512.png', 512),
                       ('apple-touch-icon.png', 180), ('favicon-32.png', 32)]:
        save(full_icon(size), os.path.join(WEB, name))

    # Android adaptive icon: 108dp キャンバス、安全領域は中央の直径 66dp の円
    for dpi, px in [('mdpi', 108), ('hdpi', 162), ('xhdpi', 216), ('xxhdpi', 324), ('xxxhdpi', 432)]:
        folder = os.path.join(RES, f'mipmap-{dpi}')
        scale = px / 512 * 0.68  # 図形の幅 300 → 安全円（直径 66/108）に収める
        fg = shapes(px, scale)
        save(fg, os.path.join(folder, 'ic_launcher_foreground.png'))
        save(fg, os.path.join(folder, 'ic_launcher_monochrome.png'))
        save(gradient(px).convert('RGB'), os.path.join(folder, 'ic_launcher_background.png'))


if __name__ == '__main__':
    main()
