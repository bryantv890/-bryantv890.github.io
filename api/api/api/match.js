module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "FOOTBALL_API_KEY is missing from Vercel environment variables."
    });
  }

  const fixtureId = String(req.query?.id || "").trim();

  if (!/^\d+$/.test(fixtureId)) {
    return res.status(400).json({
      error: "A valid numeric fixture ID is required. Example: /api/match?id=123456"
    });
  }

  const API_BASE = "https://v3.football.api-sports.io";

  async function apiGet(path, query = {}) {
    const url = new URL(API_BASE + path);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY,
        "Accept": "application/json"
      }
    });

    let body;

    try {
      body = await response.json();
    } catch (_) {
      throw new Error("Football data provider returned invalid JSON.");
    }

    if (!response.ok) {
      const message =
        body?.errors?.token ||
        body?.errors?.requests ||
        body?.errors?.rateLimit ||
        body?.message ||
        `Football API returned HTTP ${response.status}.`;

      throw new Error(
        typeof message === "string"
          ? message
          : JSON.stringify(message)
      );
    }

    if (body?.errors && Object.keys(body.errors).length) {
      throw new Error(JSON.stringify(body.errors));
    }

    return Array.isArray(body.response) ? body.response : [];
  }

  try {
    /*
     * Each endpoint can count against the provider's quota.
     * Use one request per endpoint, only when a user opens a match.
     */
    const results = await Promise.allSettled([
      apiGet("/fixtures", { id: fixtureId }),
      apiGet("/fixtures/events", { fixture: fixtureId }),
      apiGet("/fixtures/statistics", { fixture: fixtureId }),
      apiGet("/fixtures/lineups", { fixture: fixtureId })
    ]);

    const names = [
      "fixture",
      "events",
      "statistics",
      "lineups"
    ];

    const data = {};
    const unavailable = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        data[names[index]] = result.value;
      } else {
        data[names[index]] = [];
        unavailable.push({
          section: names[index],
          message: result.reason?.message || "Data unavailable."
        });
      }
    });

    const fixture = data.fixture[0] || null;

    if (!fixture && !unavailable.some(item => item.section === "fixture")) {
      return res.status(404).json({
        error: "This fixture was not found."
      });
    }

    return res.status(200).json({
      fixture,
      events: data.events,
      statistics: data.statistics,
      lineups: data.lineups,
      unavailable
    });
  } catch (error) {
    console.error("B_STREAMTV match error:", error.message);

    return res.status(502).json({
      error: "Could not retrieve match details.",
      detail: error.message
    });
  }
};