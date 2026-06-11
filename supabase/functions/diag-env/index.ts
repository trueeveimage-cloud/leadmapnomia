Deno.serve(() => {
  const id = Deno.env.get('RETELL_AGENT_ID') || '';
  const masked = id ? `${id.slice(0, 6)}…${id.slice(-4)} (len=${id.length})` : 'MISSING';
  return new Response(JSON.stringify({ RETELL_AGENT_ID: masked, prefix: id.split('_')[0] }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
});
