import { supabase } from "@/integrations/supabase/client";
import { addLead, determineSection, updateLead } from "@/lib/supabase";
import { findCity } from "@/lib/cities";

export interface FinderRun {
  id: string;
  city: string;
  mode: string;
  keywords: string[];
  radius: number;
  max_pages: number;
  max_candidates: number;
  max_details: number;
  min_rating: number | null;
  min_reviews: number | null;
  require_phone: boolean;
  status: string;
  stats: Record<string, any>;
  created_at: string;
  updated_at: string;
  batch_id: string | null;
  batch_label: string | null;
}

export interface FinderCandidate {
  id: string;
  run_id: string;
  place_id: string;
  name: string;
  address: string | null;
  rating: number | null;
  reviews_count: number | null;
  types: string[] | null;
  has_phone: boolean | null;
  has_website: boolean | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  maps_url: string | null;
  category: string | null;
  last_fetched_at: string | null;
  outcome: string;
  created_at: string;
}

export async function createFinderRun(params: {
  city: string;
  mode: string;
  keywords: string[];
  radius: number;
  maxPages: number;
  maxCandidates: number;
  maxDetails: number;
  minRating?: number | null;
  minReviews?: number | null;
  maxReviews?: number | null;
  requirePhone: boolean;
  findGmailOnly?: boolean;
  batchId?: string | null;
  batchLabel?: string | null;
}): Promise<FinderRun> {
  const { data, error } = await supabase.from('finder_runs').insert({
    city: params.city,
    mode: params.mode,
    keywords: params.keywords,
    radius: params.radius,
    max_pages: params.maxPages,
    max_candidates: params.maxCandidates,
    max_details: params.maxDetails,
    min_rating: params.minRating || null,
    min_reviews: params.minReviews || null,
    require_phone: params.requirePhone,
    status: 'pending',
    stats: {},
    batch_id: params.batchId || null,
    batch_label: params.batchLabel || null,
  } as any).select().single();
  if (error) throw error;
  return data as unknown as FinderRun;
}

export async function fetchFinderRunsByBatch(batchId: string): Promise<FinderRun[]> {
  const { data, error } = await supabase.from('finder_runs').select('*').eq('batch_id', batchId).order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as FinderRun[];
}

export async function fetchFinderCandidatesByBatch(batchId: string): Promise<FinderCandidate[]> {
  const { data: runs } = await supabase.from('finder_runs').select('id').eq('batch_id', batchId);
  if (!runs || runs.length === 0) return [];
  const runIds = runs.map(r => r.id);
  const { data, error } = await supabase.from('finder_candidates').select('*').in('run_id', runIds).order('outcome', { ascending: true });
  if (error) throw error;
  return data as unknown as FinderCandidate[];
}

export async function fetchFinderRuns(): Promise<FinderRun[]> {
  const { data, error } = await supabase.from('finder_runs').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as FinderRun[];
}

export async function fetchFinderRun(id: string): Promise<FinderRun> {
  const { data, error } = await supabase.from('finder_runs').select('*').eq('id', id).single();
  if (error) throw error;
  return data as unknown as FinderRun;
}

export async function fetchFinderCandidates(runId: string): Promise<FinderCandidate[]> {
  const { data, error } = await supabase.from('finder_candidates').select('*').eq('run_id', runId).order('outcome', { ascending: true });
  if (error) throw error;
  return data as unknown as FinderCandidate[];
}

export async function stopFinderRun(id: string): Promise<void> {
  await supabase.from('finder_runs').update({ status: 'stopped' } as any).eq('id', id);
}

export async function deleteFinderRun(id: string): Promise<void> {
  await supabase.from('finder_runs').delete().eq('id', id);
}

export async function runFinderSearch(runId: string, params: {
  city: string;
  keywords: string[];
  radius: number;
  maxPages: number;
  maxCandidates: number;
  maxDetails: number;
  minRating?: number;
  minReviews?: number;
  maxReviews?: number;
  requirePhone: boolean;
  findGmailOnly?: boolean;
}): Promise<any> {
  const { data, error } = await supabase.functions.invoke('finder-search', {
    body: { runId, action: 'search', ...params },
  });
  if (error) throw error;
  return data;
}

export async function estimateFinderCost(params: {
  keywords: string[];
  maxPages: number;
  maxCandidates: number;
  maxDetails: number;
}): Promise<{ stage1Requests: number; maxStage2Details: number; estimatedCost: string }> {
  const { data, error } = await supabase.functions.invoke('finder-search', {
    body: { action: 'estimate', runId: '', city: '', radius: 1500, requirePhone: false, minRating: 0, minReviews: 0, ...params },
  });
  if (error) throw error;
  return data;
}

export async function refetchFailedCandidates(runId: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('finder-search', {
    body: { runId, action: 'refetch', city: '', keywords: [], radius: 0, maxPages: 0, maxCandidates: 0, maxDetails: 9999, requirePhone: false },
  });
  if (error) throw error;
  return data;
}

