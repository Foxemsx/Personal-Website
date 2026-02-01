// Vercel serverless function to receive watching updates

// CORS headers helper - must be applied to ALL responses
const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');
  return res;
};

export default async function handler(req, res) {
  // ALWAYS set CORS headers FIRST, before any other code
  setCorsHeaders(res);

  // Handle preflight immediately - don't process anything else
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {

    // GET - Return current watching data
    if (req.method === 'GET') {
      let data = null;
      
      try {
        // Try to get from KV if available
        if (process.env.VERCEL_KV_REST_API_URL && process.env.VERCEL_KV_REST_API_TOKEN) {
          const { kv } = await import('@vercel/kv');
          data = await kv.get('now-watching');
        }
      } catch (kvError) {
        console.error('KV error:', kvError);
      }
      
      // Fallback to default
      if (!data) {
        data = {
          isWatching: false,
          timestamp: new Date().toISOString(),
          title: null,
          episode: null,
          progress: null
        };
      }
      
      return res.status(200).json(data);
    }

    // POST - Update watching data
    if (req.method === 'POST') {
      // Debug logging
      console.log('POST request received', {
        body: req.body,
        headers: Object.keys(req.headers),
        hasAuth: !!req.headers['authorization']
      });

      const apiKey = req.headers['authorization']?.replace('Bearer ', '');
      const expectedKey = process.env.FOXCLI_API_KEY;
      
      // Verify API key if configured
      if (expectedKey && apiKey !== expectedKey) {
        console.log('Auth failed - expected:', expectedKey?.slice(0, 10) + '...', 'got:', apiKey?.slice(0, 10) + '...');
        return res.status(401).json({ error: 'Invalid or missing API key' });
      }

      const body = req.body;
      
      // Validate required fields
      if (!body || typeof body.isWatching !== 'boolean') {
        return res.status(400).json({ error: 'Invalid data: isWatching boolean required' });
      }

      const data = {
        isWatching: body.isWatching,
        timestamp: new Date().toISOString(),
        title: body.title || null,
        episode: body.episode || null,
        season: body.season || null,
        progress: body.progress || null,
        source: body.source || 'cloud'
      };

      // Store in KV if available
      if (process.env.VERCEL_KV_REST_API_URL && process.env.VERCEL_KV_REST_API_TOKEN) {
        try {
          const { kv } = await import('@vercel/kv');
          await kv.set('now-watching', data, { ex: 300 }); // Expire after 5 minutes
        } catch (kvError) {
          console.error('KV store error:', kvError);
        }
      }

      console.log('Data saved:', { title: data.title, isWatching: data.isWatching });

      return res.status(200).json({ 
        success: true, 
        message: 'Updated successfully',
        data 
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
    
  } catch (error) {
    console.error('Unhandled error:', error);
    // CORS headers are already set, so error response will have them
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
