-- Fix: Remove anonymous access to place_cache table
DROP POLICY IF EXISTS "Anon access on place_cache" ON public.place_cache;