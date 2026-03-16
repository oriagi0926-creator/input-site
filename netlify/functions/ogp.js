exports.handler = async function(event) {
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'no url' }) };
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InputDashboard/1.0)', 'Accept': 'text/html' },
      redirect: 'follow', signal: AbortSignal.timeout(6000)
    });
    const html = await res.text();
    function meta(prop) {
      const patterns = [
        new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i'),
        new RegExp(`<meta[^>]*name=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i'),
      ];
      for (const p of patterns) { const m = html.match(p); if (m) return m[1].trim(); }
      return '';
    }
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=86400' },
      body: JSON.stringify({
        title: meta('og:title') || (titleMatch ? titleMatch[1].trim() : ''),
        image: meta('og:image') || meta('twitter:image') || '',
        description: meta('og:description') || meta('description') || '',
        siteName: meta('og:site_name') || '',
        url
      })
    };
  } catch (e) {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ title: '', image: '', url, error: e.message }) };
  }
};
