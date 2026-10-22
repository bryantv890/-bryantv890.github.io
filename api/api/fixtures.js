export default async function handler(req, res) {
res.setHeader(“Cache-Control”, “s-maxage=20, stale-while-revalidate=40”);
res.setHeader(“Access-Control-Allow-Origin”, “*”);

const key = process.env.FOOTBALL_API_KEY;

if (!key) {
return res.status(500).json({
error: “Missing FOOTBALL_API_KEY environment variable in Vercel.”
});
}

const { live, date, search, league, season } = req.query || {};
const params = new URLSearchParams();

if (live === “all”) {
params.set(“live”, “all”);
} else if (date) {
params.set(“date”, String(date));
} else {
params.set(“live”, “all”);
}

if (search) params.set(“search”, String(search));
if (league) params.set(“league”, String(league));
if (season) params.set(“season”, String(season));

try {
const upstream = await fetch(
https://v3.football.api-sports.io/fixtures?${params.toString()},
{
headers: { “x-apisports-key”: key }
}
);

const body = await upstream.json();
if (!upstream.ok) {
  return res.status(upstream.status).json({
    error: "Football provider request failed.",
    details: body.errors || body.message || null
  });
}
if (body.errors && Object.keys(body.errors).length) {
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
