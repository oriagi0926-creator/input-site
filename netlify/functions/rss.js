exports.handler = async function(event) {
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'no url' }) };

  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}&api_key=public&count=20`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800'
      },
      body: JSON.stringify(data)
    };
  } catch (e) {
    // fallback: direct fetch + parse
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml' },
        signal: AbortSignal.timeout(8000)
      });
      const xml = await res.text();
      const items = [];
      const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
      let m;
      while ((m = itemRegex.exec(xml)) !== null && items.length < 20) {
        const block = m[1];
        const get = (tag) => {
          const r = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
          const rm = block.match(r);
          return rm ? rm[1].trim() : '';
        };
        const enclosure = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
        const mediaThumbnail = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
        const mediaContent = block.match(/<media:content[^>]*url=["']([^"']+)["']/i);
        items.push({
          title: get('title'),
          link: get('link'),
          pubDate: get('pubDate'),
          description: get('description').replace(/<[^>]+>/g, '').slice(0, 200),
          thumbnail: (mediaThumbnail && mediaThumbnail[1]) || (mediaContent && mediaContent[1]) || (enclosure && enclosure[1]) || ''
        });
      }
      const titleM = xml.match(/<channel[^>]*>[\s\S]*?<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ status: 'ok', feed: { title: titleM ? titleM[1].trim() : '' }, items })
      };
    } catch (e2) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ status: 'error', message: e2.message, items: [] })
      };
    }
  }
};
