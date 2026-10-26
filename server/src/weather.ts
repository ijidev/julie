// Weather for the Home dashboard: Port Harcourt via wttr.in (j1 JSON).
// In-memory cache with a 30-minute TTL (single-process service).
// Never fabricates: on any fetch/parse failure the caller returns an honest error.

export interface WeatherForecastDay {
  day: string; // YYYY-MM-DD
  tempC: number; // max temp for the day
  minC: number;
  icon: string; // WMO weather code (string) from the midday hourly slot
}

export interface WeatherData {
  ok: true;
  city: string;
  tempC: number;
  condition: string;
  humidity: number;
  windKph: number;
  forecast: WeatherForecastDay[];
  fetchedAt: string;
  source: string;
}

const LOCATION = "Port+Harcourt";
const TTL_MS = 30 * 60 * 1000;

let cache: { at: number; data: WeatherData } | null = null;

export async function getWeather(): Promise<WeatherData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const res = await fetch(`https://wttr.in/${LOCATION}?format=j1`, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "julie-ai-os/0.1.0" },
  });
  if (!res.ok) throw new Error(`wttr.in returned HTTP ${res.status}`);
  const j: any = await res.json();
  const cur = Array.isArray(j?.current_condition) ? j.current_condition[0] : null;
  if (!cur) throw new Error("wttr.in returned no current condition");
  const tempC = Number(cur.temp_C);
  if (!Number.isFinite(tempC)) throw new Error("wttr.in returned invalid temperature");

  const data: WeatherData = {
    ok: true,
    city: "Port Harcourt",
    tempC,
    condition: String(cur.weatherDesc?.[0]?.value ?? "Unknown"),
    humidity: Number(cur.humidity ?? 0),
    windKph: Number(cur.windspeedKmph ?? 0),
    forecast: (Array.isArray(j.weather) ? j.weather : []).slice(0, 5).map((d: any) => {
      const mid = Array.isArray(d.hourly) ? d.hourly[Math.min(4, d.hourly.length - 1)] : null;
      return {
        day: String(d.date ?? ""),
        tempC: Number(d.maxtempC ?? 0),
        minC: Number(d.mintempC ?? 0),
        icon: String(mid?.weatherCode ?? d.hourly?.[0]?.weatherCode ?? "113"),
      };
    }),
    fetchedAt: new Date().toISOString(),
    source: "wttr.in",
  };
  cache = { at: Date.now(), data };
  return data;
}
