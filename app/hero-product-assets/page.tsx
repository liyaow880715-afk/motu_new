"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, Package, Upload, FileImage, FlaskConical, Apple, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

interface AssetResult {
  type: "white-bg" | "spec" | "ingredient" | "nutrition";
  imageUrl: string;
  label: string;
  icon: React.ReactNode;
}

export default function HeroProductAssetsPage() {
  const [productImage, setProductImage] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [specsText, setSpecsText] = useState("");
  const [ingredientsText, setIngredientsText] = useState("");
  const [nutritionText, setNutritionText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [assets, setAssets] = useState<AssetResult[]>([]);

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFile(file);
    setProductImage(dataUrl);
  };

  const parseSpecs = (text: string): { label: string; value: string }[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, value] = line.split(/[:：]/, 2);
        return { label: (label ?? line).trim(), value: (value ?? "-").trim() };
      });
  };

  const parseIngredients = (text: string): string[] => {
    return text
      .split(/[\n,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const parseNutrition = (text: string): { label: string; value: string; unit: string }[] => {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, rest] = line.split(/[:：]/, 2);
        const valueMatch = (rest ?? "").match(/^([\d.]+)\s*(.*)$/);
        return {
          label: (label ?? line).trim(),
          value: (valueMatch?.[1] ?? (rest ?? "").trim()) || "-",
          unit: valueMatch?.[2]?.trim() ?? "",
        };
      });
  };

  const handleGenerateAll = async () => {
    if (!productImage) {
      toast.error("请上传商品原图");
      return;
    }
    if (!productName.trim()) {
      toast.error("请输入商品名称");
      return;
    }

    setGenerating(true);
    setAssets([]);
    try {
      const res = await fetch("/api/hero-product-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          sourceImageUrl: productImage,
          generateAll: true,
          specs: parseSpecs(specsText),
          ingredients: parseIngredients(ingredientsText),
          nutritionRows: parseNutrition(nutritionText),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const resultAssets: AssetResult[] = [
        { type: "white-bg", imageUrl: data.assets["white-bg"], label: "白底图", icon: <FileImage className="h-4 w-4" /> },
        { type: "spec", imageUrl: data.assets.spec, label: "规格图", icon: <Scale className="h-4 w-4" /> },
        { type: "ingredient", imageUrl: data.assets.ingredient, label: "成分图", icon: <FlaskConical className="h-4 w-4" /> },
        { type: "nutrition", imageUrl: data.assets.nutrition, label: "营养成分表", icon: <Apple className="h-4 w-4" /> },
      ];
      setAssets(resultAssets);
      toast.success("素材生成完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const loadExisting = useCallback(async () => {
    if (!productName.trim()) return;
    try {
      const res = await fetch(`/api/hero-product-assets?productName=${encodeURIComponent(productName)}`);
      const data = await res.json();
      if (data.error) return;
      const typeMap: Record<string, string> = {
        "white-bg": "白底图",
        spec: "规格图",
        ingredient: "成分图",
        nutrition: "营养成分表",
      };
      const iconMap: Record<string, React.ReactNode> = {
        "white-bg": <FileImage className="h-4 w-4" />,
        spec: <Scale className="h-4 w-4" />,
        ingredient: <FlaskConical className="h-4 w-4" />,
        nutrition: <Apple className="h-4 w-4" />,
      };
      setAssets(
        data.assets.map((a: { type: string; imageUrl: string }) => ({
          type: a.type,
          imageUrl: a.imageUrl,
          label: typeMap[a.type] || a.type,
          icon: iconMap[a.type] || <FileImage className="h-4 w-4" />,
        })),
      );
    } catch {
      // ignore
    }
  }, [productName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadExisting();
    }, 500);
    return () => clearTimeout(timer);
  }, [loadExisting]);

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Package className="h-6 w-6" />
        产品素材生成
      </h1>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="space-y-2">
                <Label>商品原图</Label>
                <div className="border-2 border-dashed rounded-xl p-4 text-center">
                  <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" id="product-image" />
                  <label htmlFor="product-image" className="cursor-pointer block">
                    {productImage ? (
                      <img src={productImage} alt="商品" className="h-48 w-full object-contain rounded-lg" />
                    ) : (
                      <>
                        <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                        <p className="mt-2 text-sm text-muted-foreground">点击上传商品原图</p>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>商品名称</Label>
                <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="如：红色保温杯" />
              </div>

              <div className="space-y-2">
                <Label>产品规格</Label>
                <Textarea
                  value={specsText}
                  onChange={(e) => setSpecsText(e.target.value)}
                  rows={4}
                  placeholder="每行一项，格式：规格名：值&#10;例如：&#10;容量：500ml&#10;材质：304不锈钢"
                />
              </div>

              <div className="space-y-2">
                <Label>成分/配料</Label>
                <Textarea
                  value={ingredientsText}
                  onChange={(e) => setIngredientsText(e.target.value)}
                  rows={3}
                  placeholder="可用换行、逗号或顿号分隔，如：水、白砂糖、柠檬酸"
                />
              </div>

              <div className="space-y-2">
                <Label>营养成分</Label>
                <Textarea
                  value={nutritionText}
                  onChange={(e) => setNutritionText(e.target.value)}
                  rows={4}
                  placeholder="每行一项，格式：项目：数值 单位&#10;例如：&#10;能量：200 kJ&#10;蛋白质：3.2 g"
                />
              </div>

              <Button onClick={handleGenerateAll} disabled={generating} className="w-full">
                {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Package className="h-4 w-4 mr-1" />}
                一键生成 4 张素材
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-3">已生成素材</h3>
              {assets.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <FileImage className="mx-auto h-10 w-10 mb-2 opacity-50" />
                  左侧填写信息并点击生成
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assets.map((asset) => (
                    <div key={asset.type} className="border rounded-lg overflow-hidden bg-muted">
                      <div className="p-2 flex items-center gap-2 text-sm font-medium border-b bg-background">
                        {asset.icon}
                        {asset.label}
                      </div>
                      {asset.imageUrl ? (
                        <img src={asset.imageUrl} alt={asset.label} className="h-64 w-full object-contain bg-white" />
                      ) : (
                        <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">生成失败</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
