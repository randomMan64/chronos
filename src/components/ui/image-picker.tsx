"use client";

import * as React from "react";
import { UploadCloud, Image as ImageIcon, X, Trash2, Link2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export interface ImagePickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  maxSizeMB?: number;
  accept?: string;
}

export function ImagePicker({
  value,
  onChange,
  disabled = false,
  className,
  maxSizeMB = 5,
  accept = "image/png,image/jpeg,image/webp,image/gif,image/svg+xml",
}: ImagePickerProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = React.useState(false);
  const [urlInputValue, setUrlInputValue] = React.useState(
    value && !value.startsWith("data:") ? value : ""
  );

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (value && !value.startsWith("data:")) {
      setUrlInputValue(value);
    } else if (!value) {
      setUrlInputValue("");
    }
  }, [value]);

  const handleFile = (file: File) => {
    setError(null);

    // Validate type
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, WebP, GIF, SVG).");
      return;
    }

    // Validate size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`Image size exceeds ${maxSizeMB}MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === "string") {
        onChange(result);
        setShowUrlInput(false);
      }
    };
    reader.onerror = () => {
      setError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleRemove = () => {
    onChange("");
    setUrlInputValue("");
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleApplyUrl = () => {
    const trimmed = urlInputValue.trim();
    if (trimmed) {
      try {
        new URL(trimmed);
        onChange(trimmed);
        setError(null);
      } catch {
        setError("Please enter a valid URL (e.g. https://example.com/avatar.png)");
      }
    } else {
      onChange("");
    }
  };

  const hasImage = Boolean(value && value.trim().length > 0);

  return (
    <div className={cn("space-y-3 w-full", className)}>
      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        disabled={disabled}
        className="hidden"
        aria-label="Upload avatar image"
      />

      {hasImage ? (
        /* Image Preview State */
        <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-xl border border-border/80 bg-elevated/30">
          <div className="relative h-16 w-16 rounded-full overflow-hidden border-2 border-primary/40 bg-elevated shrink-0 shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value!}
              alt="Avatar preview"
              className="h-full w-full object-cover"
              onError={() => {
                setError("Could not load image from this URL.");
              }}
            />
          </div>

          <div className="flex-1 min-w-0 space-y-1 text-center sm:text-left">
            <div className="text-xs font-semibold text-foreground flex items-center justify-center sm:justify-start gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 text-primary" />
              <span>Image selected</span>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {value?.startsWith("data:")
                ? "Custom image uploaded via drag & drop"
                : value}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
              className="h-7 text-xs px-2.5 gap-1.5 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={handleRemove}
              className="h-7 text-xs px-2.5 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        /* Drag & Drop Upload Zone */
        <div
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !disabled && fileInputRef.current?.click()}
          className={cn(
            "group relative flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer select-none text-center",
            isDragging
              ? "border-primary bg-primary/10 ring-2 ring-primary/20 scale-[0.99]"
              : "border-border/80 bg-elevated/20 hover:bg-elevated/40 hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed pointer-events-none"
          )}
        >
          <div
            className={cn(
              "h-10 w-10 rounded-full border border-border flex items-center justify-center mb-2.5 transition-colors shadow-xs",
              isDragging
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-elevated text-muted-foreground group-hover:text-primary group-hover:border-primary/40"
            )}
          >
            <UploadCloud className="h-5 w-5" />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-foreground">
              <span className="text-primary font-semibold hover:underline">Click to upload</span> or drag and drop
            </p>
            <p className="text-[11px] text-muted-foreground">
              PNG, JPG, GIF, WebP, or SVG (max {maxSizeMB}MB)
            </p>
          </div>
        </div>
      )}

      {/* URL Toggle / Input */}
      <div className="pt-0.5">
        {!showUrlInput && !hasImage ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setShowUrlInput(true);
            }}
            className="text-[11px] text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <Link2 className="h-3 w-3" />
            <span>Or paste an image URL</span>
          </button>
        ) : showUrlInput ? (
          <div className="space-y-2 p-3 rounded-lg border border-border/70 bg-elevated/20">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Link2 className="h-3 w-3 text-primary" /> Image URL Link
              </span>
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                className="text-muted-foreground hover:text-foreground text-[11px] cursor-pointer"
              >
                Cancel
              </button>
            </div>
            <div className="flex gap-2">
              <Input
                type="url"
                value={urlInputValue}
                onChange={(e) => setUrlInputValue(e.target.value)}
                placeholder="https://example.com/avatar.png"
                className="h-8 text-xs font-mono bg-elevated/40"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleApplyUrl();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleApplyUrl}
                className="h-8 text-xs px-3 cursor-pointer shrink-0"
              >
                Apply
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Error Message */}
      {error && (
        <p className="text-[11px] text-destructive flex items-center gap-1 font-medium animate-in fade-in duration-150">
          <X className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}
