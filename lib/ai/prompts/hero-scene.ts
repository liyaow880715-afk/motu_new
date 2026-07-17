export function buildWhiteBackgroundPrompt(productName: string, productDescription: string | undefined): string {
  return [
    "电商产品白底图，纯白背景（#FFFFFF），无阴影、无反光、无装饰。",
    productDescription ? `商品：${productName}。${productDescription}` : `商品：${productName}`,
    "",
    "要求：",
    "1. 完整保留商品主体，不要裁切",
    "2. 去除原图中的背景、文字、水印、标签",
    "3. 商品边缘清晰，与纯白背景干净分离",
    "4. 光影自然，像专业影棚白底图",
    "5. 适合作为电商主图抠图素材",
  ].join("\n");
}

export function buildHeroScenePrompt(
  productName: string,
  productDescription: string | undefined,
  scenePrompt: string,
  aspectRatio: string,
): string {
  return [
    "电商主图，严格保持参考商品图中的商品主体完全一致。",
    "参考图是白底商品图，请把商品自然融入到以下场景中。",
    `场景描述：${scenePrompt}`,
    "",
    productDescription ? `商品信息：${productName}。${productDescription}` : `商品：${productName}`,
    "",
    "要求：",
    "1. 商品必须清晰、完整、不变形，与原图一致",
    "2. 新背景的光影方向要与商品一致，融合自然",
    "3. 去除原白底，新场景背景要真实、协调",
    "4. 不要添加任何文字、标签、水印、边框",
    "5. 适合拼多多主图，能吸引点击",
    `6. 图片比例严格为 ${aspectRatio}`,
  ].join("\n");
}
