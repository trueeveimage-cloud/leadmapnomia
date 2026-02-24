
-- Add contact tracking columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS call_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamp with time zone;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contact_method text;

-- Create lead_attachments table
CREATE TABLE public.lead_attachments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access on lead_attachments"
  ON public.lead_attachments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create lead_links table
CREATE TABLE public.lead_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  url text NOT NULL,
  label text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated access on lead_links"
  ON public.lead_links
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create storage bucket for lead attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('lead-attachments', 'lead-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload lead attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lead-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view lead attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lead-attachments');

CREATE POLICY "Authenticated users can delete lead attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'lead-attachments' AND auth.role() = 'authenticated');
