#!/usr/bin/env python3
"""Compose hero product assets: white-bg, spec, ingredient, nutrition facts.

Reads JSON from stdin and writes JSON to stdout.
Input keys:
  productName (str)
  assetType (str): white-bg | spec | ingredient | nutrition
  imagePath (str, optional): path to product image to use as base/overlay
  specs (list of {label, value}, optional)
  ingredients (list of str, optional)
  nutritionRows (list of {label, value, unit}, optional)
  outputPath (str): where to save PNG
  width, height (int): defaults 1024
"""

import json
import os
import sys
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont


def load_image(path_or_url):
    if path_or_url.startswith("data:"):
        import base64
        data = path_or_url.split(",")[-1]
        return Image.open(BytesIO(base64.b64decode(data))).convert("RGBA")
    if path_or_url.startswith("http"):
        import urllib.request
        req = urllib.request.Request(path_or_url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return Image.open(BytesIO(r.read())).convert("RGBA")
    return Image.open(path_or_url).convert("RGBA")


def get_font(size):
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/msyh.ttf",
        "C:/Windows/Fonts/simhei.ttf",
        "C:/Windows/Fonts/simsun.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ]
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


def hex_to_rgba(hex_color, alpha=255):
    hex_color = hex_color.lstrip("#")
    if len(hex_color) == 6:
        r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    elif len(hex_color) == 3:
        r, g, b = int(hex_color[0] * 2, 16), int(hex_color[1] * 2, 16), int(hex_color[2] * 2, 16)
    else:
        r, g, b = 0, 0, 0
    return (r, g, b, alpha)


def draw_rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def wrap_text(draw, text, font, max_width):
    """Simple word/character wrap for CJK and latin text."""
    lines = []
    current = ""
    for char in text:
        test = current + char
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def composite_white_bg(image_path, output_path, width, height):
    canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    if image_path:
        img = load_image(image_path)
        img.thumbnail((width - 80, height - 80), Image.Resampling.LANCZOS)
        x = (width - img.width) // 2
        y = (height - img.height) // 2
        canvas.paste(img, (x, y), img)

    title_font = get_font(48)
    # Product name placeholder text is not rendered; caller overlays text later.
    canvas.save(output_path)
    return output_path


def composite_spec(specs, output_path, width, height, product_name=""):
    canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Header
    header_h = 120
    draw.rectangle([0, 0, width, header_h], fill=(245, 245, 245, 255))
    title_font = get_font(56)
    subtitle_font = get_font(28)
    draw.text((40, 30), product_name or "产品规格", fill=(30, 30, 30, 255), font=title_font)
    draw.text((40, 90), "PRODUCT SPECIFICATIONS", fill=(120, 120, 120, 255), font=subtitle_font)

    # Spec rows
    y = header_h + 50
    row_h = 90
    label_font = get_font(32)
    value_font = get_font(36)
    col_x = width // 2

    for i, spec in enumerate(specs or []):
        label = spec.get("label", "")
        value = spec.get("value", "")
        if i % 2 == 0:
            draw.rectangle([0, y, width, y + row_h], fill=(250, 250, 250, 255))
        draw.text((40, y + 20), label, fill=(80, 80, 80, 255), font=label_font)
        draw.text((col_x, y + 18), value, fill=(30, 30, 30, 255), font=value_font)
        y += row_h
        if y + row_h > height - 40:
            break

    canvas.save(output_path)
    return output_path


def composite_ingredient(ingredients, output_path, width, height, product_name=""):
    canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    header_h = 120
    draw.rectangle([0, 0, width, header_h], fill=(245, 245, 245, 255))
    title_font = get_font(56)
    subtitle_font = get_font(28)
    draw.text((40, 30), product_name or "产品成分", fill=(30, 30, 30, 255), font=title_font)
    draw.text((40, 90), "INGREDIENTS", fill=(120, 120, 120, 255), font=subtitle_font)

    y = header_h + 60
    font = get_font(36)
    line_h = 56
    max_width = width - 80

    for ing in ingredients or []:
        lines = wrap_text(draw, "• " + ing, font, max_width)
        for line in lines:
            draw.text((40, y), line, fill=(40, 40, 40, 255), font=font)
            y += line_h
            if y + line_h > height - 40:
                break
        if y + line_h > height - 40:
            break

    canvas.save(output_path)
    return output_path


def composite_nutrition(nutrition_rows, output_path, width, height, product_name=""):
    canvas = Image.new("RGBA", (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    header_h = 140
    draw.rectangle([0, 0, width, header_h], fill=(245, 245, 245, 255))
    title_font = get_font(56)
    subtitle_font = get_font(28)
    draw.text((40, 30), product_name or "营养成分表", fill=(30, 30, 30, 255), font=title_font)
    draw.text((40, 90), "NUTRITION FACTS", fill=(120, 120, 120, 255), font=subtitle_font)

    # Table header
    y = header_h + 40
    row_h = 70
    col_label_x = 40
    col_value_x = width - 300
    col_unit_x = width - 120
    header_font = get_font(32)
    row_font = get_font(34)

    draw.rectangle([0, y, width, y + row_h], fill=(230, 230, 230, 255))
    draw.text((col_label_x, y + 15), "项目", fill=(40, 40, 40, 255), font=header_font)
    draw.text((col_value_x, y + 15), "含量", fill=(40, 40, 40, 255), font=header_font)
    draw.text((col_unit_x, y + 15), "单位", fill=(40, 40, 40, 255), font=header_font)
    y += row_h

    for i, row in enumerate(nutrition_rows or []):
        if i % 2 == 0:
            draw.rectangle([0, y, width, y + row_h], fill=(250, 250, 250, 255))
        draw.text((col_label_x, y + 15), row.get("label", ""), fill=(50, 50, 50, 255), font=row_font)
        draw.text((col_value_x, y + 15), str(row.get("value", "")), fill=(50, 50, 50, 255), font=row_font)
        draw.text((col_unit_x, y + 15), row.get("unit", ""), fill=(50, 50, 50, 255), font=row_font)
        y += row_h
        if y + row_h > height - 40:
            break

    canvas.save(output_path)
    return output_path


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}), file=sys.stdout)
        sys.exit(1)

    asset_type = data.get("assetType", "white-bg")
    output_path = data.get("outputPath")
    width = int(data.get("width", 1024))
    height = int(data.get("height", 1024))
    product_name = data.get("productName", "")

    if not output_path:
        print(json.dumps({"success": False, "error": "outputPath is required"}), file=sys.stdout)
        sys.exit(1)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    try:
        if asset_type == "white-bg":
            path = composite_white_bg(data.get("imagePath"), output_path, width, height)
        elif asset_type == "spec":
            path = composite_spec(data.get("specs", []), output_path, width, height, product_name)
        elif asset_type == "ingredient":
            path = composite_ingredient(data.get("ingredients", []), output_path, width, height, product_name)
        elif asset_type == "nutrition":
            path = composite_nutrition(data.get("nutritionRows", []), output_path, width, height, product_name)
        else:
            print(json.dumps({"success": False, "error": f"Unsupported assetType: {asset_type}"}), file=sys.stdout)
            sys.exit(1)

        print(json.dumps({"success": True, "outputPath": path}), file=sys.stdout)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stdout)
        sys.exit(1)


if __name__ == "__main__":
    main()
