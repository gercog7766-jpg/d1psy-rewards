// Only the singleton giveaway settings are cached; balances, users and rounds stay live.
// Clients keep separate caches so credentials/projects are never mixed. Any local write
// invalidates every client, including reads that were already in flight.
const TTL_MS = 15_000;
let revision = 0;
const entries = new WeakMap<object, { revision: number; expires: number; value?: any; pending?: Promise<any> }>();

export function invalidateSettingsCache() { revision++; }

export async function readSettings(db: any): Promise<any> {
  for (;;) {
    const version = revision;
    let entry = entries.get(db);
    if (!entry || entry.revision !== version || entry.expires <= Date.now()) {
      entry = { revision: version, expires: Infinity };
      const current = entry;
      current.pending = Promise.resolve().then(() => db.from('rewards_settings').select('*').eq('id', true).single()).then(result => {
        // Never cache database failures or missing settings; do not mask outages.
        current.expires = !result.error && result.data ? Date.now() + TTL_MS : 0;
        current.value = result;
        return result;
      }, error => { current.expires = 0; throw error; });
      entries.set(db, current);
    }
    const result = entry.pending ? await entry.pending : entry.value;
    if (version !== revision) continue;
    return structuredClone(result);
  }
}

export async function updateSettings(db: any, values: Record<string, unknown>) {
  invalidateSettingsCache();
  try { return await db.from('rewards_settings').update(values).eq('id', true); }
  finally { invalidateSettingsCache(); }
}
