const API = "/api/fixtures";
const MATCH_API = "/api/match?fixture=";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let matches = [];
let liveMatches = [];
let selectedMatch = null;
let detail = {};
let detailTab = "overview";
let currentPage = "Home";
let leagueFilter = "";
let searchTerm = "";
let soundOn = localStorage.getItem("bst_sound") === "true";
let favourites = new Set(JSON.parse(localStorage.getItem("bst_favourites") || "[]"));
let previousScores = {};
let audioContext = null;
let loadBusy = false;

const savedTheme = localStorage.getItem("bst_theme");
if (savedTheme === "light") document.body.classList.add("light");

updateThemeButton();
$("#soundBtn").textContent = soundOn ? "🔔" : "🔕";
$("#profileSound").checked = soundOn;

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

/* Normalize SportsAPI Brazil and conventional football API data. */
function normalizeMatch(m) {
  const home = m.homeTeam || m.teams?.home || m.home || {};
  const away = m.awayTeam || m.teams?.away || m.away || {};

  const rawStatus = m.status;
  const status = typeof rawStatus === "string"
    ? { short: rawStatus }
    : (rawStatus || m.fixture?.status || {});

  const elapsedRaw = status.elapsed ?? m.elapsed ?? 0;
  const elapsed = Number.parseInt(elapsedRaw, 10) || 0;

  return {
    ...m,
    id: String(m.id ?? m.fixture?.id ?? ""),
    fixture: {
      ...(m.fixture || {}),
      id: String(m.id ?? m.fixture?.id ?? ""),
      date: m.fixture?.date || (m.startTime ? new Date(m.startTime).toISOString() : m.date),
      status: {
        ...status,
        short: String(status.short || "NS").toUpperCase(),
        elapsed
      },
      venue: m.fixture?.venue || {}
    },
    teams: {
      home: {
        ...home,
        name: home.name || "Home",
        logo: home.logo || home.crest || ""
      },
      away: {
        ...away,
        name: away.name || "Away",
        logo: away.logo || away.crest || ""
      }
    },
    league: m.league || m.competition || { name: "Football" },
    goals: {
      home: m.homeScore ?? m.goals?.home ?? m.score?.home ?? null,
      away: m.awayScore ?? m.goals?.away ?? m.score?.away ?? null
    },
    _providerClock: m.gameTimeDisplay || ""
  };
}

function fixtureId(m) {
  return String(m?.fixture?.id ?? m?.id ?? "");
}
function home(m) {
  return m?.teams?.home || {};
}
function away(m) {
  return m?.teams?.away || {};
}
function league(m) {
  return m?.league?.name || "Football";
}
function status(m) {
  return m?.fixture?.status || {};
}
function elapsed(m) {
  return Number(status(m).elapsed || 0);
}
function score(m) {
  const h = m?.goals?.home;
  const a = m?.goals?.away;
  return h == null && a == null ? "– : –" : `${h ?? 0} – ${a ?? 0}`;
}
function isLive(m) {
  const s = status(m).short;
  return ["1H", "2H", "HT", "ET", "P", "LIVE", "INPLAY", "BT"].includes(s)
    || String(m.status || "").toLowerCase() === "live";
}
function statusText(m) {
  if (isLive(m)) return "LIVE";
  const s = status(m).short;
  if (["FT", "AET", "PEN"].includes(s)) return "FT";
  return status(m).long || s || "Fixture";
}
function clockText(m) {
  if (!isLive(m)) return statusText(m);

  /* Prefer the clock supplied by the provider. */
  if (m._providerClock) return m._providerClock;

  const minute = elapsed(m);
  return minute ? `${minute}'` : "LIVE";
}
function logo(team) {
  if (!team?.logo) return "";
  return `<img class="crest" src="${esc(team.logo)}"
    alt="${esc(team.name)} logo" loading="lazy"
    onerror="this.style.visibility='hidden'">`;
}
function dateText(m) {
  const d = m?.fixture?.date;
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString([], {
      day: "numeric", month: "short"
    }) + " · " + new Date(d).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function matchCard(m) {
  const id = fixtureId(m);
  const h = home(m), a = away(m);
  const live = isLive(m);

  return `<article class="card">
    <div class="meta">
      <span>${esc(league(m))}</span>
      <span class="${live ? "livebadge" : ""}">
        ${live ? "● LIVE" : esc(statusText(m))}
      </span>
    </div>
    <div class="teams">
      <div class="team">${logo(h)}
        <span class="teamname">${esc(h.name)}</span>
      </div>
      <div class="scorebox">
        <div class="score">${esc(score(m))}</div>
        <div class="clock ${live ? "livebadge" : ""}" data-clock="${esc(id)}">
          ${esc(live ? clockText(m) : dateText(m))}
        </div>
      </div>
      <div class="team away">
        <span class="teamname">${esc(a.name)}</span>${logo(a)}
      </div>
    </div>
    <div class="cardfoot">
      <span class="subtle">${esc(m.fixture?.venue?.name || "Match details")}</span>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="star" data-fav="${esc(id)}">
          ${favourites.has(id) ? "★" : "☆"}
        </button>
        <button class="smallbtn" data-open="${esc(id)}">Match Center ↗</button>
      </div>
    </div>
  </article>`;
}

function renderList(el, arr, message = "No matches available.") {
  if (!el) return;
  el.innerHTML = arr.length
    ? arr.map(matchCard).join("")
    : `<div class="empty">${esc(message)}</div>`;
}

function bindCards() {
  $$("[data-open]").forEach(b => b.onclick = () => openMatch(b.dataset.open));
  $$("[data-fav]").forEach(b => b.onclick = () => {
    const id = b.dataset.fav;
    favourites.has(id) ? favourites.delete(id) : favourites.add(id);
    localStorage.setItem("bst_favourites", JSON.stringify([...favourites]));
    renderAll();
  });
}

function showToast(message) {
  const t = $("#toast");
  t.textContent = message;
  t.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => t.classList.add("hidden"), 3200);
}

