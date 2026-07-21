import type { ColorTokens } from "@/types/domain";

export interface CloudPalettePresetInput {
  name: string;
  description?: string | null;
  colorTokens: ColorTokens;
  tags?: string | null;
  category?: string | null;
  shareCode?: string | null;
}

export interface CloudPalettePreset {
  id: string;
  name: string;
  description: string | null;
  colorTokens: ColorTokens;
  tags: string | null;
  category: string | null;
  shareCode: string;
  createdAt: string;
}

function getCloudBaseUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = localStorage.getItem("bm_server_url");
  return url ? url.replace(/\/$/, "") : null;
}

function getAccessKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bm_access_key");
}

function cloudHeaders(): Record<string, string> {
  const key = getAccessKey();
  return key ? { "x-access-key": key } : {};
}

export function isCloudPaletteAvailable(): boolean {
  return Boolean(getCloudBaseUrl() && getAccessKey());
}

export async function createCloudPalettePreset(input: CloudPalettePresetInput): Promise<CloudPalettePreset | null> {
  const base = getCloudBaseUrl();
  if (!base || !isCloudPaletteAvailable()) return null;

  const res = await fetch(`${base}/api/palette-presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...cloudHeaders() },
    body: JSON.stringify(input),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.success ? (data.data.preset as CloudPalettePreset) : null;
}

export async function getCloudPalettePresetByShareCode(shareCode: string): Promise<CloudPalettePreset | null> {
  const base = getCloudBaseUrl();
  if (!base) return null;

  const res = await fetch(`${base}/api/palette-presets/${shareCode.toUpperCase()}`, {
    headers: cloudHeaders(),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.success ? (data.data.preset as CloudPalettePreset) : null;
}
