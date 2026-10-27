const express = require(“express”);
const path = require(“path”);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get(”/api/fixtures”, async (req, res) => {
res.setHeader(“Cache-Control”, “no-store”);

const API_KEY = process.env.FOOTBALL_API_KEY;

if (!API_KEY) {
return res.status(500).json({
success: false,
error: “Missing FOOTBALL_API_KEY in Render environment variables”
});
}

try {
const {
live,
date,
league,
search,
status,
page,
per_page
} = req.query;

const params = new URLSearchParams();
params.set("per_page", per_page || "100");
params.set("page", page || "1");
// 5DollarFootballAPI uses status=live for live matches.
if (live === "all") {
  params.set("status", "live");
} else if (status) {
  params.set("status", status);
} else {
  params.set("status", "all");
}
if (league) params.set("league", league);
// The API accepts a maximum 24-hour window.
if (date) {
  const start = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) {
    return res.status(400).json({
      success: false,
      error: "Invalid date. Use YYYY-MM-DD."
    });
  }
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  params.set("start_time", Math.floor(start.getTime() / 1000));
  params.set("end_time", Math.floor(end.getTime() / 1000));
}
const response = await fetch(
  `https://api.5dollarfootballapi.com/v1/fixtures?${params}`,
  {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: "application/json"
    }
  }
);
const body = await response.json();
if (!response.ok || !body.success) {
  return res.status(response.status || 502).json({
    success: false,
    error: body.error || body.message || "5DollarFootballAPI request failed"
  });
}
let fixtures = Array.isArray(body.data) ? body.data : [];
if (search) {
  const query = String(search).toLowerCase();
  fixtures = fixtures.filter(match => {
    const home = match.teams?.home?.name || "";
    const away = match.teams?.away?.name || "";
    const competition = match.league?.name || "";
    return `${home} ${away} ${competition}`
      .toLowerCase()
      .includes(query);
  });
}
return res.json({
  success: true,
  source: "5DollarFootballAPI",
  updatedAt: Date.now(),
  results: fixtures.length,
  response: fixtures,
  pagination: body.pagination || {}
});

} catch (error) {
return res.status(502).json({
success: false,
error: “Unable to connect to 5DollarFootballAPI”,
details: error.message
});
}
});

app.get(”/”, (req, res) => {
res.sendFile(path.join(__dirname, “index.html”));
});

app.listen(PORT, “0.0.0.0”, () => {
console.log(B_STREAMTV running on port ${PORT});
});