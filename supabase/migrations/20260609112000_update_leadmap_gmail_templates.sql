insert into public.settings (key, value)
values
  ('gmail_autosend_subject', 'En snabb fråga om missade samtal hos {{business_name}}'),
  ('gmail_autosend_body', 'Hej {{owner_name}},

Jag såg {{business_name}} och tänkte bara fråga en sak.

Händer det att ni ibland missar samtal när ni är upptagna, ute på jobb eller kanske när ni har det stängt?

Jag har byggt en enkel AI-telefonist som svarar när ni inte hinner, tar kundens namn, nummer, ärende och önskad tid, och skickar allt direkt till er.

Vill du att jag skickar en kort demo på hur det skulle kunna se ut för er?

Mvh

Leadmap.se'),
  ('gmail_autosend_subject_sv', 'En snabb fråga om missade samtal hos {{business_name}}'),
  ('gmail_autosend_body_sv', 'Hej {{owner_name}},

Jag såg {{business_name}} och tänkte bara fråga en sak.

Händer det att ni ibland missar samtal när ni är upptagna, ute på jobb eller kanske när ni har det stängt?

Jag har byggt en enkel AI-telefonist som svarar när ni inte hinner, tar kundens namn, nummer, ärende och önskad tid, och skickar allt direkt till er.

Vill du att jag skickar en kort demo på hur det skulle kunna se ut för er?

Mvh

Leadmap.se'),
  ('gmail_autosend_subject_en', 'Quick question about missed calls at {{business_name}}'),
  ('gmail_autosend_body_en', 'Hi {{owner_name}},

I saw {{business_name}} and just wanted to ask one thing.

Do you sometimes miss calls when you are busy, out on jobs, or closed?

I have built a simple AI receptionist that answers when you cannot, takes the customer''s name, number, request and preferred time, and sends everything straight to you.

Would you like me to send a short demo of how it could look for you?

Best regards

Leadmap.se'),
  ('gmail_autosend_subject_es', 'Pregunta rápida sobre llamadas perdidas en {{business_name}}'),
  ('gmail_autosend_body_es', 'Hola {{owner_name}},

Vi {{business_name}} y quería hacerte una pregunta rápida.

¿A veces pierden llamadas cuando están ocupados, fuera trabajando o cuando están cerrados?

He creado una recepcionista de IA sencilla que responde cuando no podéis, toma el nombre, número, motivo y hora preferida del cliente, y os lo envía todo directamente.

¿Quieres que te envíe una demo corta de cómo podría verse para vosotros?

Saludos

Leadmap.se')
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();
