export default async function handler(req, res) {
res.setHeader(“Cache-Control”, “s-maxage=20, stale-while-revalidate=40”);
res.setHeader(“Access-Control-Allow-Origin”, “*”);

if (req.method !== “GET”) {
return res.status(405).json({
error: “Method not allowed”
});
}

const key = process.env.FOOTBALL_API_KEY;
const fixture = req.query?.fixture;

if (!key) {
return res.status(500).json({
error: “Football API key is not configured”
});
}

if (!fixture || !/^\d+$/.test(String(fixture))) {
return res.status(400).json({
error: “Please provide a valid fixture ID”
});
}

const id = encodeURIComponent(String(fixture));

async function getFootballData(endpoint) {
const response = await fetch(
https://v3.football.api-sports.io/${endpoint},
{
method: “GET”,
headers: {
“x-apisports-key”: key
}
}
);

const data = await response.json();
if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
  throw new Error("Football API request failed");
}
return data.response || [];

}

try {
const [fixtures, statistics, events, lineups] = await Promise.all([
getFootballData(fixtures?id=${id}),
getFootballData(fixtures/statistics?fixture=${id}),
getFootballData(fixtures/events?fixture=${id}),
getFootballData(fixtures/lineups?fixture=${id})
]);

return res.status(200).json({
  fixture: fixtures[0] || null,
  statistics,
  events,
  lineups
});

} catch (error) {
return res.status(502).json({
error: “Unable to load match information right now”
});
}
}