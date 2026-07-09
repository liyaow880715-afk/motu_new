"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Trash2, ShieldCheck, Layers, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import type { HeroTemplateRecord } from "@/types/hero-template";

const ADMIN_SECRET_KEY = "motu_admin_secret";

export default function HeroTemplatesPage() {
  const [adminSecret, setAdminSecret] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(ADMIN_SECRET_KEY) || "";
  });
  const [adminInput, setAdminInput] = useState("");
  const [templates, setTemplates] = useState<HeroTemplateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const authHeaders = (extra: Record<string, string> = {}) => {
    const headers: Record<string, string> = { "Content-Type": "application/json", ...extra };
    if (adminSecret) headers["x-admin-secret"] = adminSecret;
    return headers;
  };

  const saveAdminSecret = () => {
    const value = adminInput.trim();
    if (!value) {
      toast.error("请输入管理员密码");
      return;
    }
    localStorage.setItem(ADMIN_SECRET_KEY, value);
    setAdminSecret(value);
    toast.success("管理员密码已保存");
  };

  const fetchTemplates = async () => {
    if (!adminSecret) return;
    setLoading(true);
    try {
      const res = await fetch("/api/hero-templates", { headers: authHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setTemplates(data.data);
      } else {
        throw new Error(data.error?.message ?? "加载失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminSecret]);

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个模板吗？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/hero-templates/${id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
        toast.success("已删除模板");
      } else {
        throw new Error(data.error?.message ?? "删除失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-6xl py-8 px-4">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            主图模板库
          </h1>
          <p className="text-muted-foreground mt-1">
            管理已保存的主图套版模板，在批量主图中快速套用
          </p>
        </div>
        <Link href="/hero-batch">
          <Button variant="outline">去批量生成</Button>
        </Link>
      </div>

      {!adminSecret ? (
        <Card>
          <CardContent className="p-6 max-w-md space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-sm">需要管理员密码才能查看模板库</p>
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="输入管理员密码"
                value={adminInput}
                onChange={(e) => setAdminInput(e.target.value)}
              />
              <Button onClick={saveAdminSecret}>验证</Button>
            </div>
            <p className="text-xs text-muted-foreground">桌面端可跳过此步骤</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card className="py-16">
          <CardContent className="text-center text-muted-foreground space-y-4">
            <AlertCircle className="mx-auto h-10 w-10" />
            <p>还没有保存的主图模板</p>
            <Link href="/hero-batch">
              <Button variant="outline" size="sm">去批量主图上传并保存</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="overflow-hidden">
              <div className="aspect-[4/3] bg-muted">
                <img
                  src={t.referenceImageUrl}
                  alt={t.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm line-clamp-1">{t.name}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500"
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                  >
                    {deletingId === t.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {t.structureJson.overallStyle}
                </p>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(t.structureJson.colorPalette).map(([key, color]) => (
                    <div key={key} className="flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]">
                      <span
                        className="inline-block h-3 w-3 rounded-full border"
                        style={{ backgroundColor: color as string }}
                      />
                      <span className="text-muted-foreground">{key}</span>
                    </div>
                  ))}
                </div>
                <Link href={`/hero-batch?templateId=${t.id}`}>
                  <Button size="sm" variant="outline" className="w-full mt-2">
                    套用此模板
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
