import { supabase } from "@/integrations/supabase/client";

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
  } as any).select().single();
  if (error) throw error;
  return data as unknown as FinderRun;
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

export function candidatesToCsv(candidates: FinderCandidate[]): string {
  const headers = ['Name', 'Address', 'Phone', 'Email', 'Website', 'Rating', 'Reviews', 'Category', 'Outcome', 'Maps URL'];
  const rows = candidates.map(c => [
    c.name, c.address || '', c.phone || '', c.email || '', c.website || '',
    c.rating?.toString() || '', c.reviews_count?.toString() || '',
    c.category || '', c.outcome, c.maps_url || ''
  ]);
  return [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
}
