exports.handler = async function(event) {
  const url = event.queryStringParameters && event.queryStringParameters.url;
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'no url' }) };

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=1800'
  };

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml, application/atom+xml, */*'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      return { statusCode: 200, headers, body: JSON.stringify({ status: 'error', message: `HTTP ${res.status}`, items: [] }) };
    }

    const xml = await res.text();
    const items = parseXml(xml);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', items, count: items.length })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'error', message: e.message, items: [] })
    };
  }
};

function parseXml(xml) {
  if (!xml) return [];
  const items = [];

  // Support both RSS <item> and Atom <entry>
  const itemPattern = xml.includes('<entry') 
    ? /<entry[^>]*>([\s\S]*?)<\/entry>/gi
    : /<item[^>]*>([\s\S]*?)<\/item>/gi;

  let m;
  while ((m = itemPattern.exec(xml)) !== null && items.length < 25) {
    const block = m[1];

    const get = (tag) => {
      const patterns = [
        new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
      ];
      for (const p of patterns) {
        const r = block.match(p);
        if (r) return r[1].replace(/<[^>]+>/g, '').trim();
      }
      return '';
    };

    const getAttr = (tag, attr) => {
      const r = block.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
      return r ? r[1] : '';
    };

    // Get link - handle both <link>url</link> and <link href="url"/>
    let link = get('link');
    if (!link) link = getAttr('link', 'href');
    if (!link) {
      const guidM = block.match(/<guid[^>]*>([^<]+)<\/guid>/i);
      if (guidM && guidM[1].startsWith('http')) link = guidM[1].trim();
    }

    // Get thumbnail
    const mt = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
    const mc = block.match(/<media:content[^>]*url=["']([^"']+)["']/i);
    const enc = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
    const imgInDesc = block.match(/<img[^>]+src=["']([^"']+)["']/i);

    // Get date
    const pubDate = get('pubDate') || get('published') || get('updated') || get('dc:date') || '';

    const title = get('title');
    if (!title) continue;

    items.push({
      title,
      link,
      pubDate,
      thumbnail: (mt && mt[1]) || (mc && mc[1]) || (enc && enc[1]) || (imgInDesc && imgInDesc[1]) || ''
    });
  }

  return items;
}
