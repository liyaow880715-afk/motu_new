#!/usr/bin/env python3
"""Compose hero image variants from a base scene image using Pillow."""

import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter


def find_font(preferred_size: int) -> ImageFont.FreeTypeFont:
    """Find a usable font, preferring Chinese system fonts."""
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",  # Microsoft YaHei
        "C:/Windows/Fonts/msyhbd.ttc",
        "C:/Windows/Fonts/simsun.ttc",  # SimSun
        "C:/Windows/Fonts/simhei.ttf",  # SimHei
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, preferred_size)
            except Exception:
                continue
    return ImageFont.load_default()


def hex_to_rgb(hex_color: str) -> tuple:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def get_text_size(draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_rounded_rectangle(
    draw: ImageDraw.Draw,
    xy: tuple,
    radius: int,
    fill: tuple,
    outline: tuple | None = None,
    width: int = 1,
):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def apply_layout(
    base: Image.Image,
    copy_text: str,
    sub_copy_text: str | None,
    tags: list[str],
    layout_style: str,
    aspect_ratio: str,
):
    # Ensure target aspect ratio by cropping/resizing
    target_w, target_h = parse_aspect_ratio(aspect_ratio, base.width, base.height)
    base = fit_to_aspect(base, target_w, target_h)

    img = base.copy().convert("RGBA")
    draw = ImageDraw.Draw(img)

    title_font = find_font(int(img.height * 0.09))
    sub_font = find_font(int(img.height * 0.05))
    tag_font = find_font(int(img.height * 0.04))

    if layout_style == "title-top":
        draw_text_block(draw, img, copy_text, sub_copy_text, position="top", title_font=title_font, sub_font=sub_font)
    elif layout_style == "title-bottom":
        draw_text_block(draw, img, copy_text, sub_copy_text, position="bottom", title_font=title_font, sub_font=sub_font)
    elif layout_style == "title-left":
        draw_text_block(draw, img, copy_text, sub_copy_text, position="left", title_font=title_font, sub_font=sub_font)
    elif layout_style == "title-right":
        draw_text_block(draw, img, copy_text, sub_copy_text, position="right", title_font=title_font, sub_font=sub_font)
    elif layout_style == "center-tag":
        draw_center_tag(draw, img, copy_text, tags, title_font=title_font, tag_font=tag_font)
    else:
        draw_text_block(draw, img, copy_text, sub_copy_text, position="bottom", title_font=title_font, sub_font=sub_font)

    if tags and layout_style != "center-tag":
        draw_tags(draw, img, tags, tag_font, position="bottom-right")

    # Slight color variation for differentiation
    img = apply_subtle_filter(img)

    return img.convert("RGB")


def parse_aspect_ratio(aspect_ratio: str, ref_w: int, ref_h: int) -> tuple:
    mapping = {
        "1:1": (1, 1),
        "3:4": (3, 4),
        "4:3": (4, 3),
        "16:9": (16, 9),
        "9:16": (9, 16),
    }
    if aspect_ratio in mapping:
        return mapping[aspect_ratio]
    # parse "4:3" string
    if ":" in aspect_ratio:
        parts = aspect_ratio.split(":")
        return (int(parts[0]), int(parts[1]))
    return (ref_w, ref_h)


def fit_to_aspect(img: Image.Image, w_ratio: int, h_ratio: int) -> Image.Image:
    target_ratio = w_ratio / h_ratio
    current_ratio = img.width / img.height

    if current_ratio > target_ratio:
        # Image is too wide, crop width
        new_width = int(img.height * target_ratio)
        left = (img.width - new_width) // 2
        img = img.crop((left, 0, left + new_width, img.height))
    elif current_ratio < target_ratio:
        # Image is too tall, crop height
        new_height = int(img.width / target_ratio)
        top = (img.height - new_height) // 2
        img = img.crop((0, top, img.width, top + new_height))

    return img


def draw_text_block(
    draw: ImageDraw.Draw,
    img: Image.Image,
    copy_text: str,
    sub_copy_text: str | None,
    position: str,
    title_font: ImageFont.FreeTypeFont,
    sub_font: ImageFont.FreeTypeFont,
):
    margin = int(img.width * 0.05)
    padding = int(img.width * 0.03)

    title_w, title_h = get_text_size(draw, copy_text, title_font)
    sub_h = 0
    if sub_copy_text:
        _, sub_h = get_text_size(draw, sub_copy_text, sub_font)

    if position == "top":
        x = (img.width - title_w) // 2
        y = margin
    elif position == "bottom":
        x = (img.width - title_w) // 2
        y = img.height - margin - title_h - (sub_h + padding if sub_copy_text else 0)
    elif position == "left":
        x = margin
        y = (img.height - title_h) // 2
    else:  # right
        x = img.width - margin - title_w
        y = (img.height - title_h) // 2

    # Draw title background
    bg_box = [x - padding, y - padding, x + title_w + padding, y + title_h + padding]
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(bg_box, radius=padding // 2, fill=(0, 0, 0, 160))
    img.alpha_composite(overlay)

    draw.text((x, y), copy_text, font=title_font, fill=(255, 255, 255, 255))

    if sub_copy_text:
        sub_x = x
        sub_y = y + title_h + padding // 2
        draw.text((sub_x, sub_y), sub_copy_text, font=sub_font, fill=(240, 240, 240, 255))


def draw_center_tag(
    draw: ImageDraw.Draw,
    img: Image.Image,
    copy_text: str,
    tags: list[str],
    title_font: ImageFont.FreeTypeFont,
    tag_font: ImageFont.FreeTypeFont,
):
    margin = int(img.width * 0.05)
    padding = int(img.width * 0.03)

    title_w, title_h = get_text_size(draw, copy_text, title_font)
    x = (img.width - title_w) // 2
    y = int(img.height * 0.15)

    bg_box = [x - padding, y - padding, x + title_w + padding, y + title_h + padding]
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rounded_rectangle(bg_box, radius=padding // 2, fill=(255, 80, 0, 200))
    img.alpha_composite(overlay)
    draw.text((x, y), copy_text, font=title_font, fill=(255, 255, 255, 255))

    if tags:
        tag_y = y + title_h + padding * 2
        tag_x_start = margin
        for tag in tags[:3]:
            tag_w, tag_h = get_text_size(draw, tag, tag_font)
            tag_box = [tag_x_start, tag_y, tag_x_start + tag_w + padding, tag_y + tag_h + padding // 2]
            draw_rounded_rectangle(draw, tag_box, radius=padding // 4, fill=(255, 200, 0, 220), outline=(255, 140, 0, 255), width=2)
            draw.text((tag_x_start + padding // 2, tag_y + padding // 4), tag, font=tag_font, fill=(80, 30, 0, 255))
            tag_x_start += tag_w + padding + int(img.width * 0.02)


def draw_tags(
    draw: ImageDraw.Draw,
    img: Image.Image,
    tags: list[str],
    font: ImageFont.FreeTypeFont,
    position: str,
):
    margin = int(img.width * 0.04)
    padding = int(img.width * 0.015)

    if position == "bottom-right":
        x = img.width - margin
        y = img.height - margin - int(img.height * 0.06)

    for tag in reversed(tags[:3]):
        tag_w, tag_h = get_text_size(draw, tag, font)
        x -= tag_w + padding * 2
        tag_box = [x, y, x + tag_w + padding * 2, y + tag_h + padding]
        draw_rounded_rectangle(draw, tag_box, radius=padding, fill=(255, 60, 60, 220), outline=(255, 255, 255, 255), width=2)
        draw.text((x + padding, y + padding // 2), tag, font=font, fill=(255, 255, 255, 255))
        x -= int(img.width * 0.015)


def apply_subtle_filter(img: Image.Image) -> Image.Image:
    # Very slight contrast/brightness shift to create differentiation
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.05)
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(1.02)
    return img


def main():
    raw = sys.stdin.read()
    if not raw:
        print(json.dumps({"error": "No input"}), file=sys.stderr)
        sys.exit(1)

    config = json.loads(raw)
    base_path = config["baseImagePath"]
    output_path = config["outputPath"]
    copy_text = config.get("copyText", "")
    sub_copy_text = config.get("subCopyText")
    tags = config.get("tags", [])
    layout_style = config.get("layoutStyle", "title-bottom")
    aspect_ratio = config.get("aspectRatio", "1:1")

    base = Image.open(base_path)
    result = apply_layout(base, copy_text, sub_copy_text, tags, layout_style, aspect_ratio)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    result.save(output_path, "PNG")

    print(json.dumps({"outputPath": output_path, "width": result.width, "height": result.height}))


if __name__ == "__main__":
    main()
