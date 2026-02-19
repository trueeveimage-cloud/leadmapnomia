import React, { useState, useRef, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchPlaceFromUrl } from '@/lib/placesFetch';
import { addLead, determineSection, Lead } from '@/lib/supabase';
import { useCRM } from '@/context/CRMContext';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { Plus, ExternalLink, Loader2 } from 'lucide-react';

export default function AddPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastAdded, setLastAdded] = useState<Lead | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { refreshCounts } = useCRM();

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleAdd = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    if (!trimmed.includes('google.com/maps') && !trimmed.includes('goo.gl') && !trimmed.includes('maps.app.goo.gl')) {
      toast.error('Please paste a valid Google Maps link');
      return;
    }

    setLoading(true);
    try {
      const { result, error } = await fetchPlaceFromUrl(trimmed);
      if (error) { toast.error(error); return; }
      if (!result) { toast.error('Could not fetch place details'); return; }

      const section = determineSection(result);
      const { lead, duplicate, error: addError } = await addLead({
        place_id: result.placeId,
        maps_url: trimmed,
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
        toast.warning(
          <span>Already added. <Link to="/unsorted" className="underline text-primary">View in Unsorted</Link></span>
        );
        return;
      }

      if (addError) { toast.error(addError); return; }

      setLastAdded(lead!);
      setUrl('');
      refreshCounts();
      toast.success(`Added "${result.name}" to Unsorted`);
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-6 pt-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Add Lead</h1>
          <p className="text-sm text-muted-foreground mt-1">Paste a Google Maps business link and press Enter</p>
        </div>

        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && handleAdd()}
            placeholder="https://www.google.com/maps/place/... or maps.app.goo.gl/..."
            className="flex-1 h-11 text-sm bg-card border-border"
            disabled={loading}
          />
          <Button onClick={handleAdd} disabled={loading || !url.trim()} className="h-11 px-6 font-medium gap-2">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {loading ? 'Fetching...' : 'Add'}
          </Button>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          Tip: Use <kbd className="bg-muted border border-border px-1 py-0.5 rounded text-[10px]">N</kbd> from any page to jump here
        </div>

        {lastAdded && (
          <div className="mt-6 p-4 bg-card border border-border rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Last added</div>
            <div className="font-medium text-foreground">{lastAdded.name}</div>
            {lastAdded.category && <div className="text-xs text-muted-foreground">{lastAdded.category}</div>}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              {lastAdded.phone && <span className="text-green-400">📞 {lastAdded.phone}</span>}
              {lastAdded.email && <span className="text-blue-400">✉ {lastAdded.email}</span>}
              {lastAdded.rating && <span>⭐ {lastAdded.rating}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <Link to="/unsorted">
                <Button size="sm" variant="outline" className="h-7 text-xs">View in Unsorted</Button>
              </Link>
              {lastAdded.maps_url && (
                <a href={lastAdded.maps_url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"><ExternalLink size={11} />Maps</Button>
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
