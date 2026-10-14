/* =====================================================================
   Incident Reporting System — single-file app (Labs 1-20)
   1 Config · 2 Database · 3 Helpers · 4 Pages · 5 Router
   ===================================================================== */

/* ---------- 1. CONFIG ---------- */
const CONFIG = {
  DB_NAME: "IncidentReportingDB",
  DB_VERSION: 3, // v3: richer locations, seeded users, extra indexes. Upgrade keeps existing data.
  // store: [[indexName, unique?], ...]  (every store: id, autoIncrement)
  SCHEMA: {
    roles: [["name", 1]],
    users: [["username", 1], ["role_id"], ["department_id"]],
    departments: [["name", 1]],
    reporters: [["reporter_no", 1], ["department_id"], ["reporter_type"], ["status"]],
    incident_categories: [["name", 1]],
    incident_types: [["category_id"], ["name"]],
    locations: [["name", 1], ["department_id"], ["status"]],
    incidents: [["incident_no", 1], ["reporter_id"], ["category_id"], ["type_id"], ["location_id"], ["severity"], ["status"], ["incident_date"]],
    incident_attachments: [["incident_id"]],
    investigations: [["incident_id"], ["investigator_id"], ["status"]],
    investigation_findings: [["investigation_id"]],
    investigation_evidence: [["investigation_id"]],
    actions: [["investigation_id"], ["incident_id"], ["assigned_to"], ["status"]],
    action_monitoring: [["action_id"]],
    resolutions: [["incident_id", 1]],
    notifications: [["user_id"], ["incident_id"]],
    audit_logs: [["user_id"], ["entity"]]
  },
  FKS: { // for the relationship test: store.field -> parent store
    "users.role_id": "roles", "users.department_id": "departments",
    "reporters.department_id": "departments", "incident_types.category_id": "incident_categories",
    "locations.department_id": "departments",
    "incidents.reporter_id": "reporters", "incidents.category_id": "incident_categories",
    "incidents.type_id": "incident_types", "incidents.location_id": "locations",
    "incident_attachments.incident_id": "incidents",
    "investigations.incident_id": "incidents", "investigations.investigator_id": "users",
    "investigation_findings.investigation_id": "investigations", "investigation_evidence.investigation_id": "investigations",
    "investigation_evidence.uploaded_by": "users",
    "actions.investigation_id": "investigations", "actions.incident_id": "incidents", "actions.assigned_to": "users",
    "action_monitoring.action_id": "actions", "resolutions.incident_id": "incidents",
    "notifications.user_id": "users", "notifications.incident_id": "incidents", "audit_logs.user_id": "users"
  }
};

/* ---------- 2. DATABASE ---------- */
const SEED = {
  roles: ["Admin", "Investigator", "Reporter Officer", "Viewer"].map(name => ({ name })),
  departments: ["Administration", "Security", "IT", "Facilities", "Human Resources", "Academic Affairs"].map(name => ({ name, active: true })),
  incident_categories: ["Safety", "Security", "Accident", "Property Damage", "Workplace", "IT/Technical", "Environmental", "Health", "Other"].map(name => ({ name, description: "", active: true })),
  incident_types: [["Slip/Fall", 1], ["Equipment Failure", 1], ["Theft", 2], ["Unauthorized Access", 2], ["Fire", 7], ["Data Incident", 6], ["Vehicle Accident", 3], ["Physical Injury", 8]]
    .map(([name, category_id]) => ({ name, category_id, active: true })),
  locations: ["Main Building", "Parking Lot", "Library", "Laboratory", "Cafeteria"]
    .map(b => ({ name: b, building: b, floor: "", room: "", area: "", department_id: null, description: "", status: "Active" })),
  users: [["admin", "System Admin", 1], ["investigator1", "Investigator One", 2], ["investigator2", "Investigator Two", 2], ["viewer1", "Viewer One", 4]]
    .map(([username, full_name, role_id]) => ({ username, full_name, password_hash: "", role_id, department_id: null, active: true }))
};

function upgrade(e) {
  const db = e.target.result, tx = e.target.transaction;
  for (const [n, idx] of Object.entries(CONFIG.SCHEMA)) {
    const s = db.objectStoreNames.contains(n) ? tx.objectStore(n) : db.createObjectStore(n, { keyPath: "id", autoIncrement: true });
    idx.forEach(([i, u]) => { if (!s.indexNames.contains(i)) s.createIndex(i, i, { unique: !!u }); });
  }
  if (e.oldVersion === 0) {
    for (const [n, rows] of Object.entries(SEED)) rows.forEach(r => tx.objectStore(n).add(r));
  } else if (e.oldVersion < 3) { // keep old data: seed users, upgrade old location rows
    SEED.users.forEach(r => tx.objectStore("users").add(r));
    tx.objectStore("locations").openCursor().onsuccess = ev => {
      const c = ev.target.result; if (!c) return;
      if (!c.value.status) c.update({ ...c.value, building: c.value.name, floor: "", room: "", area: "", department_id: null, description: "", status: "Active" });
      c.continue();
    };
  }
}

