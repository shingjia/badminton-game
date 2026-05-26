'use client';

import { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

type Props = {
  initial: { siteName: string; siteIcon: string; siteIconImage: string | null };
};

export function BrandSettingsCard({ initial }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [siteName, setSiteName] = useState(initial.siteName);
  const [siteIcon, setSiteIcon] = useState(initial.siteIcon);
  const [siteIconImage, setSiteIconImage] = useState<string | null>(initial.siteIconImage);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dirty =
    siteName !== initial.siteName ||
    siteIcon !== initial.siteIcon ||
    siteIconImage !== initial.siteIconImage;
  const canSubmit = !submitting && dirty && siteName.trim() !== '' && siteIcon.trim() !== '';

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { filename: string };
      setSiteIconImage(data.filename);
      toast({ title: '已上傳，記得按儲存' });
    } catch (err: any) {
      toast({ title: '上傳失敗', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function removeImage() {
    setSiteIconImage(null);
  }

  async function save() {
    setSubmitting(true);
    try {
      await api('/api/admin/site-config', {
        method: 'PATCH',
        body: {
          siteName: siteName.trim(),
          siteIcon: siteIcon.trim(),
          siteIconImage,
        },
      });
      toast({ title: '已儲存' });
      window.location.reload();
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '儲存失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  const previewSrc = siteIconImage ? `/api/uploads/${siteIconImage}` : null;

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold">品牌設定</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="site-name">網站名稱</Label>
          <Input
            id="site-name"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            maxLength={30}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="site-icon">網站 icon emoji（後備）</Label>
          <Input
            id="site-icon"
            value={siteIcon}
            onChange={(e) => setSiteIcon(e.target.value)}
            maxLength={4}
            placeholder="🏸"
          />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <Label>網站 icon 圖片（上傳優先；無圖則用 emoji）</Label>
        <div className="flex items-center gap-3">
          {previewSrc ? (
            <img
              src={previewSrc}
              alt="目前 icon"
              className="h-12 w-12 rounded-full border object-cover"
            />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-2xl">
              {siteIcon}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFileSelected}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground"
            disabled={uploading}
          />
          {siteIconImage && (
            <Button variant="ghost" size="sm" onClick={removeImage} disabled={uploading}>
              移除圖片
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          支援 PNG / JPG / WebP，≤ 1MB。上傳後記得按下方「儲存」。
        </p>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={!canSubmit} size="sm">
          {submitting ? '儲存中…' : '儲存'}
        </Button>
      </div>
    </Card>
  );
}
