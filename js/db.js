const SEED = {
  roles: ["Admin", "Investigator", "Reporter Officer", "Viewer"].map(name => ({ name })),
  departments: ["Administration", "Security", "IT", "Facilities", "Human Resources", "Academic Affairs"].map(name => ({ name, active: true })),
  incident_categories: ["Safety", "Security", "Accident", "Property Damage", "Workplace", "IT/Technical", "Environmental", "Health", "Other"].map(name => ({ name, description: "", active: true })),
  incident_types: [["Slip/Fall", 1], ["Equipment Failure", 1], ["Theft", 2], ["Unauthorized Access", 2], ["Fire", 7], ["Data Incident", 6], ["Vehicle Accident", 3], ["Physical Injury", 8]]
    .map(([name, category_id]) => ({ name, category_id, active: true })),
  locations: ["Main Building", "Parking Lot", "Library", "Laboratory", "Cafeteria"].map(name => ({ name }))
};

function upgrade(e) {
  const db = e.target.result, tx = e.target.transaction;
  for (const [name, idx] of Object.entries(CONFIG.SCHEMA)) {
    if (db.objectStoreNames.contains(name)) db.deleteObjectStore(name);
    const s = db.createObjectStore(name, { keyPath: "id", autoIncrement: true });
    idx.forEach(([i, unique]) => s.createIndex(i, i, { unique: !!unique }));
  }
  for (const [n, rows] of Object.entries(SEED)) rows.forEach(r => tx.objectStore(n).add(r));
}

const DB = {
  _p: null,
  open() {
    return this._p || (this._p = new Promise((ok, no) => {
      const r = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      r.onupgradeneeded = upgrade;
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }));
  },
  async run(store, mode, fn) {
    const db = await this.open();
    return new Promise((ok, no) => {
      const q = fn(db.transaction(store, mode).objectStore(store));
      q.onsuccess = () => ok(q.result);
      q.onerror = e => { e.preventDefault(); no(q.error); };
    });
  },
  all: s => DB.run(s, "readonly", o => o.getAll()),
  get: (s, id) => DB.run(s, "readonly", o => o.get(Number(id))),
  add: (s, v) => DB.run(s, "readwrite", o => o.add(v)),
  put: (s, v) => DB.run(s, "readwrite", o => o.put(v)),
  byIndex: (s, i, v) => DB.run(s, "readonly", o => o.index(i).getAll(v)),
  // Lab 3: verify every foreign key points to an existing parent row
  async testRelations() {
    const bad = [];
    for (const [fk, parent] of Object.entries(CONFIG.FKS)) {
      const [store, field] = fk.split(".");
      const ids = new Set((await DB.all(parent)).map(r => r.id));
      (await DB.all(store)).forEach(r => { if (r[field] != null && !ids.has(r[field])) bad.push(`${fk} #${r.id}`); });
    }
    return bad;
  }
};

// Homepage connection test (only runs where the status elements exist)
const statusEl = document.getElementById("dbStatus");
if (statusEl) {
  DB.open().then(async () => {
    statusEl.textContent = "Connected"; statusEl.className = "ok";
    document.getElementById("dbCount").textContent = (await DB.all("incidents")).length;
    const bad = await DB.testRelations(), rel = document.getElementById("dbRel");
    rel.textContent = bad.length ? "Broken: " + bad.join(", ") : "All foreign keys valid";
    rel.className = bad.length ? "fail" : "ok";
  }).catch(() => { statusEl.textContent = "Not connected"; statusEl.className = "fail"; });
}
