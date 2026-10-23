module.exports = async function handler(req, res) {
  res.setHeader(
    "Cache-Control",
    "s-maxage=30, stale-while-revalidate=60"
  );

  res.setHeader(
    "Content-Type",
    "application/json; charset=utf-8"
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");

    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "FOOTBALL_API_KEY is missing from Vercel."
    });
  }

  try {
    const params = req.query || {};

    const timezone = "Africa/Lagos";

    function getLocalDate() {
      const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(new Date());

      const values = {};

      for (const part of parts) {
        if (part.type !== "literal") {
          values[part.type] = part.value;
        }
      }

      return `${values.year}-${values.month}-${values.day}`;
    }

    const date = String(
      params.date || getLocalDate()
    ).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        error: "Date must use YYYY-MM-DD format."
      });
    }

    const url =
      "https://sportapi.ai/api/fixtures/date/" +
      encodeURIComponent(date);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": API_KEY,
        "Accept": "application/json"
      }
    });

    let body;

    try {
      body = await response.json();
    } catch {
      throw new Error(
        "SportAPI returned an invalid JSON response."
      );
    }

    if (!response.ok || body.success === false) {
      console.error(
        "SportAPI error:",
        response.status,
        body
      );

      return res.status(
        response.status >= 400 && response.status < 600
          ? response.status
          : 502
      ).json({
        error: "SportAPI could not retrieve fixtures.",
        detail:
          body.error ||
          body.message ||
          `Provider returned HTTP ${response.status}.`
      });
    }

    const sourceFixtures = Array.isArray(body.data)
      ? body.data
      : [];

    const search = String(params.search || "")
      .trim()
      .toLowerCase();

    const leagueFilter = String(
      params.league || ""
    ).trim();

    const teamFilter = String(
      params.team || ""
    ).trim();

    const liveRequested =
      params.live === "all" ||
      params.live === "true";

    const fixtures = sourceFixtures
      .filter((match) => {
        if (liveRequested) {
          const status = String(
            match.status || ""
          ).toUpperCase();

          const liveStatuses = [
            "LIVE",
            "1H",
            "2H",
            "HT",
            "ET",
            "BT",
            "P",
            "INT"
          ];

          if (!liveStatuses.includes(status)) {
            return false;
          }
        }

        if (
          leagueFilter &&
          String(match.league_id) !== leagueFilter
        ) {
          return false;
        }

        if (
          teamFilter &&
          String(match.home_id) !== teamFilter &&
          String(match.away_id) !== teamFilter
        ) {
          return false;
        }

        if (search) {
          const searchable = [
            match.home_team,
            match.away_team,
            match.league_name
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!searchable.includes(search)) {
            return false;
          }
        }

        return true;
      })
      .map((match) => {
        const rawStatus = String(
          match.status || "NS"
        );

        const status = rawStatus.toUpperCase();

        const minuteText = String(
          match.minute ?? ""
        );

        const elapsedMatch = minuteText.match(
          /^\s*(\d+)/
        );

        const elapsed = elapsedMatch
          ? Number(elapsedMatch[1])
          : null;

        let shortStatus = status;

        if (status === "SCHEDULED") {
          shortStatus = "NS";
        }

        if (status === "FINISHED") {
          shortStatus = "FT";
        }

        if (status === "POSTPONED") {
          shortStatus = "PST";
        }

        if (status === "CANCELLED") {
          shortStatus = "CANC";
        }

        const homeScore = match.home_score;
        const awayScore = match.away_score;

        return {
          fixture: {
            id: match.id,
            date:
              match.kickoff_utc ||
              match.datetime ||
              match.date,
            timestamp: match.kickoff_utc
              ? Math.floor(
                  new Date(match.kickoff_utc).getTime() /
                    1000
                )
              : null,
            timezone,
            status: {
              long: rawStatus,
              short: shortStatus,
              elapsed,
              seconds: null
            }
          },

          league: {
            id: match.league_id ?? null,
            name: match.league_name || "Football",
            country: match.league_zone || "",
            logo: null,
            flag: null,
            season: null,
            round: match.stage || null
          },

          teams: {
            home: {
              id: match.home_id ?? null,
              name: match.home_team || "Home",
              logo: null,
              winner: match.winner === "home"
            },

            away: {
              id: match.away_id ?? null,
              name: match.away_team || "Away",
              logo: null,
              winner: match.winner === "away"
            }
          },

          goals: {
            home: homeScore ?? null,
            away: awayScore ?? null
          },

          score: {
            halftime: {
              home: null,
              away: null
            },

            fulltime: {
              home: homeScore ?? null,
              away: awayScore ?? null
            },

            extratime: {
              home: null,
              away: null
            },

            penalty: {
              home: match.penalty_home ?? null,
              away: match.penalty_away ?? null
            }
          },

          // Preserve the provider's original data too.
          sportapi: match
        };
      });

    return res.status(200).json({
      get: "fixtures",
      provider: "SportAPI",
      date,
      results: fixtures.length,
      response: fixtures,
      clockNote:
        "SportAPI supplies the match status and minute. " +
        "Seconds are not invented because the documented " +
        "fixture data does not establish an authoritative " +
        "seconds-level match clock."
    });
  } catch (error) {
    console.error(
      "B_STREAMTV SportAPI error:",
      error.message
    );

    return res.status(502).json({
      error: "Could not retrieve football fixtures.",
      detail: error.message
    });
  }
};