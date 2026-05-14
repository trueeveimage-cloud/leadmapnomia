// Validate Twilio webhook signature: HMAC-SHA1(URL + sorted concatenated params) base64.
// Docs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
export async function validateTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
  authToken: string,
): Promise<boolean> {
  if (!signature || !authToken) return false;
  const sortedKeys = Object.keys(params).sort();
  const data = sortedKeys.reduce((acc, k) => acc + k + params[k], url);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));
  return expected === signature;
}

export function paramsFromBody(rawBody: string, contentType: string): Record<string, string> {
  if (contentType.includes('json') && rawBody.trim().startsWith('{')) {
    try {
      const json = JSON.parse(rawBody);
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(json)) out[k] = String(v ?? '');
      return out;
    } catch { /* fall through */ }
  }
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(rawBody)) out[k] = v;
  return out;
}
