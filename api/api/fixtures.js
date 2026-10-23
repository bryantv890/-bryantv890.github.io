module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Please use a GET request."
    });
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "Missing FOOTBALL_API_KEY",
      fix: "Check Vercel > Settings > Environment Variables."
    });
  }

  const params = req.query || {};
  const apiParams = new URLSearchParams();

  apiParams.set("timezone", "Africa/Lagos");

  if (params.live === "all" || params.live === "true") {
    apiParams.set("live", "all");
  } else if (params.search) {
    apiParams.set("search", String(params.search).slice(0, 100));
  } else if (params.next) {
    apiParams.set("next", String(params.next));
  } else if (params.last) {
    apiParams.set("last", String(params.last));
  } else if (params.date) {
    apiParams.set("date", String(params.date));
  } else {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    apiParams.set("date", today);
  }

  for (const key of ["league", "season", "team"]) {
    if (params[key] && /^\d+$/.test(String(params[key]))) {
      apiParams.set(key, String(params[key]));
    }
  }

  const url =
    "https://v3.football.api-sports.io/fixtures?" +
    apiParams.toString();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY,
        "Accept": "application/json"
      }
    });

    const data = await response.json();

    if (!response.ok || (data.errors &&
        Object.keys(data.errors).length > 0)) {
      console.error("API-Sports error:", {
        status: response.status,
        errors: data.errors
      });

      return res.status(502).json({
        error: "API-Sports rejected the fixtures request.",
        httpStatus: response.status,
        providerErrors: data.errors || {},
        message: data.message || null
      });
    }

    return res.status(200).json({
      results: data.results || 0,
      response: data.response || []
    });

  } catch (error) {
    console.error("B_STREAMTV request error:", error.message);

    return res.status(502).json({
      error: "The server could not contact API-Sports.",
      detail: error.message
    });
  }
};