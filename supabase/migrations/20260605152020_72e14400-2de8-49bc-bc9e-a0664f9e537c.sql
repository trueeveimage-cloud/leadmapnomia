
-- Scope public-schema RLS policies to authenticated only
DROP POLICY IF EXISTS "Authenticated access on caller_sessions" ON public.caller_sessions;
CREATE POLICY "Authenticated access on caller_sessions" ON public.caller_sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access on callers" ON public.callers;
CREATE POLICY "Authenticated access on callers" ON public.callers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access on lead_attachments" ON public.lead_attachments;
CREATE POLICY "Authenticated access on lead_attachments" ON public.lead_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated access on lead_links" ON public.lead_links;
CREATE POLICY "Authenticated access on lead_links" ON public.lead_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage: require auth on the lead-attachments bucket
DROP POLICY IF EXISTS "Authenticated users can view lead attachments" ON storage.objects;
CREATE POLICY "Authenticated users can view lead attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lead-attachments');

DROP POLICY IF EXISTS "Authenticated users can upload lead attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-attachments');

DROP POLICY IF EXISTS "Authenticated users can delete lead attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete lead attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lead-attachments');

-- Lock down SECURITY DEFINER trigger function: only the auth trigger should call it
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
