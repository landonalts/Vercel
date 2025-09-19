import { DataStream } from 'scramjet';
import fetch from 'node-fetch';

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

    // Forward headers
    for (const [key, value] of Object.entries(req.headers)) {
      if (!['host', 'content-length'].includes(key.toLowerCase())) {
        options.headers[key] = value;
      }
    }

    // Forward POST body
    if (req.method === 'POST' && req.body) {
      options.body = req.body;
    }

    const response = await fetch(targetUrl, options);
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const isText = contentType.includes('text') || contentType.includes('json') || contentType.includes('javascript');

    if (isText) {
      const stream = new DataStream(response.body)
        .map(chunk => chunk.toString())
        .map(text => text); // optional transform

      let result = '';
      await stream.forEach(chunk => result += chunk);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(response.status).send(result);
    } else {
      const buffer = await response.arrayBuffer();
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.status(response.status).send(Buffer.from(buffer));
    }

  } catch (err) {
    res.status(500).send(`Internal server error: ${err.message}`);
  }
}
