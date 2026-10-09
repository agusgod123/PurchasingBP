import { db, type DbOrTx } from "@/server/db";

export { DEFAULT_SETTINGS, SETTING_DESCRIPTIONS, type Settings } from "@/server/settings-defaults";
import { DEFAULT_SETTINGS, type Settings } from "@/server/settings-defaults";

let cache: { at: number; value: Settings } | null = null;
const CACHE_MS = 30_000;

export async function getSettings(client: DbOrTx = db): Promise<Settings> {
  if (cache && Date.now() - cache.at < CACHE_MS && client === db) return cache.value;
  const rows = await client.systemSetting.findMany();
  const value: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      (value as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  if (client === db) cache = { at: Date.now(), value };
  return value;
}

export async function getSetting<K extends keyof Settings>(key: K, client: DbOrTx = db): Promise<Settings[K]> {
  return (await getSettings(client))[key];
}

export function invalidateSettingsCache(): void {
  cache = null;
}
