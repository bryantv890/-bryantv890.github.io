module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=20");
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

  const API_BASE = "https://v3.football.api-sports.io";

  const params = req.query || {};
  const live = params.live;
  const search = String(params.search || "").trim();
  const league = String(params.league || "").trim();
  const season = String(params.season || "").trim();
  const team = String(params.team || "").trim();
  const next = String(params.next || "").trim();
  const last = String(params.last || "").trim();
  const date = String(params.date || "").trim();
  const timezone = String(params.timezone || "Africa/Lagos").trim();

  const allowedStatuses = new Set([
    "NS", "1H", "HT", "2H", "ET", "BT", "P",
    "FT", "AET", "PEN", "SUSP", "INT", "PST",
    "CANC", "ABD", "AWD", "WO", "LIVE"
  ]);

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const validSeason = /^\d{4}$/.test(season);
  const validId = /^\d+$/.test(league) && /^\d+$/.test(team);

  const isLiveRequest = live === "all" || live === "true";

  if (search.length > 100) {
    return res.status(400).json({ error: "Search text is too long." });
  }

  if (league && !/^\d+$/.test(league)) {
    return res.status(400).json({ error: "Invalid league ID." });
  }

  if (team && !/^\d+$/.test(team)) {
    return res.status(400).json({ error: "Invalid team ID." });
  }

  if (date && !validDate) {
    return res.status(400).json({
      error: "Date must use YYYY-MM-DD format."
    });
  }

  if (season && !validSeason) {
    return res.status(400).json({
      error: "Season must be a four-digit year."
    });
  }

  if (next && (!/^\d+$/.test(next) || Number(next) > 50)) {
    return res.status(400).json({
      error: "The next parameter must be between 1 and 50."
    });
  }

  if (last && (!/^\d+$/.test(last) || Number(last) > 50)) {
    return res.status(400).json({
      error: "The last parameter must be between 1 and 50."
    });
  }

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

    return body;
  }

  try {
    const query = {
      timezone
    };

    if (isLiveRequest) {
      query.live = "all";

      if (league) query.league = league;
      if (team) query.team = team;
    } else if (search) {
      query.search = search;

      if (league) query.league = league;
      if (team) query.team = team;
      if (date) query.date = date;
      if (validSeason) query.season = season;
    } else if (date) {
      query.date = date;

      if (league) query.league = league;
      if (team) query.team = team;
      if (validSeason) query.season = season;
    } else if (next) {
      query.next = next;

      if (league) query.league = league;
      if (team) query.team = team;
      if (validSeason) query.season = season;
    } else if (last) {
      query.last = last;

      if (league) query.league = league;
      if (team) query.team = team;
      if (validSeason) query.season = season;
    } else {
      // Default to today's fixtures in the requested timezone.
      query.date = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());

      if (league) query.league = league;
      if (team) query.team = team;
      if (validSeason) query.season = season;
    }

    const fixtureData = await apiGet("/fixtures", query);

    const fixtures = Array.isArray(fixtureData.response)
      ? fixtureData.response
      : [];

    /*
     * Only live fixtures need a second-level clock lookup.
     * The odds feed may not cover every live fixture.
     */
    if (isLiveRequest && fixtures.length) {
      try {
        const oddsData = await apiGet("/odds/live");

        const oddsFixtures = Array.isArray(oddsData.response)
          ? oddsData.response
          : [];

        const secondsByFixture = new Map();

        for (const item of oddsFixtures) {
          const fixtureId = Number(item?.fixture?.id);
          const seconds = item?.fixture?.status?.seconds;

          if (
            Number.isFinite(fixtureId) &&
            typeof seconds === "string" &&
            /^\d{1,3}:\d{2}$/.test(seconds)
          ) {
            secondsByFixture.set(fixtureId, {
              seconds,
              update: item.update || null
            });
          }
        }

        for (const fixture of fixtures) {
          const fixtureId = Number(fixture?.fixture?.id);
          const clock = secondsByFixture.get(fixtureId);

          if (clock) {
            fixture.fixture.status.seconds = clock.seconds;
            fixture.fixture.status.seconds_source = "api-football-live-odds";
            fixture.fixture.status.seconds_updated_at = clock.update;
          }
        }
      } catch (clockError) {
        // Preserve the normal fixture response if the odds endpoint
        // is unavailable or does not have seconds-level data.
        console.error(
          "B_STREAMTV seconds clock unavailable:",
          clockError.message
        );
      }
    }

    return res.status(200).json({
      get: "fixtures",
      results: fixtures.length,
      response: fixtures,
      clockNote:
        "Seconds are provided only when the live odds feed supplies them. Otherwise, the match clock displays the provider's elapsed minute.",
      providerErrors: fixtureData.errors || []
    });
  } catch (error) {
    console.error("B_STREAMTV fixtures error:", error.message);

    return res.status(502).json({
      error: "Could not retrieve football fixtures.",
      detail: error.message
    });
  }
};