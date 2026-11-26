import { CONFIG } from "./config.js";

export const sb = CONFIG.SUPABASE_URL.startsWith("https://") && window.supabase
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY)
  : null;

const clean = v => Object.fromEntries(
  Object.entries(v).map(([k, x]) => [k, x === "" && /(^|_)date$/.test(k) ? null : x])
);

function fail(error) {
  if (!error) return;
  const e = new Error(error.message);
  e.code = error.code;
  e.details = error.details;
  e.name = error.code === "23505" ? "ConstraintError" : error.code === "23503" ? "ForeignKeyError" : "Error";
  if (e.name === "ForeignKeyError") e.message = "Invalid reference: " + error.message;
  throw e;
}

// TTL cache + in-flight request deduplication
const CACHE = new Map();
const INFLIGHT = new Map();
const TTL = {
  roles: 300_000,
  departments: 120_000,
  incident_categories: 120_000,
  incident_types: 120_000,
  locations: 60_000,
  users: 60_000
};
const DEFAULT_TTL = 20_000;

function cached(key, table, fetcher) {
  const hit = CACHE.get(key);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.data);
  if (INFLIGHT.has(key)) return INFLIGHT.get(key);
  const p = fetcher().then(data => {
    CACHE.set(key, { data, exp: Date.now() + (TTL[table] || DEFAULT_TTL) });
    INFLIGHT.delete(key);
    return data;
  }).catch(err => {
    INFLIGHT.delete(key);
    throw err;
  });
  INFLIGHT.set(key, p);
  return p;
}

export const DB = {
  invalidate(table) {
    if (!table) { CACHE.clear(); return; }
    for (const k of CACHE.keys()) {
      if (k === `all:${table}` || k.startsWith(`idx:${table}:`) || k.startsWith(`get:${table}:`)) {
        CACHE.delete(k);
      }
    }
  },
  async open() {
    if (!sb) throw new Error("Supabase is not configured. Check js/config.js.");
    return sb;
  },
  async all(table, { fresh = false } = {}) {
    const key = `all:${table}`;
    if (fresh) CACHE.delete(key);
    return cached(key, table, async () => {
      const out = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select("*").order("id").range(from, from + 999);
        fail(error);
        out.push(...data);
        if (data.length < 1000) return out;
      }
    });
  },
  async get(table, id) {
    if (id == null || id === "" || isNaN(Number(id))) return undefined;
    const numId = Number(id);
    const allHit = CACHE.get(`all:${table}`);
    if (allHit && allHit.exp > Date.now()) {
      return allHit.data.find(r => r.id === numId);
    }
    return cached(`get:${table}:${numId}`, table, async () => {
      const { data, error } = await sb.from(table).select("*").eq("id", numId).maybeSingle();
      fail(error);
      return data || undefined;
    });
  },
  async add(table, record) {
    const { data, error } = await sb.from(table).insert(clean(record)).select("id").single();
    fail(error);
    this.invalidate(table);
    return data.id;
  },
  async put(table, record) {
    const { id, ...rest } = clean(record);
    const { error } = await sb.from(table).update(rest).eq("id", id).select("id").single();
    fail(error);
    this.invalidate(table);
    return id;
  },
  async byIndex(table, col, val) {
    return cached(`idx:${table}:${col}:${val}`, table, async () => {
      const { data, error } = await sb.from(table).select("*").eq(col, val).order("id");
      fail(error);
      return data;
    });
  },
  async testRelations() {
    const bad = [];
    const names = [...new Set(Object.entries(CONFIG.FKS).flatMap(([k, p]) => [k.split(".")[0], p]))];
    const T = Object.fromEntries(await Promise.all(names.map(async n => [n, await DB.all(n)])));
    for (const [fk, parent] of Object.entries(CONFIG.FKS)) {
      const [store, field] = fk.split(".");
      const ids = new Set(T[parent].map(r => r.id));
      T[store].forEach(r => {
        if (r[field] != null && !ids.has(r[field])) bad.push(`${fk} #${r.id}`);
      });
    }
    return bad;
  }
};

export async function loadMe() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const u = (await DB.byIndex("users", "auth_id", session.user.id))[0];
  return u && u.active ? u : null;
}