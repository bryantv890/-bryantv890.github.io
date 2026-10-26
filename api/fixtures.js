export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing FOOTBALL_API_KEY in Vercel environment variables"
    });
  }

  try {
    const {
      live,
      date,
      league,
      season,
      team,
      next,
      last,
      search,
      status
    } = req.query;

    const params = new URLSearchParams();

    params.set("limit", "200");

    if (live === "all") params.set("live", "all");
    if (date) params.set("date", date);
    if (league) params.set("league", league);
    if (season) params.set("season", season);
    if (team) params.set("team", team);
    if (next) params.set("next", next);
    if (last) params.set("last", last);
    if (status) params.set("status", status);

    const url =
      `https://api.kickoffapi.com/api/v2/fixtures?${params}`;

    const response = await fetch(url, {
      headers: {
        "x-api-key": API_KEY,
        "Accept": "application/json"
      }
    });

    const body = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: body.error || "KickoffAPI request failed",
        code: body.code || null
      });
    }

    let fixtures = Array.isArray(body.data)
      ? body.data
      : [];

    if (search) {
      const query = String(search).toLowerCase();

      fixtures = fixtures.filter(match => {
        const home = match.home?.name || "";
        const away = match.away?.name || "";
        const competition = match.league?.name || "";

        return `${home} ${away} ${competition}`
          .toLowerCase()
          .includes(query);
      });
    }

    return res.status(200).json({
      success: true,
      source: "KickoffAPI",
      updatedAt: Date.now(),
      results: fixtures.length,
      response: fixtures,
      meta: body.meta || {}
    });

  } catch (error) {
    return res.status(502).json({
      success: false,
      error: "Unable to connect to KickoffAPI",
      details: error.message
    });
  }
}