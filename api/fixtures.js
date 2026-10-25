module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "Missing FOOTBALL_API_KEY environment variable"
    });
  }

  try {
    const url =
      "https://sportsapi.com.br/api/v1/games?sport=football&status=live&limit=100&offset=0";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(15000)
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        success: false,
        error: "Football provider returned invalid JSON",
        providerStatus: response.status
      });
    }

    if (!response.ok) {
      return res.status(502).json({
        success: false,
        error: "Football provider request failed",
        providerStatus: response.status,
        details: data.message || data.error || "Provider rejected request"
      });
    }

    const fixtures = Array.isArray(data.response)
      ? data.response
      : Array.isArray(data.matches)
      ? data.matches
      : Array.isArray(data.data)
      ? data.data
      : [];

    return res.status(200).json({
      success: true,
      source: "SportsAPI Brazil",
      updatedAt: Date.now(),
      results: fixtures.length,
      response: fixtures
    });
  } catch (error) {
    console.error("B_STREAMTV fixtures error:", error);

    return res.status(502).json({
      success: false,
      error: error.name === "TimeoutError"
        ? "Football provider timed out"
        : "Unable to retrieve football data"
    });
  }
};