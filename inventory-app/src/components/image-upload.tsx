"use client";

import { useRef, useState } from "react";

import { Label } from "@/components/ui";

type Props = {
  /** Form field name — the resulting data URL (or external URL) is submitted under this. */
  name: string;
  label: string;
  /** Existing value: a data URL or an external image URL. */
  defaultValue?: string | null;
  /** Longest edge of the stored image, in px. Larger images are scaled down. */
  maxDim?: number;
  /** Output format. PNG preserves transparency (logos); JPEG is smaller (photos). */
  format?: "image/png" | "image/jpeg";
  /** JPEG quality 0–1 (ignored for PNG). */
  quality?: number;
  /** Square preview (logos) vs wide (photos). */
  shape?: "square" | "wide";
  /** Also allow pasting an external image URL instead of uploading a file. */
  allowUrl?: boolean;
  helpText?: string;
};

const MAX_OUTPUT_BYTES = 700_000; // guard against storing huge data URLs

// Resize an image file to a compact data URL using a canvas.
async function fileToResizedDataUrl(
  file: File,
  maxDim: number,
  format: "image/png" | "image/jpeg",
  quality: number,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Could not load image"));
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  // White matte for JPEG (no alpha); keep transparency for PNG.
  if (format === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL(format, quality);
}

export function ImageUpload({
  name,
  label,
  defaultValue,
  maxDim = 600,
  format = "image/jpeg",
  quality = 0.82,
  shape = "wide",
  allowUrl = false,
  helpText,
}: Props) {
  const [value, setValue] = useState<string>(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      let url = await fileToResizedDataUrl(file, maxDim, format, quality);
      // If a PNG came out too large, fall back to JPEG to keep the row small.
      if (url.length > MAX_OUTPUT_BYTES && format === "image/png") {
        url = await fileToResizedDataUrl(file, maxDim, "image/jpeg", 0.82);
      }
      if (url.length > MAX_OUTPUT_BYTES) {
        setError("Image is too large even after compression — try a smaller one.");
      } else {
        setValue(url);
      }
    } catch {
      setError("Could not process that image.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const previewBox =
    shape === "square" ? "h-24 w-24" : "h-24 w-40";

  return (
    <div>
      <Label htmlFor={`${name}-file`}>
        {label} <span className="text-neutral-400 font-normal">(optional)</span>
      </Label>
      {/* The value actually submitted with the form. */}
      <input type="hidden" name={name} value={value} />

      <div className="flex items-center gap-3 mt-1">
        <div
          className={`${previewBox} shrink-0 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 overflow-hidden flex items-center justify-center`}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="preview" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-xs text-neutral-400">No image</span>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            id={`${name}-file`}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="hidden"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="h-9 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {busy ? "Processing…" : value ? "Change image" : "Upload image"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => setValue("")}
                disabled={busy}
                className="h-9 px-3 rounded-md text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
          {allowUrl && (
            <input
              type="url"
              inputMode="url"
              placeholder="or paste an image URL (https://…)"
              value={value.startsWith("data:") ? "" : value}
              onChange={(e) => setValue(e.target.value.trim())}
              className="h-9 w-full rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-3 text-sm"
            />
          )}
          {helpText && <p className="text-xs text-neutral-500">{helpText}</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
