"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { HeroCopyLibraryRecord } from "@/types/hero-scene";

export default function HeroCopiesPage() {
  const [libraries, setLibraries] = useState<HeroCopyLibraryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLibrary, setNewLibrary] = useState({ name: "", category: "", copies: "" });
  const [productName, setProductName] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadLibraries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hero-copies");
      const data = await res.json();
      if (data.success) setLibraries(data.data);
    } catch {
      toast.error("加载文案库失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibraries();
  }, [loadLibraries]);

  const handleCreate = async () => {
    if (!newLibrary.name.trim()) {
      toast.error("请输入文案组名称");
      return;
    }
    try {
      const copies = newLibrary.copies.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/hero-copies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newLibrary, copies }),
      });
      const data = await res.json();
      if (data.success) {
        setLibraries((prev) => [...prev, data.data]);
        setNewLibrary({ name: "", category: "", copies: "" });
        toast.success("文案组已添加");
      } else {
        throw new Error(data.error?.message ?? "添加失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
    }
  };

  const handleGenerate = async () => {
    if (!productName.trim()) {
      toast.error("请输入商品名称");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/hero-copies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", productName, productDescription: productDesc }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data.copies)) {
        setNewLibrary((prev) => ({
          ...prev,
          copies: [prev.copies, ...data.data.copies].filter(Boolean).join("\n"),
        }));
        toast.success(`已生成 ${data.data.copies.length} 条文案`);
      } else {
        throw new Error(data.error?.message ?? "生成失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/hero-copies?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setLibraries((prev) => prev.filter((l) => l.id !== id));
        toast.success("文案组已删除");
      } else {
        throw new Error(data.error?.message ?? "删除失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <div className="container mx-auto max-w-5xl py-8 px-4">
      <h1 className="text-2xl font-bold flex items-center gap-2 mb-6">
        <Sparkles className="h-6 w-6" />
        主图文案库
      </h1>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <h2 className="font-medium">AI 生成文案</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="商品名称"
            />
            <Input
              value={productDesc}
              onChange={(e) => setProductDesc(e.target.value)}
              placeholder="商品描述（可选）"
            />
          </div>
          <Button onClick={handleGenerate} disabled={generating} variant="outline">
            {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Wand2 className="h-4 w-4 mr-1" />}
            生成文案
          </Button>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <h2 className="font-medium">添加文案组</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              value={newLibrary.name}
              onChange={(e) => setNewLibrary((l) => ({ ...l, name: e.target.value }))}
              placeholder="文案组名称"
            />
            <Input
              value={newLibrary.category}
              onChange={(e) => setNewLibrary((l) => ({ ...l, category: e.target.value }))}
              placeholder="分类"
            />
          </div>
          <div className="space-y-2">
            <Label>文案列表（每行一条）</Label>
            <Textarea
              value={newLibrary.copies}
              onChange={(e) => setNewLibrary((l) => ({ ...l, copies: e.target.value }))}
              rows={6}
              placeholder="限时特惠\n买一送一\n工厂直发"
            />
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" /> 保存文案组
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {libraries.map((lib) => (
            <Card key={lib.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{lib.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{lib.category} · {lib.copies.length} 条</p>
                  </div>
                  <button
                    onClick={() => handleDelete(lib.id)}
                    className="text-red-500 hover:bg-red-50 p-1 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {lib.copies.slice(0, 8).map((copy, idx) => (
                    <span key={idx} className="text-xs bg-muted px-2 py-0.5 rounded">{copy}</span>
                  ))}
                  {lib.copies.length > 8 && (
                    <span className="text-xs text-muted-foreground">+{lib.copies.length - 8}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
