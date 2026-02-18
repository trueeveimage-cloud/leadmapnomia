import { supabase } from "@/integrations/supabase/client";

export interface PlaceResult {
  placeId: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number;
  category: string | null;
  nicheLabel: string | null;
}

export async function fetchPlaceFromUrl(url: string): Promise<{ result?: PlaceResult; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-place', {
      body: { url },
    });

    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    return { result: data as PlaceResult };
  } catch (e: any) {
    return { error: e.message };
  }
}
