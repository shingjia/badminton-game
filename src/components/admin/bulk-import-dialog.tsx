'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

type ParseFailure = { line: number; raw: string; reason: string };
type ParsedRow = { name: string; level: string | null };

function parseCsvText(text: string): { rows: ParsedRow[]; failures: ParseFailure[] } {
  const rows: ParsedRow[] = [];
  const failures: ParseFailure[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (trimmed === '') return;

    const firstComma = trimmed.indexOf(',');
    let name: string;
    let level: string | null;
    if (firstComma === -1) {
      name = trimmed;
      level = null;
    } else {
      name = trimmed.slice(0, firstComma).trim();
      const after = trimmed.slice(firstComma + 1).trim();
      level = after === '' ? null : after;
    }

    if (name === '') {
      failures.push({ line: lineNo, raw: rawLine, reason: 'name 空白' });
      return;
    }
    if (name.length > 50) {
      failures.push({ line: lineNo, raw: rawLine, reason: 'name 超過 50 字' });
      return;
    }
    if (level !== null && level.length > 10) {
      failures.push({ line: lineNo, raw: rawLine, reason: 'level 超過 10 字' });
      return;
    }

    rows.push({ name, level });
  });

  return { rows, failures };
}

export function BulkImportDialog({ tournamentId }: { tournamentId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parseFailures, setParseFailures] = useState<ParseFailure[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleImport() {
    const { rows, failures } = parseCsvText(text);
    setParseFailures(failures);

    if (rows.length === 0) {
      toast({
        title: '沒有可匯入的資料',
        description: failures.length > 0 ? `${failures.length} 行格式錯誤` : '請先貼上球員名單',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api<{ created: number; failed: ParseFailure[] }>(
        `/api/tournaments/${tournamentId}/players/bulk`,
        { method: 'POST', body: { players: rows } },
      );
      const total = res.created;
      const failedCount = failures.length;
      toast({
        title: `已匯入 ${total} 人`,
        description: failedCount > 0 ? `另有 ${failedCount} 行格式錯誤未匯入` : undefined,
      });
      if (failedCount === 0) {
        setText('');
        setOpen(false);
      }
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '匯入失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">批次匯入</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>批次匯入球員</DialogTitle>
          <DialogDescription>
            一行一個球員，格式：姓名,等級（等級可留空）
          </DialogDescription>
        </DialogHeader>
        <Textarea
          rows={10}
          className="font-mono text-sm"
          placeholder={'張三,A\n李四,B\n王五,'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {parseFailures.length > 0 && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <div className="mb-1 font-semibold">失敗的行 ({parseFailures.length})</div>
            <ul className="space-y-0.5">
              {parseFailures.map((f) => (
                <li key={f.line}>
                  第 {f.line} 行: <span className="text-muted-foreground">{f.raw || '(空)'}</span> — {f.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleImport} disabled={submitting || text.trim() === ''}>
            {submitting ? '匯入中…' : '匯入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
