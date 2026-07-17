"use client";

import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw, Trash2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { HeroSceneExportRecord } from "@/types/hero-scene";

export default function HeroSceneExportsPage() {
  const [exports, setExports] = useState<HeroSceneExportRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadExports = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hero-scene-exports");
      const data = await res.json();
      if (data.success) setExports(data.data);
    } catch {
      toast.error("加载导出记录失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExports();
  }, [loadExports]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/hero-scene-exports?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setExports((prev) => prev.filter((e) => e.id !== id));
        toast.success("记录已删除");
      }
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" />
          场景裂变导出记录
        </h1>
        <Button size="sm" variant="outline" onClick={loadExports} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> 刷新
        </Button>
      </div>

      {exports.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            暂无导出记录
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exports.map((exp) => (
            <Card key={exp.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{exp.productName}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(exp.createdAt).toLocaleString()} · {exp.variantCount} 张图片
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => window.open(exp.zipFilePath, "_blank")}>
                    <Download className="h-4 w-4 mr-1" /> 下载
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(exp.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
