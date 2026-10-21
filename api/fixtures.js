module.exports = async function handler(req, res) {
  try {
    const apiKey = process.env.FOOTBALL_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "FOOTBALL_API_KEY is missing in Vercel."
      });
    }

    const response = await fetch(
      "https://v3.football.api-sports.io/fixtures?live=all",
      {
        headers: {
          "x-apisports-key": apiKey
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(502).json({
        error: "Football provider error",
        status: response.status
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Fixtures function failed:", error);

    return res.status(500).json({
      error: "Fixtures function failed",
      details: String(error)
    });
  }
};