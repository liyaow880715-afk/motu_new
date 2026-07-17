"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { HeroSceneVariantRecord } from "@/types/hero-scene";

export default function HeroVariantsPage() {
  const [variants, setVariants] = useState<HeroSceneVariantRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    try {
      // Load from all generations by fetching generations with variants
      const res = await fetch("/api/hero-scene-generations");
      const data = await res.json();
      if (data.success) {
        const allVariants: HeroSceneVariantRecord[] = [];
        for (const gen of data.data) {
          const vRes = await fetch(`/api/hero-scene-variants?generationId=${gen.id}`);
          const vData = await vRes.json();
          if (vData.success) allVariants.push(...vData.data);
        }
        setVariants(allVariants);
      }
    } catch {
      toast.error("加载变体失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVariants();
  }, [loadVariants]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/hero-scene-variants?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setVariants((prev) => prev.filter((v) => v.id !== id));
        toast.success("变体已删除");
      }
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">裂变变体库</h1>
        <Button size="sm" variant="outline" onClick={loadVariants} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> 刷新
        </Button>
      </div>

      {variants.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <ImageIcon className="mx-auto h-12 w-12 mb-4 opacity-50" />
            暂无变体，请到 AI 场景裂变工作台生成
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {variants.map((variant) => (
            <Card key={variant.id} className="overflow-hidden group">
              <div className="aspect-square bg-muted relative">
                {variant.status === "COMPLETED" && variant.variantImageUrl ? (
                  <img src={variant.variantImageUrl} alt={variant.copyText} className="h-full w-full object-cover" />
                ) : variant.status === "FAILED" ? (
                  <div className="h-full flex items-center justify-center text-xs text-red-500 p-2 text-center">失败</div>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                <button
                  onClick={() => handleDelete(variant.id)}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <CardContent className="p-2">
                <p className="text-[10px] text-muted-foreground truncate">{variant.copyText}</p>
                <p className="text-[10px] text-muted-foreground">{variant.layoutStyle}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
