export default async function handler(req, res) {
res.setHeader(
“Cache-Control”,
“s-maxage=20, stale-while-revalidate=40”
);
res.setHeader(“Access-Control-Allow-Origin”, “*”);


if (req.method !== “GET”) {
return res.status(405).json({
error: “Method not allowed.”
});
}

const key = process.env.FOOTBALL_API_KEY;
const fixture = req.query?.fixture;

if (!key) {
return res.status(500).json({
error: “Missing FOOTBALL_API_KEY environment variable in Vercel.”
});
}

if (!fixture || !/^\d+$/.test(String(fixture))) {
return res.status(400).json({
error: “Please provide a valid fixture ID.”
});
}

async function fetchFootball(endpoint) {
const response = await fetch(
https://v3.football.api-sports.io/${endpoint},
{
headers: {
“x-apisports-key”: key
}
}
);

const data = await response.json();
if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
  throw new Error("Football data provider request failed.");
}
return data.response || [];

}

try {
const id = encodeURIComponent(String(fixture));

const [info, statistics, events, lineups] = await Promise.all([
  fetchFootball(`fixtures?id=${id}`),
  fetchFootball(`fixtures/statistics?fixture=${id}`),
  fetchFootball(`fixtures/events?fixture=${id}`),
  fetchFootball(`fixtures/lineups?fixture=${id}`)
]);
return res.status(200).json({
  fixture: info[0] || null,
  statistics,
  events,
  lineups
});

} catch (error) {
return res.status(502).json({
error: “Unable to load match information right now.”
});
}
}