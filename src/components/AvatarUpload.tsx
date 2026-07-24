"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  currentUrl: string | null;
  initials: string;
  size?: number;
};

export default function AvatarUpload({ currentUrl, initials, size = 80 }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayed = preview ?? url;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Client-side preview immediately
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    setUploading(true);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setUrl(data.url);
      setPreview(null);
      URL.revokeObjectURL(objectUrl);
      // Refresh server components so the sidebar avatar updates too.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setPreview(null);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      await fetch("/api/upload/avatar", { method: "DELETE" });
      setUrl(null);
      setPreview(null);
      router.refresh();
    } catch {
      setError("Failed to remove photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-5">
      {/* Avatar circle */}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        title="Click to upload a profile photo"
        style={{ width: size, height: size }}
        className="group relative shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-slate-200 bg-indigo-100 transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        {displayed ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded blob avatar / local object-URL preview; next/image can't optimize these and would need remotePatterns config
          <img
            src={displayed}
            alt="Profile"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-xl font-bold text-indigo-600"
            aria-hidden
          >
            {initials}
          </span>
        )}

        {/* Camera overlay */}
        <span
          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        >
          {uploading ? (
            <svg className="h-6 w-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.04l-.821 1.314ZM12 15.75a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </svg>
          )}
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        aria-label="Upload profile photo"
        onChange={handleFile}
        disabled={uploading}
      />

      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">Profile photo</p>
        <p className="text-xs text-slate-500">JPEG, PNG, WebP or GIF · max 5 MB</p>
        <div className="mt-2 flex gap-3">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-auto p-0 text-xs"
          >
            {url || preview ? "Change photo" : "Upload photo"}
          </Button>
          {(url || preview) && !uploading && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={handleRemove}
              className="h-auto p-0 text-xs text-red-500 hover:text-red-500"
            >
              Remove
            </Button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
      </div>
    </div>
  );
}
