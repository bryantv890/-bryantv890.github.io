exports.handler = async function () {
  const apiKey = process.env.FOOTBALL_API_KEY;

  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "Football API key is not configured."
      })
    };
  }

  try {
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
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: "Football data provider returned an error."
        })
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60"
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    return {
      statusCode: 502,
      body: JSON.stringify({
        error: "Unable to fetch live football scores."
      })
    };
  }
};