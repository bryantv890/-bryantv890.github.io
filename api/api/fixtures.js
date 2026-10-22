export default async function handler(req, res) {
res.setHeader(
“Cache-Control”,
“s-maxage=15, stale-while-revalidate=30”
);
res.setHeader(“Access-Control-Allow-Origin”, “*”);

if (req.method !== “GET”) {
return res.status(405).json({
error: “Method not allowed.”
});
}

const key = process.env.FOOTBALL_API_KEY;

if (!key) {
return res.status(500).json({
error: “Missing FOOTBALL_API_KEY environment variable in Vercel.”
});
}

const {
live,
date,
search,
league,
season,
team,
next,
last,
timezone
} = req.query || {};

const params = new URLSearchParams();

// Choose the requested fixture type.
if (live === “all”) {
params.set(“live”, “all”);
} else if (date) {
params.set(“date”, String(date));
} else if (league && season) {
params.set(“league”, String(league));
params.set(“season”, String(season));
} else {
// Default: show live matches.
params.set(“live”, “all”);
}

// Optional filters.
if (search) params.set(“search”, String(search));
if (league) params.set(“league”, String(league));
if (season) params.set(“season”, String(season));
if (team) params.set(“team”, String(team));
if (next) params.set(“next”, String(next));
if (last) params.set(“last”, String(last));
if (timezone) params.set(“timezone”, String(timezone));

try {
const upstream = await fetch(
https://v3.football.api-sports.io/fixtures?${params.toString()},
{
headers: {
“x-apisports-key”: key
}
}
);

const body = await upstream.json();
if (!upstream.ok) {
  return res.status(upstream.status).json({
    error: "Football provider request failed.",
    details: body.errors || body.message || null
  });
}
if (body.errors && Object.keys(body.errors).length > 0) {
  return res.status(502).json({
    error: "Football API returned an error.",
    details: body.errors
  });
}
return res.status(200).json(body);

} catch (err) {
return res.status(502).json({
error: “Could not reach the football data provider.”
});
}
}