const DB = {
  _p: null,
  open() {
    return this._p || (this._p = new Promise((ok, no) => {
      const r = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      r.onupgradeneeded = upgrade;
      r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); ok(r.result); };
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
  add: (s, v) => DB.run(s, "readwrite", o => o.add(v)),   // resolves with the new id
  put: (s, v) => DB.run(s, "readwrite", o => o.put(v)),
  byIndex: (s, i, v) => DB.run(s, "readonly", o => o.index(i).getAll(v)),
  async testRelations() { // verify every foreign key points to an existing parent row
    const bad = [];
    for (const [fk, parent] of Object.entries(CONFIG.FKS)) {
      const [store, field] = fk.split(".");
      const ids = new Set((await DB.all(parent)).map(r => r.id));
      (await DB.all(store)).forEach(r => { if (r[field] != null && !ids.has(r[field])) bad.push(`${fk} #${r.id}`); });
    }
    return bad;
  }
};

/* ---------- 3. HELPERS ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opts = (list, label = "name") => list.map(x => `<option value="${x.id}">${esc(typeof label === "function" ? label(x) : x[label])}</option>`).join("");
const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
const val = id => $("#" + id).value.trim();
const nowISO = () => new Date().toISOString();
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fmtD = s => (s ? esc(String(s).slice(0, 10)) : "—");
const bd = (t, k = t) => `<span class="badge ${String(k).replace(/\s/g, "")}">${esc(t)}</span>`;
const ph = t => `<option value="">${t}</option>`;
const types3 = a => a.map(t => `<option>${t}</option>`).join("");
function msg(text, ok = true) {
  const m = $("#msg"); if (!m) return;
  m.textContent = text; m.className = "msg " + (ok ? "ok" : "fail");
  clearTimeout(msg.t); msg.t = setTimeout(() => (m.textContent = ""), 5000);
}

let ME = null, ROLES = {};                       // acting user + role lookup
const canInv = () => ["Admin", "Investigator"].includes(ROLES[ME.role_id]?.name);
const audit = (entity, entity_id, action, details = "") =>
  DB.add("audit_logs", { user_id: ME.id, entity, entity_id, action, details, created_at: nowISO() });

/* Per-page handlers (reset on every navigation) */
let A = {}, S = {}, CH = {}, I = null; // A: click actions · S: form submits · CH: change by id/data-c · I: filter input
const app = () => $("#app");

/* ---------- 4. PAGES ---------- */
const PAGES = {}, TITLES = {
  home: "Incident Reporting System", reporters: "Reporter Management", profile: "Reporter Profile",
  categories: "Categories & Types", locations: "Location Management", report: "Report Incident",
  incidents: "Incident Monitoring", locmon: "Location Monitoring", investigations: "Investigations", actions: "Corrective Actions"
};
const LINKS = [["home", "Home"], ["reporters", "Reporters"], ["categories", "Categories & Types"], ["locations", "Locations"],
  ["report", "Report Incident"], ["incidents", "Incidents"], ["locmon", "Location Monitoring"], ["investigations", "Investigations"], ["actions", "Actions"]];

/* Lab 1 — Home / connection test */
PAGES.home = async () => {
  const [inc, inv, act] = await Promise.all(["incidents", "investigations", "actions"].map(s => DB.all(s)));
  const bad = await DB.testRelations();
  app().innerHTML = `<p>Welcome! Report and track incidents in one place.</p><div class="card">
    <p>Database status: <strong class="ok">Connected</strong></p>
    <p>Incidents: <strong>${inc.length}</strong> · Investigations: <strong>${inv.length}</strong> · Actions: <strong>${act.length}</strong></p>
    <p>Relationship test: <strong class="${bad.length ? "fail" : "ok"}">${bad.length ? "Broken: " + esc(bad.join(", ")) : "All foreign keys valid"}</strong></p></div>`;
};

/* Labs 4-5 — Reporter registration + management */
PAGES.reporters = async () => {
  const depts = await DB.all("departments"), dn = byId(depts); let editing = null;
  const F = ["reporter_no", "full_name", "department_id", "position", "contact", "email", "address", "reporter_type", "status"];
  const T = types3(["Employee", "Student", "Visitor", "Contractor"]);
  app().innerHTML = `<form id="rform"><h3 id="ftitle">Register Reporter</h3><div class="grid">
    <label>Employee/Student ID *<input id="reporter_no"></label><label>Full Name *<input id="full_name"></label>
    <label>Department *<select id="department_id">${ph("-- Select --")}${opts(depts)}</select></label>
    <label>Position<input id="position"></label><label>Contact Number<input id="contact"></label>
    <label>Email<input id="email" type="email"></label><label>Address<input id="address"></label>
    <label>Reporter Type *<select id="reporter_type">${T}</select></label>
    <label>Status<select id="status"><option>Active</option><option>Inactive</option></select></label></div>
    <button>Save Reporter</button> <button type="button" class="sec" data-a="clear">Clear</button></form>
    <div class="card grid flt"><label>Search name<input id="qname"></label><label>Search ID<input id="qid"></label>
    <label>Department<select id="fdept">${ph("All departments")}${opts(depts)}</select></label>
    <label>Type<select id="ftype">${ph("All types")}${T}</select></label></div>
    <div class="table-wrap"><table><thead><tr><th>ID</th><th>Name</th><th>Department</th><th>Type</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const render = async () => {
    const n = val("qname").toLowerCase(), i = val("qid").toLowerCase(), d = $("#fdept").value, t = $("#ftype").value;
    const rows = (await DB.all("reporters")).filter(r => r.full_name.toLowerCase().includes(n) && r.reporter_no.toLowerCase().includes(i) && (!d || r.department_id == d) && (!t || r.reporter_type === t));
    $("#rows").innerHTML = rows.map(r => `<tr><td>${esc(r.reporter_no)}</td><td><a href="#profile?id=${r.id}">${esc(r.full_name)}</a></td>
      <td>${esc(dn[r.department_id]?.name)}</td><td>${esc(r.reporter_type)}</td><td>${esc(r.contact)}</td><td>${bd(r.status)}</td>
      <td><button class="sec" data-a="edit" data-id="${r.id}">Edit</button> <button class="sec" data-a="tog" data-id="${r.id}">${r.status === "Active" ? "Deactivate" : "Activate"}</button></td></tr>`).join("")
      || '<tr><td colspan="7">No reporters found.</td></tr>';
  };
  const clear = () => { editing = null; $("#rform").reset(); $("#ftitle").textContent = "Register Reporter"; };
  I = render; A.clear = clear;
  A.edit = async id => { const r = await DB.get("reporters", id); editing = r.id; F.forEach(k => ($("#" + k).value = r[k] ?? "")); $("#ftitle").textContent = "Edit Reporter"; scrollTo(0, 0); };
  A.tog = async id => { const r = await DB.get("reporters", id); r.status = r.status === "Active" ? "Inactive" : "Active"; await DB.put("reporters", r); render(); msg(`${r.full_name} is now ${r.status}.`); };
  S.rform = async () => {
    const r = {}; F.forEach(k => (r[k] = val(k))); r.department_id = Number(r.department_id);
    const err = [];
    if (!r.reporter_no) err.push("ID is required");
    if (!r.full_name) err.push("Full name is required");
    if (!r.department_id) err.push("Department is required");
    if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) err.push("Email is invalid");
    if (r.contact && !/^[0-9+\-\s()]{7,15}$/.test(r.contact)) err.push("Contact number is invalid");
    if (err.length) return msg(err.join(". ") + ".", false);
    try {
      if (editing) { await DB.put("reporters", { ...(await DB.get("reporters", editing)), ...r }); msg("Reporter updated."); }
      else { await DB.add("reporters", { ...r, created_at: nowISO() }); msg("Reporter registered successfully."); }
      clear(); render();
    } catch (x) { msg(x.name === "ConstraintError" ? "That Employee/Student ID already exists." : x.message, false); }
  };
  render();
};

/* Lab 6 — Reporter profile (#profile?id=N) */
PAGES.profile = async q => {
  const id = Number(q.get("id")), r = id > 0 ? await DB.get("reporters", id) : null;
  if (!r) { app().innerHTML = '<p class="card">Reporter not found.</p>'; return; }
  const dept = await DB.get("departments", r.department_id), cats = byId(await DB.all("incident_categories"));
  const incs = (await DB.byIndex("incidents", "reporter_id", id)).sort((a, b) => b.incident_date.localeCompare(a.incident_date));
  let rows = "";
  for (const i of incs) {
    const inv = (await DB.byIndex("investigations", "incident_id", i.id))[0], res = (await DB.byIndex("resolutions", "incident_id", i.id))[0];
    rows += `<tr><td>${esc(i.incident_no)}</td><td>${esc(i.incident_date)}</td><td>${esc(cats[i.category_id]?.name)}</td><td>${bd(i.status)}</td><td>${esc(inv?.status || "Not started")}</td><td>${res ? "Resolved" : "Unresolved"}</td></tr>`;
  }
  app().innerHTML = `<div class="card"><h2>${esc(r.full_name)} ${bd(r.status)}</h2>
    <p>ID: ${esc(r.reporter_no)} · ${esc(r.reporter_type)} · ${esc(dept?.name)} · ${esc(r.position)}<br>${esc(r.contact)} · ${esc(r.email)} · ${esc(r.address)}</p>
    <p><strong>Incidents reported: ${incs.length}</strong></p></div><h3>Reported Incidents</h3>
    <div class="table-wrap"><table><thead><tr><th>Incident No.</th><th>Date</th><th>Category</th><th>Status</th><th>Investigation</th><th>Resolution</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">No incidents reported.</td></tr>'}</tbody></table></div>`;
};

/* Lab 7 — Categories & types */
PAGES.categories = async () => {
  let cats = [], types = [];
  const stat = a => bd(a ? "Active" : "Inactive");
  app().innerHTML = `<form id="cform"><h3>Incident Category</h3><input type="hidden" id="c_id">
    <div class="grid"><label>Name *<input id="c_name"></label><label>Description<input id="c_desc"></label></div><button>Save Category</button></form>
    <div class="table-wrap"><table><thead><tr><th>Category</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody id="crows"></tbody></table></div>
    <form id="tform"><h3>Incident Type</h3><input type="hidden" id="t_id">
    <div class="grid"><label>Name *<input id="t_name"></label><label>Category *<select id="t_cat"></select></label></div><button>Save Type</button></form>
    <div class="table-wrap"><table><thead><tr><th>Type</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody id="trows"></tbody></table></div>`;
  const btns = (k, x, s) => `<button class="sec" data-a="${k}" data-id="${x.id}">Edit</button> <button class="sec" data-a="toggle" data-s="${s}" data-id="${x.id}">${x.active ? "Deactivate" : "Activate"}</button>`;
  const load = async () => {
    cats = await DB.all("incident_categories"); types = await DB.all("incident_types"); const cn = byId(cats);
    $("#t_cat").innerHTML = opts(cats, c => c.name + (c.active ? "" : " (inactive)"));
    $("#crows").innerHTML = cats.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.description)}</td><td>${stat(c.active)}</td><td>${btns("editC", c, "incident_categories")}</td></tr>`).join("");
    $("#trows").innerHTML = types.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(cn[t.category_id]?.name)}</td><td>${stat(t.active)}</td><td>${btns("editT", t, "incident_types")}</td></tr>`).join("");
  };
  A.editC = id => { const c = cats.find(x => x.id == id); $("#c_id").value = id; $("#c_name").value = c.name; $("#c_desc").value = c.description; scrollTo(0, 0); };
  A.editT = id => { const t = types.find(x => x.id == id); $("#t_id").value = id; $("#t_name").value = t.name; $("#t_cat").value = t.category_id; $("#tform").scrollIntoView(); };
  A.toggle = async (id, b) => { const s = b.dataset.s, r = await DB.get(s, id); r.active = !r.active; await DB.put(s, r); load(); msg(`${r.name} is now ${r.active ? "active" : "inactive"}.`); };
  const save = async (store, id, data, form) => {
    try {
      if (id) await DB.put(store, { ...(await DB.get(store, id)), ...data }); else await DB.add(store, { ...data, active: true });
      msg("Saved successfully."); form.reset(); form.querySelector("[type=hidden]").value = ""; load();
    } catch (x) { msg(x.name === "ConstraintError" ? "That name already exists." : x.message, false); }
  };
  S.cform = f => { const name = val("c_name"); if (!name) return msg("Category name is required.", false); save("incident_categories", $("#c_id").value, { name, description: val("c_desc") }, f); };
  S.tform = f => {
    const name = val("t_name"), category_id = Number($("#t_cat").value);
    if (!name || !category_id) return msg("Type name and category are required.", false);
    if (types.some(t => t.category_id === category_id && t.name.toLowerCase() === name.toLowerCase() && t.id != $("#t_id").value)) return msg("That type already exists in this category.", false);
    save("incident_types", $("#t_id").value, { name, category_id }, f);
  };
  load();
};

