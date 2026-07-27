import { NextRequest, NextResponse } from "next/server";

import { generateProductAsset, generateAllProductAssets, listProductAssets } from "@/lib/services/hero-product-asset-service";
import { requireAuthenticatedAccessKeyId } from "@/lib/utils/api-auth";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const body = await request.json();
    const { productName, sourceImageUrl, assetType, generateAll, specs, ingredients, nutritionRows } = body;

    if (!productName || !sourceImageUrl) {
      return NextResponse.json({ error: "缺少 productName 或 sourceImageUrl" }, { status: 400 });
    }

    if (generateAll) {
      const assets = await generateAllProductAssets({
        productName,
        sourceImageUrl,
        specs,
        ingredients,
        nutritionRows,
        accessKeyId: auth.accessKeyId,
      });
      return NextResponse.json({ assets });
    }

    if (!assetType) {
      return NextResponse.json({ error: "缺少 assetType" }, { status: 400 });
    }

    const imageUrl = await generateProductAsset({
      productName,
      sourceImageUrl,
      assetType,
      specs,
      ingredients,
      nutritionRows,
      accessKeyId: auth.accessKeyId,
    });

    return NextResponse.json({ imageUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成素材失败";
    console.error("POST /api/hero-product-assets error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuthenticatedAccessKeyId(request);
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const productName = searchParams.get("productName") || undefined;
    const assets = await listProductAssets(productName, auth.accessKeyId);
    return NextResponse.json({ assets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取素材失败";
    console.error("GET /api/hero-product-assets error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
