import { DataStream } from 'scramjet';
import fetch from 'node-fetch';
import { parse, serialize } from 'cookie';

export default async function handler(req, res) {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    res.status(400).json({ error: "Missing 'url' query parameter" });
    return;
  }

  try {
    const options = {
      method: req.method,
      headers: {}
    };

    for (const [key, value] of Object.entries(req.headers)) {
      if (!['host', 'content-length'].includes(key.toLowerCase())) {
        options.headers[key] = value;
      }
    }

    if (req.method === 'POST' && req.body) {
      options.body = req.body;
    }

    // Fetch target URL
    const response = await fetch(targetUrl, options);

    // Rewrite headers (cookies + CORS)
    const headers = {};
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        const cookies = value.split(',').map(cookieStr => {
          const parsed = parse(cookieStr);
          return serialize(Object.keys(parsed)[0], parsed[Object.keys(parsed)[0]], {
            path: '/',
            httpOnly: false
          });
        });
        headers['set-cookie'] = cookies;
      } else {
        headers[key] = value;
      }
    });
    headers['Access-Control-Allow-Origin'] = '*';
    headers['Access-Control-Allow-Headers'] = '*';
    headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('javascript');
    const isVideo = contentType.includes('video');

    // Set headers to client
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    res.status(response.status);

    if (isText) {
      // Stream text via Scramjet
      const stream = new DataStream(response.body)
        .map(chunk => chunk.toString())
        .map(text => text); // Optional transform

      await stream.forEach(chunk => res.write(chunk));
      res.end();

    } else if (isVideo) {
      // Stream video directly
      const reader = response.body.getReader();
      const writer = res;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        writer.write(value);
      }
      res.end();

    } else {
      // Binary files other than video
      const buffer = await response.arrayBuffer();
      res.end(Buffer.from(buffer));
    }

  } catch (err) {
    res.status(500).send(`Internal server error: ${err.message}`);
  }
}