/* Lab 11 — Location management */
PAGES.locations = async () => {
  const depts = await DB.all("departments"), dn = byId(depts); let editing = null;
  const F = ["building", "floor", "room", "area", "department_id", "description", "status"];
  app().innerHTML = `<form id="lform"><h3 id="ltitle">Register Location</h3><div class="grid">
    <label>Building *<input id="building"></label><label>Floor<input id="floor"></label>
    <label>Room/Office<input id="room"></label><label>Area<input id="area"></label>
    <label>Department<select id="department_id">${ph("-- None --")}${opts(depts)}</select></label>
    <label>Status<select id="status"><option>Active</option><option>Inactive</option></select></label></div>
    <label>Location Description<textarea id="description" rows="2"></textarea></label>
    <button>Save Location</button> <button type="button" class="sec" data-a="clear">Clear</button></form>
    <div class="card grid flt"><label>Search<input id="q"></label>
    <label>Department<select id="fdept">${ph("All")}${opts(depts)}</select></label>
    <label>Status<select id="fst">${ph("All")}<option>Active</option><option>Inactive</option></select></label></div>
    <div class="table-wrap"><table><thead><tr><th>Location</th><th>Department</th><th>Description</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const render = async () => {
    const q = val("q").toLowerCase(), d = $("#fdept").value, s = $("#fst").value;
    const rows = (await DB.all("locations")).filter(l => (l.name + " " + l.description).toLowerCase().includes(q) && (!d || l.department_id == d) && (!s || l.status === s));
    $("#rows").innerHTML = rows.map(l => `<tr><td>${esc(l.name)}</td><td>${esc(dn[l.department_id]?.name) || "—"}</td><td>${esc(l.description)}</td><td>${bd(l.status)}</td>
      <td><button class="sec" data-a="edit" data-id="${l.id}">Edit</button> <button class="sec" data-a="tog" data-id="${l.id}">${l.status === "Active" ? "Deactivate" : "Activate"}</button></td></tr>`).join("")
      || '<tr><td colspan="5">No locations found.</td></tr>';
  };
  const clear = () => { editing = null; $("#lform").reset(); $("#ltitle").textContent = "Register Location"; };
  I = render; A.clear = clear;
  A.edit = async id => { const l = await DB.get("locations", id); editing = l.id; F.forEach(k => ($("#" + k).value = l[k] ?? "")); $("#ltitle").textContent = "Edit Location"; scrollTo(0, 0); };
  A.tog = async id => { const l = await DB.get("locations", id); l.status = l.status === "Active" ? "Inactive" : "Active"; await DB.put("locations", l); render(); msg(`${l.name} is now ${l.status}.`); };
  S.lform = async () => {
    const r = {}; F.forEach(k => (r[k] = val(k)));
    if (!r.building) return msg("Building is required.", false);
    r.department_id = r.department_id ? +r.department_id : null;
    r.name = [r.building, r.floor && `Floor ${r.floor}`, r.room, r.area].filter(Boolean).join(" – ");
    try {
      if (editing) { await DB.put("locations", { ...(await DB.get("locations", editing)), ...r }); msg("Location updated."); }
      else { await DB.add("locations", r); msg("Location registered successfully."); }
      clear(); render();
    } catch (x) { msg(x.name === "ConstraintError" ? "That location already exists." : x.message, false); }
  };
  render();
};

/* Labs 8, 9, 12 — Report incident (with validation + location) */
PAGES.report = async () => {
  const [reps, cats, locs, all] = await Promise.all(["reporters", "incident_categories", "locations", "incident_types"].map(s => DB.all(s)));
  const types = all.filter(t => t.active);
  app().innerHTML = `<form id="iform"><div class="grid">
    <label>Reporter *<select id="reporter_id">${ph("-- Select reporter --")}${opts(reps.filter(r => r.status === "Active"), r => `${r.full_name} (${r.reporter_no})`)}</select></label>
    <label>Category *<select id="category_id">${ph("-- Select category --")}${opts(cats.filter(c => c.active))}</select></label>
    <label>Incident Type *<select id="type_id">${ph("-- Select category first --")}</select></label>
    <label>Location *<select id="location_id">${ph("-- Select location --")}${opts(locs.filter(l => l.status === "Active"))}</select></label>
    <label>Date of Incident *<input type="date" id="incident_date" max="${today()}"></label>
    <label>Time of Incident *<input type="time" id="incident_time"></label>
    <label>Severity *<select id="severity">${ph("-- Select --")}${types3(["Low", "Medium", "High", "Critical"])}</select></label></div>
    <label>Description *<textarea id="description" rows="4"></textarea></label>
    <label>Immediate Response<textarea id="immediate_response" rows="2"></textarea></label><button>Save Incident</button></form>`;
  CH.category_id = () => ($("#type_id").innerHTML = ph("-- Select type --") + opts(types.filter(t => t.category_id == $("#category_id").value)));
  S.iform = async f => {
    const err = [];
    if (!val("reporter_id")) err.push("Reporter is required");
    if (!val("category_id")) err.push("Incident category is required");
    if (!val("type_id")) err.push("Incident type is required");
    if (!val("location_id")) err.push("Location is required");
    if (!val("incident_date") || !val("incident_time")) err.push("Date and time of incident are required");
    else { const dt = new Date(`${val("incident_date")}T${val("incident_time")}`); if (isNaN(dt)) err.push("Incident date/time is invalid"); else if (dt > new Date()) err.push("Incident date/time cannot be in the future"); }
    if (!val("description")) err.push("Description cannot be empty");
    if (!val("severity")) err.push("Severity must be selected");
    if (err.length) return msg(err.join(". ") + ".", false);
    const d = today().replaceAll("-", "");
    let n = (await DB.all("incidents")).filter(i => i.incident_no.startsWith("INC-" + d)).length + 1; // INC-YYYYMMDD-0001
    const rec = { reporter_id: +val("reporter_id"), category_id: +val("category_id"), type_id: +val("type_id"), location_id: +val("location_id"),
      incident_date: val("incident_date"), incident_time: val("incident_time"), description: val("description"), severity: val("severity"),
      immediate_response: val("immediate_response"), status: "Open", date_reported: nowISO() };
    for (let tries = 0; tries < 5; tries++) { // retry if the unique index rejects the number
      try {
        rec.incident_no = `INC-${d}-${String(n++).padStart(4, "0")}`;
        const id = await DB.add("incidents", rec); await audit("incidents", id, "create", rec.incident_no);
        msg(`Incident saved as ${rec.incident_no}.`); f.reset(); $("#type_id").innerHTML = ph("-- Select category first --"); return;
      } catch (x) { if (x.name !== "ConstraintError") return msg(x.message, false); }
    }
    msg("Could not generate a unique incident number. Try again.", false);
  };
};

/* Labs 10, 12 — Incident search, location filter, details */
PAGES.incidents = async () => {
  const [cats, types, reps, locs] = await Promise.all(["incident_categories", "incident_types", "reporters", "locations"].map(s => DB.all(s)));
  const cn = byId(cats), tn = byId(types), rn = byId(reps), ln = byId(locs);
  app().innerHTML = `<div class="card grid flt">
    <label>Incident No.<input id="q_no"></label><label>Reporter<input id="q_rep"></label>
    <label>Category<select id="f_cat">${ph("All")}${opts(cats)}</select></label><label>Type<select id="f_type"></select></label>
    <label>Location<select id="f_loc">${ph("All")}${opts(locs)}</select></label><label>Date<input type="date" id="f_date"></label>
    <label>Severity<select id="f_sev">${ph("All")}${types3(["Low", "Medium", "High", "Critical"])}</select></label>
    <label>Status<select id="f_stat">${ph("All")}${types3(["Open", "Under Investigation", "Resolved", "Closed"])}</select></label></div>
    <p id="count"></p><div class="table-wrap"><table><thead><tr><th>Incident No.</th><th>Reporter</th><th>Category</th><th>Type</th><th>Location</th><th>Date</th><th>Severity</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="detail"></div>`;
  const fillTypes = () => { const c = $("#f_cat").value; $("#f_type").innerHTML = ph("All") + opts(types.filter(t => !c || t.category_id == c)); };
  const render = async () => {
    const q = { no: val("q_no").toLowerCase(), rep: val("q_rep").toLowerCase(), cat: $("#f_cat").value, type: $("#f_type").value, loc: $("#f_loc").value, date: $("#f_date").value, sev: $("#f_sev").value, st: $("#f_stat").value };
    const rows = (await DB.all("incidents")).filter(i => i.incident_no.toLowerCase().includes(q.no) && (rn[i.reporter_id]?.full_name || "").toLowerCase().includes(q.rep) &&
      (!q.cat || i.category_id == q.cat) && (!q.type || i.type_id == q.type) && (!q.loc || i.location_id == q.loc) && (!q.date || i.incident_date === q.date) &&
      (!q.sev || i.severity === q.sev) && (!q.st || i.status === q.st)).reverse();
    $("#count").textContent = `${rows.length} incident(s) found`;
    $("#rows").innerHTML = rows.map(i => `<tr><td>${esc(i.incident_no)}</td><td><a href="#profile?id=${i.reporter_id}">${esc(rn[i.reporter_id]?.full_name)}</a></td>
      <td>${esc(cn[i.category_id]?.name)}</td><td>${esc(tn[i.type_id]?.name)}</td><td>${esc(ln[i.location_id]?.name) || "—"}</td>
      <td>${esc(i.incident_date)} ${esc(i.incident_time)}</td><td>${bd(i.severity)}</td><td>${bd(i.status)}</td>
      <td><button class="sec" data-a="view" data-id="${i.id}">View</button></td></tr>`).join("") || '<tr><td colspan="9">No incidents match.</td></tr>';
  };
  I = e => { if (e.target.id === "f_cat") fillTypes(); render(); };
  A.view = async id => {
    const i = await DB.get("incidents", id), inv = (await DB.byIndex("investigations", "incident_id", i.id))[0];
    $("#detail").innerHTML = `<div class="card"><h3>${esc(i.incident_no)} ${bd(i.severity)} ${bd(i.status)}</h3>
      <p><b>Reporter:</b> ${esc(rn[i.reporter_id]?.full_name)} · <b>Category:</b> ${esc(cn[i.category_id]?.name)} · <b>Type:</b> ${esc(tn[i.type_id]?.name)}</p>
      <p><b>Location:</b> ${esc(ln[i.location_id]?.name) || "Not specified"} · <b>When:</b> ${esc(i.incident_date)} ${esc(i.incident_time)} · <b>Reported:</b> ${fmtD(i.date_reported)}</p>
      <p><b>Description:</b> ${esc(i.description)}</p><p><b>Immediate response:</b> ${esc(i.immediate_response) || "—"}</p>
      <p><b>Investigation:</b> ${inv ? `${esc(inv.status)} (<a href="#investigations?id=${inv.id}">open</a>)` : "Not started"}</p></div>`;
    $("#detail").scrollIntoView();
  };
  fillTypes(); render();
};

/* Lab 13 — Location-based monitoring */
PAGES.locmon = async () => {
  const [locs, incs, types] = await Promise.all(["locations", "incidents", "incident_types"].map(s => DB.all(s))), tn = byId(types);
  const groups = [...locs.map(l => [l.name, incs.filter(i => i.location_id === l.id)]), ["Not specified", incs.filter(i => !i.location_id)]]
    .filter(([n, a]) => n !== "Not specified" || a.length).sort((a, b) => b[1].length - a[1].length);
  const sev = ["Critical", "High", "Medium", "Low"];
  const rows = groups.map(([name, a]) => {
    const tc = {}; a.forEach(i => (tc[tn[i.type_id]?.name || "?"] = (tc[tn[i.type_id]?.name || "?"] || 0) + 1));
    const tl = Object.entries(tc), rec = tl.filter(([, c]) => c >= 2);
    return `<tr><td>${esc(name)}</td><td><b>${a.length}</b></td><td>${tl.map(([t, c]) => `${esc(t)} ×${c}`).join(", ") || "—"}</td>
      <td>${sev.map(s => { const c = a.filter(i => i.severity === s).length; return c ? bd(`${s} ${c}`, s) : ""; }).join(" ") || "—"}</td>
      <td>${a.filter(i => ["Open", "Under Investigation"].includes(i.status)).length}</td><td>${a.filter(i => ["Resolved", "Closed"].includes(i.status)).length}</td>
      <td>${rec.map(([t, c]) => bd(`${t} ×${c}`, "Overdue")).join(" ") || "—"}</td></tr>`;
  }).join("");
  app().innerHTML = `<p>${incs.length} incident(s) across ${groups.filter(g => g[1].length).length} location(s). Recurring = the same incident type reported 2+ times at one location.</p>
    <div class="table-wrap"><table><thead><tr><th>Location</th><th>Incidents</th><th>Types</th><th>Severity</th><th>Open</th><th>Resolved</th><th>Recurring</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No incidents yet.</td></tr>'}</tbody></table></div>`;
};