function playGoalSound() {
  if (!soundOn) return;
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume();

    [660, 880, 990].forEach((freq, i) => {
      const o = audioContext.createOscillator();
      const g = audioContext.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(audioContext.destination);
      o.start(audioContext.currentTime + i * 0.15);
      o.stop(audioContext.currentTime + i * 0.15 + 0.12);
    });
  } catch (e) {}
}

function detectGoals(arr) {
  for (const m of arr) {
    const id = fixtureId(m);
    if (!id) continue;

    const now = score(m);
    if (previousScores[id] !== undefined &&
        previousScores[id] !== now && now !== "– : –") {
      showToast(`⚽ GOAL UPDATE: ${home(m).name} ${now} ${away(m).name}`);
      playGoalSound();
      if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    }
    previousScores[id] = now;
  }
}

function normalise(data) {
  const list = Array.isArray(data) ? data
    : Array.isArray(data?.response) ? data.response
    : Array.isArray(data?.fixtures) ? data.fixtures
    : Array.isArray(data?.data) ? data.data
    : [];

  return list.map(normalizeMatch);
}

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json();

  if (!r.ok || d?.success === false || d?.error) {
    throw Error(d?.error || `Request failed (${r.status})`);
  }
  return d;
}

async function loadMatches() {
  if (loadBusy) return;
  loadBusy = true;

  try {
    /* Fetch the endpoint already confirmed to work. */
    const data = await fetchJSON(API);
    const all = normalise(data);

    liveMatches = all.filter(isLive);

    /* Keep live matches and today's other fixtures together. */
    matches = all;

    detectGoals(all);

    $("#updated").textContent =
      "Updated " + new Date().toLocaleTimeString([], {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });

    renderAll();
  } catch (e) {
    console.error("B_STREAMTV fixture error:", e);

    $("#updated").textContent = "Data unavailable";

    if (!matches.length) {
      $("#homeLive").innerHTML =
        `<div class="error">${esc(e.message || "Could not load football data.")}</div>`;
      $("#homeToday").innerHTML =
        `<div class="empty">Fixtures unavailable.</div>`;
      $("#liveList").innerHTML =
        `<div class="error">${esc(e.message || "Could not load football data.")}</div>`;
    }
  } finally {
    loadBusy = false;
  }
}

function filtered(arr) {
  return arr.filter(m => {
    const text = `${home(m).name} ${away(m).name} ${league(m)}`.toLowerCase();
    return (!searchTerm || text.includes(searchTerm.toLowerCase()))
      && (!leagueFilter || league(m).toLowerCase().includes(leagueFilter.toLowerCase()));
  });
}

function renderAll() {
  const all = matches;
  const live = all.filter(isLive);

  renderList($("#homeLive"), filtered(live).slice(0, 5), "No live matches right now.");
  renderList($("#homeToday"), filtered(all).slice(0, 8), "No fixtures returned.");
  renderList($("#liveList"), filtered(live), "No live matches found.");
  renderList($("#favoritesList"), all.filter(m => favourites.has(fixtureId(m))), "Tap ☆ to save a match.");
  renderList($("#searchResults"), filtered(all), "No matches found.");
  renderList($("#analysisList"), live, "No live matches available.");

  $("#liveCount").textContent = `${live.length} LIVE`;
  $("#savedCount").textContent = `${favourites.size} saved`;
  $("#profileSound").checked = soundOn;

  bindCards();
}

function setPage(page) {
  currentPage = page;

  const ids = {
    Home: "homePage", Live: "livePage", Highlights: "highlightsPage",
    Favorites: "favoritesPage", Search: "searchPage",
    Analysis: "analysisPage", Profile: "profilePage"
  };

  Object.values(ids).forEach(id => $("#" + id)?.classList.add("hidden"));
  $("#matchPage").classList.add("hidden");
  if (ids[page]) $("#" + ids[page]).classList.remove("hidden");

  $$(".navbtn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  $$(".chip").forEach(b => b.classList.toggle("active", b.dataset.page === page));

  window.scrollTo({ top: 0, behavior: "smooth" });
  if (page === "Favorites") renderAll();
}

function updateThemeButton() {
  $("#themeBtn").textContent = document.body.classList.contains("light") ? "☾" : "☼";
}
function toggleTheme() {
  document.body.classList.toggle("light");
  localStorage.setItem("bst_theme",
    document.body.classList.contains("light") ? "light" : "dark");
  updateThemeButton();
}
function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem("bst_sound", String(soundOn));
  $("#soundBtn").textContent = soundOn ? "🔔" : "🔕";
  $("#profileSound").checked = soundOn;
  showToast(soundOn ? "Goal sound alerts enabled." : "Goal sound alerts muted.");
}

