-- Merge 'gmail' section into 'email' — any lead with an email goes to 'email'
UPDATE public.leads SET section = 'email' WHERE section = 'gmail';
-- Also update 'both' leads: if they have phone+email, keep as 'both'
-- No change needed for 'both' since it already means phone+email