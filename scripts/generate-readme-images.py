#!/usr/bin/env python3
"""Generate README illustration images using Pillow."""

import os
from PIL import Image, ImageDraw, ImageFont


def get_font(size):
    candidates = [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/msyh.ttf",
        "C:/Windows/Fonts/simhei.ttf",
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


def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def draw_gradient(draw, width, height, color_top, color_bottom):
    top = hex_to_rgb(color_top)
    bottom = hex_to_rgb(color_bottom)
    for y in range(height):
        ratio = y / height
        r = int(top[0] * (1 - ratio) + bottom[0] * ratio)
        g = int(top[1] * (1 - ratio) + bottom[1] * ratio)
        b = int(top[2] * (1 - ratio) + bottom[2] * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))


def generate_hero_banner(output_path):
    width, height = 1600, 900
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    draw_gradient(draw, width, height, "1e1b4b", "312e81")

    title_font = get_font(96)
    subtitle_font = get_font(42)
    body_font = get_font(28)

    draw.text((width // 2, 220), "摹图 MoTu", fill=(255, 255, 255), font=title_font, anchor="mm")
    draw.text((width // 2, 340), "AI 电商内容生成工作台", fill=(200, 200, 255), font=subtitle_font, anchor="mm")
    draw.text((width // 2, 420), "v0.8.0 · 详情页 · 主图裂变 · 产品素材 · AI 工作流", fill=(180, 180, 230), font=body_font, anchor="mm")

    features = [
        "AI 商品分析",
        "详情页生成",
        "场景裂变",
        "产品素材",
        "人在环路",
        "店铺分发",
    ]

    box_w, box_h = 220, 70
    start_x = (width - len(features) * box_w - (len(features) - 1) * 30) // 2
    y = 560
    colors = ["3b82f6", "8b5cf6", "10b981", "f59e0b", "ef4444", "06b6d4"]
    for i, text in enumerate(features):
        x = start_x + i * (box_w + 30)
        draw.rounded_rectangle([x, y, x + box_w, y + box_h], radius=16, fill=hex_to_rgb(colors[i]))
        draw.text((x + box_w // 2, y + box_h // 2), text, fill=(255, 255, 255), font=get_font(24), anchor="mm")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path)
    print(f"Saved {output_path}")


def generate_workflow_stages(output_path):
    width, height = 1600, 400
    img = Image.new("RGB", (width, height), (250, 250, 252))
    draw = ImageDraw.Draw(img)

    stages = [
        "上传原图",
        "信息识别",
        "生成策略",
        "白底图",
        "场景底图",
        "文案生成",
        "裂变变体",
        "产品素材",
        "质量审查",
        "导出 ZIP",
    ]

    box_w, box_h = 130, 70
    gap = 24
    start_x = (width - len(stages) * box_w - (len(stages) - 1) * gap) // 2
    y = (height - box_h) // 2

    for i, text in enumerate(stages):
        x = start_x + i * (box_w + gap)
        color = "4f46e5" if i == 0 or i == len(stages) - 1 else "6366f1"
        draw.rounded_rectangle([x, y, x + box_w, y + box_h], radius=12, fill=hex_to_rgb(color))
        draw.text((x + box_w // 2, y + box_h // 2), text, fill=(255, 255, 255), font=get_font(18), anchor="mm")
        if i < len(stages) - 1:
            arrow_x = x + box_w + gap // 2
            draw.polygon([(arrow_x - 6, y + box_h // 2 - 6), (arrow_x + 6, y + box_h // 2), (arrow_x - 6, y + box_h // 2 + 6)], fill=hex_to_rgb("9ca3af"))

    title_font = get_font(36)
    draw.text((width // 2, 80), "AI 工作流：上传一张图，自动跑完全程", fill=(30, 30, 30), font=title_font, anchor="mm")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path)
    print(f"Saved {output_path}")


def generate_feature_grid(output_path):
    width, height = 1600, 900
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)

    title_font = get_font(48)
    draw.text((width // 2, 60), "核心能力", fill=(30, 30, 30), font=title_font, anchor="mm")

    features = [
        ("详情页生成", "AI 分析商品图片\n生成结构化详情页", "3b82f6"),
        ("场景裂变", "白底图 + 多场景\n批量生成主图变体", "8b5cf6"),
        ("产品素材", "规格图 / 成分图\n营养成分表 / 白底图", "10b981"),
        ("AI 工作流", "人在环路\n关键节点人工微调", "f59e0b"),
    ]

    card_w, card_h = 340, 280
    gap = 40
    start_x = (width - len(features) * card_w - (len(features) - 1) * gap) // 2
    y = 180

    for i, (title, desc, color) in enumerate(features):
        x = start_x + i * (card_w + gap)
        draw.rounded_rectangle([x, y, x + card_w, y + card_h], radius=20, fill=hex_to_rgb("f8fafc"), outline=hex_to_rgb("e2e8f0"), width=2)
        draw.rounded_rectangle([x + 20, y + 20, x + card_w - 20, y + 80], radius=12, fill=hex_to_rgb(color))
        draw.text((x + card_w // 2, y + 50), title, fill=(255, 255, 255), font=get_font(28), anchor="mm")
        draw.text((x + card_w // 2, y + 160), desc, fill=(60, 60, 60), font=get_font(22), anchor="mm", spacing=8)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path)
    print(f"Saved {output_path}")


if __name__ == "__main__":
    base_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "docs", "images")
    generate_hero_banner(os.path.join(base_dir, "hero-banner.png"))
    generate_workflow_stages(os.path.join(base_dir, "workflow-stages.png"))
    generate_feature_grid(os.path.join(base_dir, "feature-grid.png"))