function renderDetailHeader(m) {
  $("#detailHero").innerHTML = `
    <div class="subtle">${esc(league(m))}</div>
    <div class="detailteams">
      <div class="detailteam">${logo(home(m))}${esc(home(m).name)}</div>
      <div>
        <div class="detailscore">${esc(score(m))}</div>
        <div class="detailclock">${esc(clockText(m))}</div>
      </div>
      <div class="detailteam">${logo(away(m))}${esc(away(m).name)}</div>
    </div>
    <div class="subtle">${esc(dateText(m))}</div>`;
}

async function openMatch(id) {
  selectedMatch = matches.find(m => fixtureId(m) === String(id));
  if (!selectedMatch) return showToast("Match not found.");

  setPage("Home");
  $("#homePage").classList.add("hidden");
  $("#matchPage").classList.remove("hidden");
  renderDetailHeader(selectedMatch);
  $("#detailContent").innerHTML = `<div class="loading">Loading match centre…</div>`;

  try {
    const d = await fetchJSON(MATCH_API + encodeURIComponent(id));
    detail = d?.response?.[0] || d?.response || d?.data?.[0] || d?.data || {};
  } catch (e) {
    detail = {};
  }

  renderDetailTab();
}

function renderDetailTab() {
  const m = selectedMatch;
  if (!m) return;

  if (detailTab === "overview") {
    $("#detailContent").innerHTML =
      `<div class="card"><h3 class="paneltitle">Match Information</h3>
      <div class="info"><span>Competition</span><b>${esc(league(m))}</b></div>
      <div class="info"><span>Status</span><b>${esc(statusText(m))}</b></div>
      <div class="info"><span>Kick-off</span><b>${esc(dateText(m))}</b></div></div>`;
  } else if (detailTab === "events") {
    $("#detailContent").innerHTML =
      `<div class="empty">Events depend on the match details provided by your API.</div>`;
  } else if (detailTab === "statistics") {
    $("#detailContent").innerHTML =
      `<div class="empty">Statistics depend on the match details provided by your API.</div>`;
  } else {
    $("#detailContent").innerHTML =
      `<div class="empty">Lineups depend on the match details provided by your API.</div>`;
  }
}

function updateProfile() {
  const n = localStorage.getItem("bst_name") || "Football Fan";
  $("#profileName").textContent = n;
  $("#avatar").textContent = (n.trim()[0] || "B").toUpperCase();
}

/* Buttons and navigation */
$$("[data-page]").forEach(b => b.addEventListener("click", () => setPage(b.dataset.page)));
$$("[data-goto]").forEach(b => b.addEventListener("click", () => setPage(b.dataset.goto)));

$("#themeBtn").onclick = toggleTheme;
$("#profileTheme").onclick = toggleTheme;
$("#soundBtn").onclick = toggleSound;
$("#profileSound").onchange = toggleSound;
$("#refreshBtn").onclick = loadMatches;
$("#backBtn").onclick = () => setPage("Home");

$("#detailTabs").querySelectorAll("button").forEach(b => b.onclick = () => {
  detailTab = b.dataset.tab;
  $$("#detailTabs button").forEach(x => x.classList.toggle("active", x === b));
  renderDetailTab();
});

$("#searchInput").addEventListener("input", e => {
  searchTerm = e.target.value.trim();
  renderAll();
});
$("#liveSearch").addEventListener("input", e => {
  searchTerm = e.target.value.trim();
  renderAll();
});

$("#editName").onclick = () => {
  const old = localStorage.getItem("bst_name") || "Football Fan";
  const name = prompt("Enter your display name:", old);
  if (name === null) return;
  localStorage.setItem("bst_name", name.trim() || "Football Fan");
  updateProfile();
};

$("#leagueButtons").querySelectorAll("[data-league]").forEach(b => b.onclick = () => {
  leagueFilter = leagueFilter === b.dataset.league ? "" : b.dataset.league;
  $("#leagueButtons").querySelectorAll("[data-league]").forEach(x =>
    x.classList.toggle("active", x.dataset.league === leagueFilter && !!leagueFilter));
  renderAll();
});

function tickClocks() {
  $$("[data-clock]").forEach(el => {
    const m = matches.find(x => fixtureId(x) === el.dataset.clock);
    if (m && isLive(m)) el.textContent = clockText(m);
  });
  if (selectedMatch) renderDetailHeader(selectedMatch);
}

updateProfile();
loadMatches();
setInterval(loadMatches, 15000);
setInterval(tickClocks, 1000);