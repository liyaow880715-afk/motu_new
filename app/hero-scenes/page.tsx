"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { HeroSceneLibraryRecord } from "@/types/hero-scene";

const ASPECT_RATIOS = [
  { label: "1:1", value: "1:1" },
  { label: "3:4", value: "3:4" },
  { label: "4:3", value: "4:3" },
  { label: "16:9", value: "16:9" },
];

export default function HeroScenesPage() {
  const [scenes, setScenes] = useState<HeroSceneLibraryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [newScene, setNewScene] = useState({ name: "", category: "", scenePrompt: "", aspectRatio: "1:1" });

  const loadScenes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/hero-scenes");
      const data = await res.json();
      if (data.success) setScenes(data.data);
    } catch (error) {
      console.error(error);
      toast.error("加载场景失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScenes();
  }, [loadScenes]);

  const handleCreate = async () => {
    if (!newScene.name.trim() || !newScene.scenePrompt.trim()) {
      toast.error("请输入场景名称和描述");
      return;
    }
    try {
      const res = await fetch("/api/hero-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newScene),
      });
      const data = await res.json();
      if (data.success) {
        setScenes((prev) => [...prev, data.data]);
        setNewScene({ name: "", category: "", scenePrompt: "", aspectRatio: "1:1" });
        toast.success("场景已添加");
      } else {
        throw new Error(data.error?.message ?? "添加失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "添加失败");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/hero-scenes?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setScenes((prev) => prev.filter((s) => s.id !== id));
        toast.success("场景已删除");
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
        主图场景库
      </h1>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-4">
          <h2 className="font-medium">添加新场景</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>场景名称</Label>
              <Input
                value={newScene.name}
                onChange={(e) => setNewScene((s) => ({ ...s, name: e.target.value }))}
                placeholder="如：温馨家居"
              />
            </div>
            <div className="space-y-2">
              <Label>分类</Label>
              <Input
                value={newScene.category}
                onChange={(e) => setNewScene((s) => ({ ...s, category: e.target.value }))}
                placeholder="如：lifestyle"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>场景描述（Prompt）</Label>
            <Textarea
              value={newScene.scenePrompt}
              onChange={(e) => setNewScene((s) => ({ ...s, scenePrompt: e.target.value }))}
              placeholder="描述 AI 替换的背景场景，如：温馨居家场景，木质桌面，自然窗光..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>默认比例</Label>
            <div className="flex gap-2">
              {ASPECT_RATIOS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setNewScene((s) => ({ ...s, aspectRatio: r.value }))}
                  className={`px-3 py-1.5 text-xs border rounded-lg ${
                    newScene.aspectRatio === r.value ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-1" /> 添加场景
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scenes.map((scene) => (
            <Card key={scene.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{scene.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{scene.category} · {scene.aspectRatio}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(scene.id)}
                    className="text-red-500 hover:bg-red-50 p-1 rounded"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{scene.scenePrompt}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
