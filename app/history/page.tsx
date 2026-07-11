"use client";

import { useEffect, useState } from "react";
import { Loader2, ImageIcon, Trash2, Download } from "lucide-react";

import { RecentProjectList } from "@/components/projects/recent-project-list";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  platform: string;
  style: string;
  sectionCount: number;
  updatedAt: string;
  coverImageUrl?: string | null;
}

interface HeroBatchItem {
  id: string;
  fileName: string;
  url: string;
  createdAt: string;
  size: number;
}

function loadStoredKey(): string | null {
  try {
    return localStorage.getItem("bm_access_key");
  } catch {
    return null;
  }
}

function loadStoredAdminSecret(): string | null {
  try {
    return localStorage.getItem("motu_admin_secret");
  } catch {
    return null;
  }
}

export default function HistoryPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroItems, setHeroItems] = useState<HeroBatchItem[]>([]);
  const [heroLoading, setHeroLoading] = useState(true);

  const authHeaders = () => {
    const headers: Record<string, string> = {};
    const secret = loadStoredAdminSecret();
    if (secret) headers["x-admin-secret"] = secret;
    return headers;
  };

  const loadHeroHistory = () => {
    setHeroLoading(true);
    fetch("/api/hero-batch/history?limit=50")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data?.items)) {
          setHeroItems(data.data.items);
        }
      })
      .finally(() => setHeroLoading(false));
  };

  useEffect(() => {
    const key = loadStoredKey();
    fetch("/api/projects", {
      headers: key ? { "x-access-key": key } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
        }
      })
      .finally(() => setLoading(false));

    loadHeroHistory();
  }, []);

  const handleDeleteHero = async (id: string) => {
    try {
      const res = await fetch(`/api/hero-batch/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setHeroItems((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete hero batch item:", error);
    }
  };

  const handleDownloadHero = async (item: HeroBatchItem) => {
    try {
      const res = await fetch(item.url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = item.fileName;
      a.click();
    } catch {
      console.error("Failed to download hero batch item");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="历史记录"
        title="最近项目"
        description="按作品墙方式查看已有项目，快速回到分析、规划、编辑或删除不再需要的内容。"
      />

      <Card>
        <CardHeader>
          <CardTitle>项目历史</CardTitle>
          <CardDescription>这里集中展示当前账号下的全部历史项目。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <RecentProjectList initialProjects={projects} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            主图批量历史
          </CardTitle>
          <CardDescription>展示批量主图生成器保存到本地的图片。</CardDescription>
        </CardHeader>
        <CardContent>
          {heroLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : heroItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">暂无主图批量历史</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {heroItems.map((item) => (
                <div key={item.id} className="group relative overflow-hidden rounded-lg border bg-muted">
                  <img src={item.url} alt={item.fileName} className="h-32 w-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadHero(item)}
                      className="rounded-full bg-white p-1.5 text-black hover:bg-white/90"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteHero(item.id)}
                      className="rounded-full bg-red-500 p-1.5 text-white hover:bg-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] text-muted-foreground truncate" title={item.fileName}>{item.fileName}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
