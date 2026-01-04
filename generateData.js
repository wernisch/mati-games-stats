import fs from "fs";
import fetch from "node-fetch";

const gameIds = [
  8649112027, 8641794993, 8617745696,
  8470216398, 8120277194, 8030001602,
  6431757712, 7016268111, 6789766645,
  6614175388, 6528524000, 6463581673,
  7096838238, 7166097502, 7517851351,
  7626153268, 7072328729, 6743843913,
  7334543566, 6829990681, 7263505269,
  7401898945, 7309264740, 7456466538,
  3071634329, 4800580998, 7288212525,
  2505069317, 5049176019, 2946951335,
  7424382390, 7168683817, 7349366409,
  8154106881, 7923536197, 8091666772,
  8631229462, 8385096583, 8975568157,

  9237378322, 6903750207, 7150443063,
  8283618573, 8099904322, 9323921130,
  9294279969, 8683739287, 

    8751472252, 8716119014, 8204633083
];

const proxyUrl = "https://workers-playground-white-credit-775c.bloxyhdd.workers.dev/?url=";

const BATCH_SIZE = 75;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 4;

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function backoffMs(attempt) {
  const base = Math.min(4000, 250 * Math.pow(2, attempt - 1));
  return base / 2 + Math.random() * base / 2;
}

function parseRetryAfter(v) {
  if (!v) return null;
  const s = Number(v);
  if (!Number.isNaN(s)) return Math.max(0, s * 1000);
  const d = Date.parse(v);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return null;
}

function wrap(url) {
  return proxyUrl ? proxyUrl + encodeURIComponent(url) : url;
}

async function fetchWithRetry(url, init = {}) {
  let lastErr, res;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      res = await fetch(url, { ...init, signal: controller.signal, headers: { ...(init.headers || {}), Origin: "null" } });
      clearTimeout(t);

      if (res.status === 429 && attempt < MAX_ATTEMPTS) {
        const ra = parseRetryAfter(res.headers.get("Retry-After"));
        await wait(ra ?? backoffMs(attempt));
        continue;
      }
      if (res.status >= 500 && res.status < 600 && attempt < MAX_ATTEMPTS) {
        await wait(backoffMs(attempt));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt === MAX_ATTEMPTS) break;
      await wait(backoffMs(attempt));
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

 async function fetchGamesBatch(ids) {
   const url = wrap(`https://games.roblox.com/v1/games?universeIds=${ids.join(",")}`);
   const res = await fetchWithRetry(url);
   if (!res.ok) throw new Error(`games ${res.status}`);
   const data = await res.json();
   const map = new Map();
   for (const g of data?.data || []) map.set(g.id, g);
   return map;
 }


async function fetchVotesBatch(ids) {
  const url = wrap(`https://games.roblox.com/v1/games/votes?universeIds=${ids.join(",")}`);
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`votes ${res.status}`);
  const data = await res.json();
  const map = new Map();
  for (const v of data?.data || []) {
    const total = (v.upVotes || 0) + (v.downVotes || 0);
    const likeRatio = total > 0 ? Math.round((v.upVotes / total) * 100) : 0;
    map.set(v.id, likeRatio);
  }
  return map;
}

async function fetchIconsBatch(ids) {
  const url = wrap(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids.join(",")}&size=768x432&format=Png&isCircular=false`);
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`thumbs ${res.status}`);
  const data = await res.json();
  const map = new Map();
  for (const row of data?.data || []) {
    const uni = row.universeId ?? row.targetId;
    const img = row?.thumbnails?.[0]?.imageUrl ?? null;
    map.set(uni, img);
  }
  return map;
}

(async () => {
  const allGames = [];
  const batches = chunk(gameIds, BATCH_SIZE);

  for (const ids of batches) {
    try {
      const [gamesMap, votesMap, iconsMap] = await Promise.all([
        fetchGamesBatch(ids),
        fetchVotesBatch(ids),
        fetchIconsBatch(ids)
      ]);

      for (const id of ids) {
        const game = gamesMap.get(id);
        if (!game) continue;

        allGames.push({
          id: game.id,
          rootPlaceId: game.rootPlaceId,
          name: game.name,
          playing: game.playing || 0,
          visits: game.visits || 0,
          likeRatio: votesMap.get(id) ?? 0,
          icon: iconsMap.get(id) ?? "",
          created: game.created ?? null,
          updated: game.updated ?? null,
          createdTs: game.created ? Date.parse(game.created) : null
        });
      }
      await wait(500);
    } catch (err) {
      console.error(`Batch failed for ids [${ids.join(",")}]:`, err);
    }
  }

  allGames.sort((a, b) => b.playing - a.playing);

  fs.mkdirSync("public", { recursive: true });
  fs.writeFileSync("public/games.json", JSON.stringify({ games: allGames }, null, 2));
})();
