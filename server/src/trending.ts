// Live AI reads for the Home dashboard via the public DEV Community API.
// Fixed upstream + strict URL validation avoids turning this into a proxy/SSRF
// endpoint. Successful data is cached for 30 minutes in the single process.

export interface TrendingItem {
  id: number;
  title: string;
  url: string;
  thumbnail: string;
  category: string;
  readTimeMinutes: number;
  publishedAt: string;
  reactions: number;
}

export interface TrendingData {
  ok: true;
  items: TrendingItem[];
  fetchedAt: string;
  source: "DEV Community";
}

const ENDPOINT = "https://dev.to/api/articles?tag=ai&per_page=20&top=7";
const TTL_MS = 30 * 60 * 1000;
let cache: { at: number; data: TrendingData } | null = null;

function devUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== "dev.to" && !url.hostname.endsWith(".dev.to")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function getTrending(): Promise<TrendingData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const res = await fetch(ENDPOINT, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      "User-Agent": "julie-ai-os/0.1.0",
    },
  });
  if (!res.ok) throw new Error(`DEV Community returned HTTP ${res.status}`);
  const raw: unknown = await res.json();
  if (!Array.isArray(raw)) throw new Error("DEV Community returned invalid article data");

  const items: TrendingItem[] = [];
  for (const value of raw) {
    const article = value as any;
    const url = devUrl(article?.url);
    const thumbnail = devUrl(article?.cover_image ?? article?.social_image);
    const title = typeof article?.title === "string" ? article.title.trim() : "";
    const id = Number(article?.id);
    if (!url || !thumbnail || !title || !Number.isInteger(id)) continue;
    const tags = Array.isArray(article.tag_list)
      ? article.tag_list.filter((tag: unknown): tag is string => typeof tag === "string")
      : [];
    const category = tags.find((tag: string) => tag.toLowerCase() !== "ai") ?? "AI";
    items.push({
      id,
      title: title.slice(0, 180),
      url,
      thumbnail,
      category,
      readTimeMinutes: Math.max(1, Math.min(120, Number(article.reading_time_minutes) || 1)),
      publishedAt: typeof article.published_at === "string" ? article.published_at : "",
      reactions: Math.max(0, Number(article.public_reactions_count) || 0),
    });
    if (items.length === 3) break;
  }
  if (items.length === 0) throw new Error("DEV Community returned no AI articles with thumbnails");

  const data: TrendingData = {
    ok: true,
    items,
    fetchedAt: new Date().toISOString(),
    source: "DEV Community",
  };
  cache = { at: Date.now(), data };
  return data;
}
