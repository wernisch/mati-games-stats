import fs from "fs";
import fetch from "node-fetch";

const gameIds = [
  8649112027, // Break Bones Tower
  8641794993, // Kids vs Parents Tower
  8617745696, // Draw Troll Tower
  8470216398, // [🎃] Protect The House From Brainrots
  8120277194, // [UPD]Squid Game Roleplay Tower
  8030001602, // Superhero Jump Clicker 🦸🚀
  6431757712, // Find the Ducks 🐤
  7016268111, // Find the Ducks 2 🐤
  6789766645, // Find the Doges 🐶
  6614175388, // Find the Monkeys 🐵
  6528524000, // Find the Frogs 🐸
  6463581673, // Find the Teddy Bears 🧸
  7096838238, // Evade Protocol | FPS
  7166097502, // [UPD] Parkour Rush
  7517851351, // Midnight Sprunki [HORROR]
  7626153268, // 🏁 Parkour Obby [W7]
  7072328729, // Wait in Line to Become Frontman 🦑
  6743843913, // 2 Player Duck Tycoon
  7334543566, // Grow Your Duck! 🐤
  6829990681, // Planets Merge Tycoon
  7263505269, // Find the Dinos 🦕
  7401898945, // Midnight Stalker [HORROR]
  7309264740, // Midnight Groceries [HORROR]
  7456466538, // Midnight Easter [HORROR]
  4800580998, // Hell Battlegrounds
  7288212525, // Emoji Murder
  2505069317, // Gold Mining Tycoon
  5049176019, // Slingshot Obby [2 Player Obby]
  2946951335, // Squid Game [S3]
  7424382390, // ??? (7424382390)
  7168683817, // [UPD] Crazy Shooter 🔫
  7349366409, // Blobfish Evolution
  8154106881, // Feed Your Meme
  7923536197, // Brainrot Stairs
  8091666772, // Build a Capybara Army 🍊
  8631229462, // Find the Ducks 3 🐤
  8385096583, // Swimming Brainrots 🏊
  8975568157, // Start your Business!
  9237378322, // Real or Cake? 🍰
  6903750207, // Santa Ride [2 Player Obby]
  7150443063, // 🏀 Hoop Universe Basketball
  8283618573, // Catch Critters [🐞]
  8099904322, // Ball Simulator [😡 UPD]
  9323921130, // Own a Zoo!
  9294279969, // Own a Mall!
  8751472252, // Skateboard Troll Tower 🛹
  8716119014, // Find the Fish [120]
  8204633083, // climb the grand canyon
  9417988934, // Obby But You're a Duckling  🐤
  9486176869, // Hockey Battles 🏒
  9369562154, // Spin for Items!
  9610663661, // Break Lucky Blocks For Soccer Cards
  9693639503, // SNIPER SPLEEF
  7847641787, // [RUBBER] Project: Basketball
  7138124890, // [HUGO] Project: Blue Lock
  8371948275, // 2 Player Anime Battle Tycoon
  9062062333, // Build a Troll Tower
];

const proxyUrl = "https://brejndead.net/stats-api/robloxapi.php?url=";

const BATCH_SIZE = 50;
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
