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

const proxyUrl = "https://vaulted.gg/stats-api/robloxapi.php?url=";
const OutputPath = "public/games.json";
const BatchSize = 50;
const RequestTimeoutMs = 20000;
const MaxAttempts = 4;
const MinGamesThreshold = Math.floor(GameIds.length * 0.5);

const Wait = (ms) => new Promise((r) => setTimeout(r, ms));

function Chunk(arr, size) {
  const Out = [];
  for (let i = 0; i < arr.length; i += size) Out.push(arr.slice(i, i + size));
  return Out;
}

function BackoffMs(attempt) {
  const Base = Math.min(4000, 250 * Math.pow(2, attempt - 1));
  return Base / 2 + (Math.random() * Base) / 2;
}

function ParseRetryAfter(v) {
  if (!v) return null;
  const s = Number(v);
  if (!Number.isNaN(s)) return Math.max(0, s * 1000);
  const d = Date.parse(v);
  if (!Number.isNaN(d)) return Math.max(0, d - Date.now());
  return null;
}

function Wrap(url) {
  return ProxyUrl ? ProxyUrl + encodeURIComponent(url) : url;
}

async function FetchWithRetry(url, init = {}) {
  let LastErr, Res;
  for (let Attempt = 1; Attempt <= MaxAttempts; Attempt++) {
    try {
      const Controller = new AbortController();
      const Timer = setTimeout(() => Controller.abort(), RequestTimeoutMs);
      Res = await fetch(url, {
        ...init,
        signal: Controller.signal,
        headers: { ...(init.headers || {}), Origin: "null" },
      });
      clearTimeout(Timer);

      if (Res.status === 429 && Attempt < MaxAttempts) {
        const Ra = ParseRetryAfter(Res.headers.get("Retry-After"));
        await Wait(Ra ?? BackoffMs(Attempt));
        continue;
      }
      if (Res.status >= 500 && Res.status < 600 && Attempt < MaxAttempts) {
        await Wait(BackoffMs(Attempt));
        continue;
      }
      return Res;
    } catch (e) {
      LastErr = e;
      if (Attempt === MaxAttempts) break;
      await Wait(BackoffMs(Attempt));
    }
  }
  throw LastErr || new Error(`Failed to fetch ${url}`);
}

async function FetchGamesBatch(ids) {
  const Url = Wrap(
    `https://games.roblox.com/v1/games?universeIds=${ids.join(",")}`
  );
  const Res = await FetchWithRetry(Url);
  if (!Res.ok) throw new Error(`games ${Res.status}`);
  const Data = await Res.json();
  const Map = new Map();
  for (const g of Data?.data || []) Map.set(g.id, g);
  return Map;
}

async function FetchVotesBatch(ids) {
  const Url = Wrap(
    `https://games.roblox.com/v1/games/votes?universeIds=${ids.join(",")}`
  );
  const Res = await FetchWithRetry(Url);
  if (!Res.ok) throw new Error(`votes ${Res.status}`);
  const Data = await Res.json();
  const VoteMap = new Map();
  for (const v of Data?.data || []) {
    const Total = (v.upVotes || 0) + (v.downVotes || 0);
    const LikeRatio = Total > 0 ? Math.round((v.upVotes / Total) * 100) : 0;
    VoteMap.set(v.id, LikeRatio);
  }
  return VoteMap;
}

async function FetchIconsBatch(ids) {
  const Url = Wrap(
    `https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${ids.join(",")}&size=768x432&format=Png&isCircular=false`
  );
  const Res = await FetchWithRetry(Url);
  if (!Res.ok) throw new Error(`thumbs ${Res.status}`);
  const Data = await Res.json();
  const IconMap = new Map();
  for (const Row of Data?.data || []) {
    const Uni = Row.universeId ?? Row.targetId;
    const Img = Row?.thumbnails?.[0]?.imageUrl ?? null;
    IconMap.set(Uni, Img);
  }
  return IconMap;
}

function LoadPreviousData() {
  try {
    if (!fs.existsSync(OutputPath)) return null;
    const Raw = fs.readFileSync(OutputPath, "utf-8");
    const Parsed = JSON.parse(Raw);
    if (Array.isArray(Parsed?.games) && Parsed.games.length > 0) return Parsed;
  } catch {
    return null;
  }
  return null;
}

(async () => {
  const AllGames = [];
  const Batches = Chunk(GameIds, BatchSize);

  for (const Ids of Batches) {
    try {
      const [GamesMap, VotesMap, IconsMap] = await Promise.all([
        FetchGamesBatch(Ids),
        FetchVotesBatch(Ids),
        FetchIconsBatch(Ids),
      ]);

      for (const Id of Ids) {
        const Game = GamesMap.get(Id);
        if (!Game) continue;

        AllGames.push({
          id: Game.id,
          rootPlaceId: Game.rootPlaceId,
          name: Game.name,
          playing: Game.playing || 0,
          visits: Game.visits || 0,
          likeRatio: VotesMap.get(Id) ?? 0,
          icon: IconsMap.get(Id) ?? "",
          created: Game.created ?? null,
          updated: Game.updated ?? null,
          createdTs: Game.created ? Date.parse(Game.created) : null,
        });
      }
      await Wait(500);
    } catch (err) {
      console.error(`Batch failed for ids [${Ids.join(",")}]:`, err);
    }
  }

  AllGames.sort((a, b) => b.playing - a.playing);

  const NewData = { games: AllGames };
  const PreviousData = LoadPreviousData();

  if (AllGames.length >= MinGamesThreshold) {
    fs.mkdirSync("public", { recursive: true });
    fs.writeFileSync(OutputPath, JSON.stringify(NewData, null, 2));
    console.log(`Wrote ${AllGames.length} games to ${OutputPath}`);
  } else if (PreviousData) {
    console.warn(
      `Only fetched ${AllGames.length}/${GameIds.length} games (below threshold of ${MinGamesThreshold}). Keeping previous data with ${PreviousData.games.length} games.`
    );
  } else {
    fs.mkdirSync("public", { recursive: true });
    fs.writeFileSync(OutputPath, JSON.stringify(NewData, null, 2));
    console.warn(
      `Only fetched ${AllGames.length} games and no previous data exists. Wrote partial data.`
    );
  }
})();