/* Labs 14-19 — Investigations: assignment, status tracking, findings, evidence, root-cause analysis */
const ST = ["Assigned", "In Progress", "Evidence Gathering", "Findings Prepared", "Completed"];
PAGES.investigations = async q => {
  let sel = Number(q.get("id")) || null;
  const users = await DB.all("users"), un = byId(users);
  const investigators = users.filter(u => u.active && ["Investigator", "Admin"].includes(ROLES[u.role_id]?.name));
  const ok = canInv();
  app().innerHTML = `<div id="notes"></div>
    ${ok ? `<form id="nform"><h3>Assign Investigation</h3><div class="grid">
      <label>Incident *<select id="n_inc"></select></label>
      <label>Investigator *<select id="n_inv">${ph("-- Select investigator --")}${opts(investigators, "full_name")}</select></label>
      <label>Start Date *<input type="date" id="n_start" value="${today()}"></label><label>Target Completion Date *<input type="date" id="n_target"></label></div>
      <label>Investigation Instructions<textarea id="n_instr" rows="2"></textarea></label><label>Investigation Notes<textarea id="n_notes" rows="2"></textarea></label>
      <button>Assign &amp; Notify</button></form>` : '<p class="card">Only investigators and admins can assign or update investigations.</p>'}
    <h3>Investigations</h3><div class="table-wrap"><table><thead><tr><th>Incident</th><th>Investigator</th><th>Start</th><th>Deadline</th><th>Status</th><th>Completed</th><th></th></tr></thead><tbody id="irows"></tbody></table></div><div id="detail"></div>`;

  const notes = async () => {
    const ns = (await DB.byIndex("notifications", "user_id", ME.id)).reverse();
    $("#notes").innerHTML = ns.length ? `<div class="card"><h3>Notifications (${ns.filter(n => !n.is_read).length} unread)</h3>${ns.slice(0, 5).map(n =>
      `<p>${n.is_read ? "" : "🔔 "}${esc(n.message)} <small>${fmtD(n.created_at)}</small> ${n.is_read ? "" : `<button class="sec" data-a="read" data-id="${n.id}">Mark read</button>`}</p>`).join("")}</div>` : "";
  };
  const list = async () => {
    const [incs, invs] = await Promise.all([DB.all("incidents"), DB.all("investigations")]), inc = byId(incs);
    if (ok) $("#n_inc").innerHTML = ph("-- Select open incident --") + opts(incs.filter(i => i.status === "Open" && !invs.some(v => v.incident_id === i.id)), i => `${i.incident_no} (${i.severity}) – ${i.description.slice(0, 40)}`);
    $("#irows").innerHTML = invs.slice().reverse().map(v => `<tr><td>${esc(inc[v.incident_id]?.incident_no)}</td><td>${esc(un[v.investigator_id]?.full_name)}</td>
      <td>${fmtD(v.start_date)}</td><td>${fmtD(v.target_date)} ${v.status !== "Completed" && v.target_date < today() ? bd("Overdue") : ""}</td><td>${bd(v.status)}</td><td>${fmtD(v.end_date)}</td>
      <td><button class="sec" data-a="open" data-id="${v.id}">Open</button></td></tr>`).join("") || '<tr><td colspan="7">No investigations yet.</td></tr>';
  };
  const detail = async () => {
    const el = $("#detail"), v = sel ? await DB.get("investigations", sel) : null;
    if (!v) { el.innerHTML = ""; return; }
    const inc = await DB.get("incidents", v.incident_id), idx = ST.indexOf(v.status), r = v.rca || {};
    const finds = await DB.byIndex("investigation_findings", "investigation_id", v.id), evs = await DB.byIndex("investigation_evidence", "investigation_id", v.id);
    const ta = (id, label, text = "", rows = 2) => `<label>${label}<textarea id="${id}" rows="${rows}">${esc(text)}</textarea></label>`;
    el.innerHTML = `<div class="card"><h3>${esc(inc.incident_no)} — ${esc(un[v.investigator_id]?.full_name)}</h3>
      <div class="steps">${ST.map((s, i) => `<span class="step ${i < idx ? "done" : i === idx ? "on" : ""}">${s}</span>`).join("")}</div>
      <p><b>Start:</b> ${fmtD(v.start_date)} · <b>Deadline:</b> ${fmtD(v.target_date)} · <b>Completed:</b> ${fmtD(v.end_date)} · <b>Assigned:</b> ${fmtD(v.assigned_at)}</p>
      <p><b>Instructions:</b> ${esc(v.instructions) || "—"}</p><p><b>Notes:</b> ${esc(v.notes) || "—"}</p>
      ${ok && idx < ST.length - 1 ? `<button data-a="adv" data-id="${v.id}">Move to “${ST[idx + 1]}”</button>` : ""}</div>

      <div class="card"><h3>Findings</h3><div class="table-wrap"><table><thead><tr><th>Findings</th><th>Root cause</th><th>Contributing factors</th><th>Witnesses</th><th>Evidence</th><th>Recommendation</th></tr></thead><tbody>
      ${finds.map(f => `<tr><td>${esc(f.finding)}</td><td>${esc(f.root_cause)}</td><td>${esc(f.contributing_factors)}</td><td>${esc(f.witnesses)}</td><td>${esc(f.evidence_summary)}</td><td>${esc(f.recommendation)}</td></tr>`).join("") || '<tr><td colspan="6">No findings recorded.</td></tr>'}</tbody></table></div>
      ${ok ? `<form id="fform">${ta("f_finding", "Findings *")}<div class="grid">${ta("f_root", "Root cause")}${ta("f_contrib", "Contributing factors")}${ta("f_wit", "Witnesses")}${ta("f_evid", "Evidence summary")}</div>${ta("f_rec", "Investigator recommendation")}<button>Add Finding</button></form>` : ""}</div>

      <div class="card"><h3>Evidence</h3>${ok ? `<div class="table-wrap"><table><thead><tr><th>File</th><th>Description</th><th>Uploaded by</th><th>Uploaded</th></tr></thead><tbody>
      ${evs.map(e => `<tr><td>${e.file_type?.startsWith("image/") ? `<img class="thumb" src="${e.file_data}" alt=""> ` : ""}<a href="${e.file_data}" download="${esc(e.file_name)}">${esc(e.file_name)}</a></td><td>${esc(e.description)}</td><td>${esc(un[e.uploaded_by]?.full_name)}</td><td>${fmtD(e.collected_at)}</td></tr>`).join("") || '<tr><td colspan="4">No evidence uploaded.</td></tr>'}</tbody></table></div>
      <form id="eform"><div class="grid"><label>File (document or photo, max 2 MB) *<input type="file" id="e_file" accept="image/*,.pdf,.doc,.docx,.txt"></label><label>Description<input id="e_desc"></label></div><button>Upload Evidence</button></form>`
      : "<p>Restricted: only investigators and admins can view or upload evidence.</p>"}</div>

      <div class="card"><h3>Root Cause Analysis</h3>${ok ? `<form id="rcaform"><p>Problem → Cause → Evidence → Root Cause → Recommendation</p>
      ${ta("r_problem", "Problem *", r.problem ?? inc.description)}<div class="grid">${ta("r_immediate", "Immediate cause", r.immediate)}${ta("r_cause", "Cause", r.cause)}${ta("r_evidence", "Supporting evidence", r.evidence)}
      ${ta("r_root", "Root cause *", r.root)}${ta("r_contrib", "Contributing factors", r.contrib)}${ta("r_prevent", "Recommended preventive measures", r.prevent)}</div><button>Save Analysis</button></form>` : "<p>Restricted.</p>"}</div>`;
  };

  A.open = id => { sel = Number(id); detail(); $("#detail").scrollIntoView(); };
  A.read = async id => { const n = await DB.get("notifications", id); n.is_read = true; await DB.put("notifications", n); notes(); };
  A.adv = async id => {
    const v = await DB.get("investigations", id), next = ST[ST.indexOf(v.status) + 1];
    if (!next) return;
    if (next === "Completed" && !(await DB.byIndex("investigation_findings", "investigation_id", v.id)).length) return msg("Record at least one finding before completing.", false);
    v.status = next; if (next === "Completed") v.end_date = today();
    await DB.put("investigations", v); await audit("investigations", v.id, "status", next);
    msg(`Investigation moved to ${next}.`); list(); detail();
  };
  S.nform = async f => {
    const inc = val("n_inc"), inv = val("n_inv"), sd = val("n_start"), td = val("n_target"), err = [];
    if (!inc) err.push("Incident is required");
    if (!inv) err.push("Investigator is required");
    if (!sd || !td) err.push("Start and target dates are required"); else if (td < sd) err.push("Target date cannot be before the start date");
    if (inc && (await DB.byIndex("investigations", "incident_id", +inc)).length) err.push("That incident already has an investigation");
    if (err.length) return msg(err.join(". ") + ".", false);
    const i = await DB.get("incidents", inc);
    const id = await DB.add("investigations", { incident_id: i.id, investigator_id: +inv, status: "Assigned", start_date: sd, target_date: td, end_date: null,
      instructions: val("n_instr"), notes: val("n_notes"), assigned_at: nowISO(), assigned_by: ME.id });
    i.status = "Under Investigation"; await DB.put("incidents", i);
    await DB.add("notifications", { user_id: +inv, incident_id: i.id, message: `You were assigned to investigate ${i.incident_no} (due ${td}).`, is_read: false, created_at: nowISO() });
    await audit("investigations", id, "create", i.incident_no);
    msg(`Investigation assigned for ${i.incident_no}; investigator notified.`); f.reset(); $("#n_start").value = today(); sel = id; list(); notes(); detail();
  };
  S.fform = async () => {
    if (!val("f_finding")) return msg("Findings text is required.", false);
    await DB.add("investigation_findings", { investigation_id: sel, finding: val("f_finding"), root_cause: val("f_root"), contributing_factors: val("f_contrib"),
      witnesses: val("f_wit"), evidence_summary: val("f_evid"), recommendation: val("f_rec"), created_at: nowISO() });
    await audit("investigations", sel, "finding"); msg("Finding recorded."); detail();
  };
  S.eform = async () => {
    const f = $("#e_file").files[0];
    if (!canInv()) return msg("You are not authorized to upload evidence.", false);
    if (!f) return msg("Choose a file to upload.", false);
    if (f.size > 2 * 1024 * 1024) return msg("File is too large (max 2 MB).", false);
    const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
    await DB.add("investigation_evidence", { investigation_id: sel, description: val("e_desc"), file_name: f.name, file_type: f.type, file_data: data, uploaded_by: ME.id, collected_at: nowISO() });
    await audit("investigations", sel, "evidence", f.name); msg("Evidence uploaded."); detail();
  };
  S.rcaform = async () => {
    if (!val("r_problem") || !val("r_root")) return msg("Problem and root cause are required.", false);
    const v = await DB.get("investigations", sel);
    v.rca = { problem: val("r_problem"), immediate: val("r_immediate"), cause: val("r_cause"), evidence: val("r_evidence"), root: val("r_root"), contrib: val("r_contrib"), prevent: val("r_prevent") };
    await DB.put("investigations", v); await audit("investigations", sel, "rca"); msg("Root cause analysis saved.");
  };
  notes(); list(); detail();
};

