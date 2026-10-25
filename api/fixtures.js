module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "FOOTBALL_API_KEY is missing from environment variables"
    });
  }

  try {
    const url =
      "https://sportsapi.com.br/api/v1/games" +
      "?sport=football&status=live&limit=100&offset=0";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json"
      }
    });

    const raw = await response.text();

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({
        error: "SportsAPI returned an invalid JSON response"
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "SportsAPI request failed",
        providerStatus: response.status,
        details: data
      });
    }

    const matches = Array.isArray(data.matches)
      ? data.matches
      : [];

    // Keep the original provider fields and add
    // aliases for common frontend match formats.
    const fixtures = matches.map((match) => ({
      ...match,

      fixture: {
        id: match.id,
        status: {
          short: match.status,
          elapsed: match.gameTimeDisplay || null
        }
      },

      teams: {
        home: {
          id: match.homeTeam?.id,
          name: match.homeTeam?.name || "Home",
          logo: match.homeTeam?.logo
            ? "https://sportsapi.com.br" +
              match.homeTeam.logo
            : null
        },

        away: {
          id: match.awayTeam?.id,
          name: match.awayTeam?.name || "Away",
          logo: match.awayTeam?.logo
            ? "https://sportsapi.com.br" +
              match.awayTeam.logo
            : null
        }
      },

      goals: {
        home: match.homeScore ?? 0,
        away: match.awayScore ?? 0
      },

      league: {
        id: match.league?.id,
        name: match.league?.name || "Football",
        country: match.league?.country || "",
        logo: match.league?.logo
          ? "https://sportsapi.com.br" +
            match.league.logo
          : null
      },

      clock: match.gameTimeDisplay || null
    }));

    return res.status(200).json({
      success: true,
      source: "SportsAPI Brazil",
      updatedAt: data.timestamp || Date.now(),
      results: fixtures.length,
      response: fixtures,
      matches: fixtures
    });

  } catch (error) {
    console.error("SportsAPI connection error:", error);

    return res.status(502).json({
      error: "Could not connect to SportsAPI Brazil"
    });
  }
};