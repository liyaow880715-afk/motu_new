export function buildHeroScenePrompt(
  productName: string,
  productDescription: string | undefined,
  scenePrompt: string,
  aspectRatio: string,
): string {
  return [
    "电商主图，严格保持参考商品图中的商品主体完全一致。",
    "不要改变商品的颜色、形状、角度、大小和材质。",
    `仅把背景替换为以下场景：${scenePrompt}`,
    "",
    productDescription ? `商品信息：${productName}。${productDescription}` : `商品：${productName}`,
    "",
    "要求：",
    "1. 商品必须清晰、完整、不变形",
    "2. 新背景的光影方向要与商品一致，融合自然",
    "3. 无明显拼接痕迹，像真实拍摄",
    "4. 适合拼多多主图，能吸引点击",
    `5. 图片比例严格为 ${aspectRatio}`,
    "6. 不要添加任何文字、标签、水印、边框",
  ].join("\n");
}