/* Lab 20 — Corrective actions */
const ATYPES = ["Corrective Action", "Preventive Action", "Safety Improvement", "Equipment Repair", "Policy Improvement", "Training", "Process Improvement"];
const ASTAT = ["Open", "In Progress", "Completed", "Cancelled"], PRI = ["Low", "Medium", "High", "Critical"];
PAGES.actions = async () => {
  const [users, incs, invs, finds] = await Promise.all(["users", "incidents", "investigations", "investigation_findings"].map(s => DB.all(s)));
  const un = byId(users), inc = byId(incs), vn = byId(invs);
  const ready = invs.filter(v => finds.some(f => f.investigation_id === v.id)); // actions are based on recorded findings
  app().innerHTML = `<form id="aform"><h3>Create Action</h3><div class="grid">
    <label>Investigation *<select id="a_inv">${ph(ready.length ? "-- Select investigation --" : "-- Record findings first --")}${opts(ready, v => `${inc[v.incident_id]?.incident_no} (${v.status})`)}</select></label>
    <label>Action Type *<select id="a_type">${ph("-- Select --")}${types3(ATYPES)}</select></label>
    <label>Responsible Person *<select id="a_who">${ph("-- Select --")}${opts(users.filter(u => u.active), "full_name")}</select></label>
    <label>Target Date *<input type="date" id="a_due"></label>
    <label>Priority *<select id="a_pri">${types3(PRI)}</select></label></div>
    <label>Action Description *<textarea id="a_desc" rows="2"></textarea></label><button>Save Action</button></form>
    <div class="card grid flt"><label>Status<select id="f_st">${ph("All")}${types3(ASTAT)}</select></label><label>Priority<select id="f_pri">${ph("All")}${types3(PRI)}</select></label></div>
    <div class="table-wrap"><table><thead><tr><th>Incident</th><th>Type</th><th>Description</th><th>Responsible</th><th>Target</th><th>Priority</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const render = async () => {
    const s = $("#f_st").value, p = $("#f_pri").value;
    const rows = (await DB.all("actions")).filter(a => (!s || a.status === s) && (!p || a.priority === p)).reverse();
    $("#rows").innerHTML = rows.map(a => `<tr><td>${esc(inc[a.incident_id]?.incident_no)}</td><td>${esc(a.action_type)}</td><td>${esc(a.description)}</td><td>${esc(un[a.assigned_to]?.full_name)}</td>
      <td>${fmtD(a.due_date)} ${!["Completed", "Cancelled"].includes(a.status) && a.due_date < today() ? bd("Overdue") : ""}</td><td>${bd(a.priority)}</td>
      <td><select data-c="st" data-id="${a.id}">${ASTAT.map(x => `<option${x === a.status ? " selected" : ""}>${x}</option>`).join("")}</select></td></tr>`).join("") || '<tr><td colspan="7">No actions found.</td></tr>';
  };
  I = render;
  CH.st = async e => { const a = await DB.get("actions", e.target.dataset.id); a.status = e.target.value; await DB.put("actions", a); await audit("actions", a.id, "status", a.status); msg("Action status updated."); render(); };
  S.aform = async f => {
    const err = [];
    if (!val("a_inv")) err.push("Investigation is required");
    if (!val("a_type")) err.push("Action type is required");
    if (!val("a_desc")) err.push("Action description is required");
    if (!val("a_who")) err.push("Responsible person is required");
    if (!val("a_due")) err.push("Target date is required");
    if (err.length) return msg(err.join(". ") + ".", false);
    const v = vn[val("a_inv")];
    const id = await DB.add("actions", { investigation_id: v.id, incident_id: v.incident_id, action_type: val("a_type"), description: val("a_desc"), assigned_to: +val("a_who"), due_date: val("a_due"), priority: val("a_pri"), status: "Open" });
    await audit("actions", id, "create", val("a_type")); msg("Action saved."); f.reset(); render();
  };
  render();
};

/* ---------- 5. ROUTER ---------- */
async function route() {
  const [name, qs] = (location.hash.slice(1) || "home").split("?"), page = PAGES[name] || PAGES.home;
  A = {}; S = {}; CH = {}; I = null;
  $("#title").textContent = "🚨 " + (TITLES[name] || TITLES.home);
  document.title = (TITLES[name] || TITLES.home) + " | Incident Reporting System";
  try { await page(new URLSearchParams(qs || "")); } catch (x) { console.error(x); app().innerHTML = `<p class="card fail">Something went wrong: ${esc(x.message)}</p>`; }
}
app().onclick = e => { const b = e.target.closest("[data-a]"); if (b) A[b.dataset.a]?.(b.dataset.id, b); };
app().onsubmit = e => { e.preventDefault(); S[e.target.id]?.(e.target); };
app().oninput = e => { if (e.target.closest(".flt")) I?.(e); };
app().onchange = e => (CH[e.target.id] || CH[e.target.dataset.c])?.(e);
window.onhashchange = route;

(async function boot() {
  try {
    await DB.open();
    const users = await DB.all("users"); ROLES = byId(await DB.all("roles"));
    ME = users.find(u => u.id === Number(localStorage.getItem("uid"))) || users[0];
    $("#nav").innerHTML = LINKS.map(([h, t]) => `<a href="#${h}">${esc(t)}</a>`).join("") +
      `<select id="who" title="Acting as">${opts(users, u => `${u.full_name} (${ROLES[u.role_id]?.name})`)}</select>`;
    $("#who").value = ME.id;
    $("#who").onchange = e => { ME = users.find(u => u.id == e.target.value); localStorage.setItem("uid", ME.id); route(); };
    route();
  } catch (x) { app().innerHTML = `<p class="card fail">Database not connected: ${esc(x.message)}</p>`; }
})();
