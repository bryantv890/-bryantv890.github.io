export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing FOOTBALL_API_KEY"
    });
  }

  const id = req.query.id || req.query.fixture;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(String(id))) {
    return res.status(400).json({
      success: false,
      error: "Provide a valid match ID using ?id="
    });
  }

  const headers = {
    "x-api-key": API_KEY,
    "Accept": "application/json"
  };

  async function getJSON(url) {
    const response = await fetch(url, { headers });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(
        body.error || `KickoffAPI returned ${response.status}`
      );
    }

    return body;
  }

  try {
    const url =
      `https://api.kickoffapi.com/api/v2/fixtures/${encodeURIComponent(id)}`;

    const body = await getJSON(url);

    const match = body.data || body.response || body;

    return res.status(200).json({
      success: true,
      source: "KickoffAPI",
      updatedAt: Date.now(),
      response: match
    });

  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "Unable to load match details",
      details: error.message
    });
  }
}