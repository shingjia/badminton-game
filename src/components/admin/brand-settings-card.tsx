'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

type Props = {
  initial: { siteName: string; siteIcon: string };
};

export function BrandSettingsCard({ initial }: Props) {
  const { toast } = useToast();
  const [siteName, setSiteName] = useState(initial.siteName);
  const [siteIcon, setSiteIcon] = useState(initial.siteIcon);
  const [submitting, setSubmitting] = useState(false);

  const dirty = siteName !== initial.siteName || siteIcon !== initial.siteIcon;
  const canSubmit = !submitting && dirty && siteName.trim() !== '' && siteIcon.trim() !== '';

  async function save() {
    setSubmitting(true);
    try {
      await api('/api/admin/site-config', {
        method: 'PATCH',
        body: { siteName: siteName.trim(), siteIcon: siteIcon.trim() },
      });
      toast({ title: '已儲存' });
      // hard reload so the SiteHeader (server component) re-fetches the new config
      window.location.reload();
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '儲存失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

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
          <Label htmlFor="site-icon">網站 icon（emoji）</Label>
          <Input
            id="site-icon"
            value={siteIcon}
            onChange={(e) => setSiteIcon(e.target.value)}
            maxLength={4}
            placeholder="🏸"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={save} disabled={!canSubmit} size="sm">
          {submitting ? '儲存中…' : '儲存'}
        </Button>
      </div>
    </Card>
  );
}
