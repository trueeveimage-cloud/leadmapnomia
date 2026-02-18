import React, { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { fetchPlaceFromUrl } from '@/lib/placesFetch';
import { addLead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { Loader2, CheckCircle, XCircle, AlertCircle, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface ImportResult {
  url: string;
  status: 'added' | 'duplicate' | 'failed';
  name?: string;
  reason?: string;
}

export default function BulkPage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const { refreshCounts } = useCRM();

  const handleImport = async () => {
    const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) return;

    setLoading(true);
    setProgress(0);
    setTotal(urls.length);
    setResults([]);

    const newResults: ImportResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];

      if (!url.includes('google.com/maps') && !url.includes('goo.gl') && !url.includes('maps.app')) {
        newResults.push({ url, status: 'failed', reason: 'Not a valid Google Maps link' });
        setProgress(i + 1);
        setResults([...newResults]);
        continue;
      }

      try {
        const { result, error } = await fetchPlaceFromUrl(url);
        if (error || !result) {
          newResults.push({ url, status: 'failed', reason: error || 'Could not fetch' });
          setProgress(i + 1);
          setResults([...newResults]);
          continue;
        }

        const { lead, duplicate, error: addError } = await addLead({
          place_id: result.placeId,
          maps_url: url,
          name: result.name,
          category: result.category,
          niche_label: result.nicheLabel,
          rating: result.rating,
          reviews_count: result.reviewsCount,
          phone: result.phone,
          email: result.email,
          address: result.address,
          website: result.website,
          section: 'unsorted',
          status: 'not_contacted',
          call_outcome_last: null,
          next_action_at: null,
          notes: null,
          tags: [],
        });

        if (duplicate) {
          newResults.push({ url, status: 'duplicate', name: duplicate.name });
        } else if (addError) {
          newResults.push({ url, status: 'failed', reason: addError });
        } else {
          newResults.push({ url, status: 'added', name: lead?.name });
        }
      } catch (e: any) {
        newResults.push({ url, status: 'failed', reason: e.message });
      }

      setProgress(i + 1);
      setResults([...newResults]);
    }

    refreshCounts();
    setLoading(false);
    const added = newResults.filter(r => r.status === 'added').length;
    toast.success(`Import complete: ${added} added`);
  };

  const added = results.filter(r => r.status === 'added').length;
  const dupes = results.filter(r => r.status === 'duplicate').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-6 pt-10 pb-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Bulk Import</h1>
          <p className="text-sm text-muted-foreground mt-1">Paste Google Maps links — one per line</p>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"https://www.google.com/maps/place/...\nhttps://www.google.com/maps/place/...\nhttps://goo.gl/maps/..."}
          className="w-full h-48 bg-card border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          disabled={loading}
        />

        <div className="flex items-center gap-3 mt-3">
          <Button onClick={handleImport} disabled={loading || !text.trim()} className="gap-2">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
            {loading ? `Processing ${progress}/${total}...` : 'Import Links'}
          </Button>
          {loading && (
            <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="mt-6">
            {/* Summary */}
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-1.5 text-sm font-medium text-green-400">
                <CheckCircle size={15} /> {added} added
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-amber-400">
                <AlertCircle size={15} /> {dupes} duplicate{dupes !== 1 ? 's' : ''}
              </div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-red-400">
                <XCircle size={15} /> {failed} failed
              </div>
            </div>

            {/* Results table */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/50 border-b border-border">
                <span>Status</span>
                <span>Name</span>
                <span></span>
                <span>URL</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto_1fr] gap-3 px-4 py-2 text-xs border-b border-border/50 last:border-0 items-center">
                  <span>
                    {r.status === 'added' && <CheckCircle size={13} className="text-green-400" />}
                    {r.status === 'duplicate' && <AlertCircle size={13} className="text-amber-400" />}
                    {r.status === 'failed' && <XCircle size={13} className="text-red-400" />}
                  </span>
                  <span className="font-medium text-foreground truncate">{r.name || '—'}</span>
                  <span className={r.status === 'failed' ? 'text-red-400' : r.status === 'duplicate' ? 'text-amber-400' : 'text-green-400'}>
                    {r.status === 'duplicate' ? 'Duplicate' : r.status === 'failed' ? (r.reason || 'Failed') : 'Added'}
                  </span>
                  <span className="text-muted-foreground truncate">{r.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
