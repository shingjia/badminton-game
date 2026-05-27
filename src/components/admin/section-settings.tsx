'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Tournament } from '@prisma/client';

const BANNER_COLORS = [
  { key: 'red', cls: 'bg-red-700' },
  { key: 'blue', cls: 'bg-blue-700' },
  { key: 'green', cls: 'bg-emerald-700' },
  { key: 'purple', cls: 'bg-purple-700' },
  { key: 'orange', cls: 'bg-orange-600' },
  { key: 'slate', cls: 'bg-slate-700' },
] as const;

export function SectionSettings({ tournament }: { tournament: Tournament }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState(tournament.name);
  const [groupCount, setGroupCount] = useState(tournament.groupCount);
  const [pointsPerGame, setPointsPerGame] = useState(tournament.pointsPerGame);
  const [bannerIcon, setBannerIcon] = useState(tournament.bannerIcon);
  const [bannerColor, setBannerColor] = useState(tournament.bannerColor);
  const [bannerIconImage, setBannerIconImage] = useState<string | null>(tournament.bannerIconImage);
  const [bannerTagline, setBannerTagline] = useState(tournament.bannerTagline);
  const [bannerSubtitle, setBannerSubtitle] = useState(tournament.bannerSubtitle);
  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourt, setNewCourt] = useState('');
  const [uploading, setUploading] = useState(false);

  const lockedSettings = tournament.status !== 'draft';

  useEffect(() => {
    api<Court[]>(`/api/tournaments/${tournament.id}/courts`).then(setCourts);
  }, [tournament.id]);

  async function saveSettings() {
    try {
      await api(`/api/tournaments/${tournament.id}`, {
        method: 'PATCH',
        body: {
          name,
          groupCount,
          pointsPerGame,
          bannerIcon,
          bannerColor,
          bannerIconImage,
          bannerTagline,
          bannerSubtitle,
        },
      });
      toast({ title: '已儲存' });
    } catch {
      toast({ title: '儲存失敗', variant: 'destructive' });
    }
  }

  async function addCourt() {
    if (!newCourt.trim()) return;
    const c = await api<Court>(`/api/tournaments/${tournament.id}/courts`, {
      method: 'POST',
      body: { name: newCourt.trim() },
    });
    setCourts((cs) => [...cs, c]);
    setNewCourt('');
  }

  async function removeCourt(id: string) {
    await api(`/api/courts/${id}`, { method: 'DELETE' });
    setCourts((cs) => cs.filter((c) => c.id !== id));
  }

  async function onIconFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
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
      setBannerIconImage(data.filename);
      toast({ title: '已上傳，記得按儲存' });
    } catch (err: any) {
      toast({ title: '上傳失敗', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const iconPreview = bannerIconImage ? `/api/uploads/${bannerIconImage}` : null;

  return (
    <section id="settings" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">1. 賽事設定</h2>
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="s-name">名稱</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-gc">組數</Label>
            <Input
              id="s-gc"
              type="number"
              min={1}
              max={26}
              value={groupCount}
              onChange={(e) => setGroupCount(Number(e.target.value))}
              disabled={lockedSettings}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-ppg">每局分數</Label>
            <Input
              id="s-ppg"
              type="number"
              min={11}
              max={31}
              value={pointsPerGame}
              onChange={(e) => setPointsPerGame(Number(e.target.value))}
              disabled={lockedSettings}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="s-icon">主視覺 icon emoji（後備）</Label>
            <Input
              id="s-icon"
              value={bannerIcon}
              onChange={(e) => setBannerIcon(e.target.value)}
              maxLength={4}
              placeholder="🏸"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>主視覺底色</Label>
            <div className="flex flex-wrap gap-2">
              {BANNER_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setBannerColor(c.key)}
                  className={`h-8 w-8 rounded-full ${c.cls} transition ${
                    bannerColor === c.key ? 'ring-2 ring-offset-2 ring-amber-500' : ''
                  }`}
                  aria-label={c.key}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="s-tagline">主視覺上方標語（留空則不顯示）</Label>
            <Input
              id="s-tagline"
              value={bannerTagline}
              onChange={(e) => setBannerTagline(e.target.value)}
              maxLength={80}
              placeholder="FRIENDLY MATCH ★ 友誼賽"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-subtitle">主視覺副標（留空則不顯示）</Label>
            <Input
              id="s-subtitle"
              value={bannerSubtitle}
              onChange={(e) => setBannerSubtitle(e.target.value)}
              maxLength={80}
              placeholder="雙打分組循環賽"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>主視覺 icon 圖片（上傳優先；無圖則用 emoji）</Label>
          <div className="flex items-center gap-3">
            {iconPreview ? (
              <img
                src={iconPreview}
                alt="目前 banner icon"
                className="h-12 w-12 rounded-full border object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-2xl">
                {bannerIcon}
              </span>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onIconFileSelected}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1 file:text-primary-foreground"
              disabled={uploading}
            />
            {bannerIconImage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBannerIconImage(null)}
                disabled={uploading}
              >
                移除圖片
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            支援 PNG / JPG / WebP，≤ 1MB。上傳後記得按「儲存設定」。
          </p>
        </div>

        <Button onClick={saveSettings} size="sm">
          儲存設定
        </Button>

        <div className="border-t pt-4">
          <Label>場地</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {courts.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                {c.name}
                <button
                  onClick={() => removeCourt(c.id)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  aria-label="刪除"
                  disabled={lockedSettings}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="場地名稱（例：場地 1）"
              value={newCourt}
              onChange={(e) => setNewCourt(e.target.value)}
              className="max-w-xs"
              disabled={lockedSettings}
            />
            <Button onClick={addCourt} size="sm" disabled={lockedSettings || !newCourt.trim()}>
              新增場地
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
