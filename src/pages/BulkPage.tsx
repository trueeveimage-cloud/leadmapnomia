import React from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { fetchPlaceFromUrl } from '@/lib/placesFetch';
import { addLead } from '@/lib/supabase';
import { useCRM, ImportResult } from '@/context/CRMContext';
import { Loader2, CheckCircle, XCircle, AlertCircle, Layers, Square } from 'lucide-react';
import { toast } from 'sonner';

export default function BulkPage() {
  const { bulkImport, setBulkImport, bulkStopRef, refreshCounts } = useCRM();
  const { text, loading, progress, total, results, stopped } = bulkImport;

  const setText = (v: string) => setBulkImport(s => ({ ...s, text: v }));

  const handleStop = () => {
    bulkStopRef.current = true;
    setBulkImport(s => ({ ...s, stopped: true }));
  };

  const handleImport = async () => {
    const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) return;

    bulkStopRef.current = false;
    setBulkImport(s => ({ ...s, loading: true, progress: 0, total: urls.length, results: [], stopped: false }));

    const newResults: ImportResult[] = [];

    for (let i = 0; i < urls.length; i++) {
      if (bulkStopRef.current) {
        toast.info(`Import stopped at ${i}/${urls.length}`);
        break;
      }

      const url = urls[i];

      if (!url.includes('google.com/maps') && !url.includes('goo.gl') && !url.includes('maps.app')) {
        newResults.push({ url, status: 'failed', reason: 'Not a valid Google Maps link' });
        setBulkImport(s => ({ ...s, progress: i + 1, results: [...newResults] }));
        continue;
      }

      try {
        const { result, error } = await fetchPlaceFromUrl(url);
        if (error || !result) {
          newResults.push({ url, status: 'failed', reason: error || 'Could not fetch' });
          setBulkImport(s => ({ ...s, progress: i + 1, results: [...newResults] }));
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

      setBulkImport(s => ({ ...s, progress: i + 1, results: [...newResults] }));
    }

    refreshCounts();
    setBulkImport(s => ({ ...s, loading: false }));
    if (!bulkStopRef.current) {
      const added = newResults.filter(r => r.status === 'added').length;
      toast.success(`Import complete: ${added} added`);
    }
  };

  const added = results.filter(r => r.status === 'added').length;
  const dupes = results.filter(r => r.status === 'duplicate').length;
  const failed = results.filter(r => r.status === 'failed').length;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-10">
        <div className="mb-5">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Bulk Import</h1>
          <p className="text-sm text-muted-foreground mt-1">Paste Google Maps links — one per line</p>
        </div>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={"https://www.google.com/maps/place/...\nhttps://maps.app.goo.gl/..."}
          className="w-full h-44 bg-card border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          disabled={loading}
        />

        <div className="flex items-center gap-3 mt-3">
          <Button onClick={handleImport} disabled={loading || !text.trim()} className="gap-2">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Layers size={15} />}
            {loading ? `Processing ${progress}/${total}…` : 'Import Links'}
          </Button>
          {loading && (
            <>
              <Button onClick={handleStop} variant="destructive" size="sm" className="gap-1.5">
                <Square size={12} /> Stop
              </Button>
              <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${total > 0 ? (progress / total) * 100 : 0}%` }}
                />
              </div>
            </>
          )}
        </div>

        {loading && (
          <p className="text-xs text-muted-foreground mt-2">
            You can navigate away — progress is saved. Or press Stop to cancel.
          </p>
        )}

        {stopped && !loading && (
          <p className="text-xs text-amber mt-2">Import was stopped early.</p>
        )}

        {results.length > 0 && (
          <div className="mt-6">
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

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_1fr] gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/50 border-b border-border">
                <span>Status</span>
                <span>Name</span>
                <span className="hidden sm:block"></span>
                <span className="hidden sm:block">URL</span>
              </div>
              {results.map((r, i) => (
                <div key={i} className="grid grid-cols-[auto_1fr_auto] sm:grid-cols-[auto_1fr_auto_1fr] gap-3 px-4 py-2 text-xs border-b border-border/50 last:border-0 items-center">
                  <span>
                    {r.status === 'added' && <CheckCircle size={13} className="text-green-400" />}
                    {r.status === 'duplicate' && <AlertCircle size={13} className="text-amber-400" />}
                    {r.status === 'failed' && <XCircle size={13} className="text-red-400" />}
                  </span>
                  <span className="font-medium text-foreground truncate">{r.name || r.reason || '—'}</span>
                  <span className={r.status === 'failed' ? 'text-red-400' : r.status === 'duplicate' ? 'text-amber-400' : 'text-green-400'}>
                    {r.status === 'duplicate' ? 'Dup' : r.status === 'failed' ? 'Fail' : 'OK'}
                  </span>
                  <span className="text-muted-foreground truncate hidden sm:block">{r.url}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
