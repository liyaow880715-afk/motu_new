"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { assetTypeLabels } from "@/types/domain";

export type AssetKind = "MAIN" | "ANGLE" | "DETAIL" | "PACKAGING" | "LABEL";
export type LabelSubType = "nutrition" | "ingredient" | "both";

export interface PendingAsset {
  id: string;
  file: File;
  labelType?: LabelSubType;
}

interface QuickStartAssetUploaderProps {
  title: string;
  kind: AssetKind;
  assets: PendingAsset[];
  onChange: (assets: PendingAsset[]) => void;
  disabled?: boolean;
}

const kindLabels: Record<AssetKind, string> = {
  MAIN: assetTypeLabels.MAIN,
  ANGLE: assetTypeLabels.ANGLE,
  DETAIL: assetTypeLabels.DETAIL,
  PACKAGING: assetTypeLabels.PACKAGING,
  LABEL: "标签 / 成分图",
};

const labelTypeOptions: { value: LabelSubType; label: string }[] = [
  { value: "nutrition", label: "营养成分" },
  { value: "ingredient", label: "配料表" },
  { value: "both", label: "两者" },
];

export function QuickStartAssetUploader({
  title,
  kind,
  assets,
  onChange,
  disabled,
}: QuickStartAssetUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== Array.from(files).length) {
      toast.error("仅支持图片文件");
    }
    if (imageFiles.length === 0) return;

    const newAssets: PendingAsset[] = imageFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      labelType: kind === "LABEL" ? "both" : undefined,
    }));

    onChange([...assets, ...newAssets]);
  };

  const removeAsset = (id: string) => {
    onChange(assets.filter((asset) => asset.id !== id));
  };

  const moveAsset = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === assets.length - 1) return;
    const next = [...assets];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    onChange(next);
  };

  const updateLabelType = (id: string, labelType: LabelSubType) => {
    onChange(
      assets.map((asset) => (asset.id === id ? { ...asset, labelType } : asset)),
    );
  };

  return (
    <div
      className={`rounded-[1.25rem] border border-dashed p-4 transition-colors ${
        dragOver
          ? "border-primary bg-primary/5"
          : "border-slate-300 bg-white/50 dark:border-white/10 dark:bg-white/[0.03]"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">{title}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
          添加图片
        </Button>
      </div>

      <Input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      {assets.length === 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-xl py-6 text-slate-400 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed dark:hover:bg-white/[0.03]"
        >
          <UploadCloud className="mb-2 h-8 w-8" />
          <span className="text-xs">点击或拖拽图片到此处</span>
        </button>
      ) : (
        <div className="space-y-3">
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 dark:border-white/10 dark:bg-white/5"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900">
                <img
                  src={URL.createObjectURL(asset.file)}
                  alt={asset.file.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                  {asset.file.name}
                </p>
                {kind === "LABEL" && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {labelTypeOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-1 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <input
                          type="radio"
                          name={`label-type-${asset.id}`}
                          value={option.value}
                          checked={asset.labelType === option.value}
                          onChange={() => updateLabelType(asset.id, option.value)}
                          disabled={disabled}
                          className="h-3 w-3 accent-primary"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7"
                    disabled={disabled || index === 0}
                    onClick={() => moveAsset(index, "up")}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7"
                    disabled={disabled || index === assets.length - 1}
                    onClick={() => moveAsset(index, "down")}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 text-rose-500 hover:text-rose-600"
                  disabled={disabled}
                  onClick={() => removeAsset(asset.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { kindLabels };