export async function resumeFinderRun(runId: string): Promise<any> {
  const { data, error } = await supabase.functions.invoke('finder-search', {
    body: { runId, action: 'resume', city: '', keywords: [], radius: 0, maxPages: 0, maxCandidates: 0, maxDetails: 9999, requirePhone: false },
  });
  if (error) throw error;
  return data;
}

export async function scrapeFinderCandidateEmails(params: {
  runIds: string[];
  onProgress?: (progress: { done: number; total: number; found: number; added: number; updated: number }) => void;
}) {
  const runIds = params.runIds.filter(Boolean);
  if (runIds.length === 0) return { checked: 0, found: 0, added: 0, updated: 0 };

  const { data, error } = await supabase
    .from('finder_candidates')
    .select('*')
    .in('run_id', runIds);

  if (error) throw error;

  const allCandidates = ((data || []) as unknown as FinderCandidate[]);
  const candidates = allCandidates
    .filter(candidate => candidate.website && !candidate.email);
  const { data: runRows } = await supabase
    .from('finder_runs')
    .select('id, city')
    .in('id', runIds);
  const runMeta = new Map((runRows || []).map((run: any) => {
    const cityProfile = findCity(run.city);
    return [run.id, { city: run.city, country: cityProfile?.country || null }];
  }));

  let checked = 0;
  let found = 0;
  let added = 0;
  let updated = 0;

  const saveCandidateLead = async (candidate: FinderCandidate, email?: string | null, emailSource?: string | null) => {
    if (!candidate.phone && !email && !candidate.email) return;
    const meta = runMeta.get(candidate.run_id);
    const leadData = {
      place_id: candidate.place_id,
      maps_url: candidate.maps_url,
      name: candidate.name,
      category: candidate.category,
      niche_label: candidate.category?.split(',')[0]?.trim() || null,
      rating: candidate.rating,
      reviews_count: candidate.reviews_count,
      phone: candidate.phone,
      email: email || candidate.email,
      address: candidate.address,
      city: meta?.city || null,
      country: meta?.country || null,
      website: candidate.website,
      section: determineSection({ phone: candidate.phone, email: email || candidate.email }),
      status: 'not_contacted' as const,
      email_source: email ? (emailSource || 'website_scrape') : null,
      product: 'leadmap' as const,
    };

    const { duplicate, error: addError } = await addLead(leadData);
    if (addError) return;
    if (duplicate) {
      const patch: Record<string, any> = {};
      if (!duplicate.phone && candidate.phone) patch.phone = candidate.phone;
      if (!duplicate.email && (email || candidate.email)) {
        patch.email = email || candidate.email;
        patch.email_source = email ? (emailSource || 'website_scrape') : duplicate.email_source;
      }
      if (!duplicate.city && meta?.city) patch.city = meta.city;
      if (!duplicate.country && meta?.country) patch.country = meta.country;
      const nextEmail = patch.email || duplicate.email;
      const nextPhone = patch.phone || duplicate.phone;
      if (Object.keys(patch).length > 0) {
        patch.section = determineSection({ phone: nextPhone, email: nextEmail });
        await updateLead(duplicate.id, patch);
        updated++;
      }
    } else {
      added++;
    }
  };

  for (const candidate of allCandidates) {
    await saveCandidateLead(candidate);
  }

  params.onProgress?.({ done: checked, total: candidates.length, found, added, updated });

  for (let i = 0; i < candidates.length; i += 4) {
    const slice = candidates.slice(i, i + 4);
    const urls = slice.map(candidate => ({
      leadId: candidate.id,
      website: candidate.website!,
      businessName: candidate.name,
    }));

    const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('scrape-emails', { body: { urls } });
    if (scrapeError) throw scrapeError;

    const results = scrapeData?.results || [];
    for (const result of results) {
      const candidate = slice.find(item => item.id === result.leadId);
      const email = result?.email || result?.emails?.[0];
      if (!candidate || !email) continue;

      found++;
      await supabase
        .from('finder_candidates')
        .update({ email } as any)
        .eq('id', candidate.id);

      await saveCandidateLead(candidate, email, result.source || 'website_scrape');
    }

    checked = Math.min(i + 4, candidates.length);
    params.onProgress?.({ done: checked, total: candidates.length, found, added, updated });
  }

  return { checked, found, added, updated };
}

export function candidatesToCsv(candidates: FinderCandidate[]): string {
  const headers = ['Name', 'Address', 'Phone', 'Email', 'Website', 'Rating', 'Reviews', 'Category', 'Outcome', 'Maps URL'];
  const rows = candidates.map(c => [
    c.name, c.address || '', c.phone || '', c.email || '', c.website || '',
    c.rating?.toString() || '', c.reviews_count?.toString() || '',
    c.category || '', c.outcome, c.maps_url || ''
  ]);
  return [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
}
