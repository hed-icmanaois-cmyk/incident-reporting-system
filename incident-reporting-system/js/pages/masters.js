import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, bd, ph, msg, state } from "../helpers.js";
import { need, V } from "../validation.js";

export async function categoriesPage() {
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
    cats = await DB.all("incident_categories");
    types = await DB.all("incident_types");
    const cn = byId(cats);
    $("#t_cat").innerHTML = opts(cats, c => c.name + (c.active ? "" : " (inactive)"));
    $("#crows").innerHTML = cats.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.description)}</td><td>${stat(c.active)}</td><td>${btns("editC", c, "incident_categories")}</td></tr>`).join("");
    $("#trows").innerHTML = types.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(cn[t.category_id]?.name)}</td><td>${stat(t.active)}</td><td>${btns("editT", t, "incident_types")}</td></tr>`).join("");
  };

  state.A.editC = id => { const c = need(cats.find(x => x.id == id), "Category"); $("#c_id").value = id; $("#c_name").value = c.name; $("#c_desc").value = c.description; scrollTo(0, 0); };
  state.A.editT = id => { const t = need(types.find(x => x.id == id), "Incident type"); $("#t_id").value = id; $("#t_name").value = t.name; $("#t_cat").value = t.category_id; $("#tform").scrollIntoView(); };
  state.A.toggle = async (id, b) => {
    const s = b.dataset.s, r = need(await DB.get(s, id), "Record");
    r.active = !r.active;
    await DB.put(s, r);
    load();
    msg(`${r.name} is now ${r.active ? "active" : "inactive"}.`);
  };

  const save = async (store, id, data, form) => {
    if (id) await DB.put(store, { ...need(await DB.get(store, id), "Record"), ...data });
    else await DB.add(store, { ...data, active: true });
    msg("Saved successfully.");
    form.reset();
    form.querySelector("[type=hidden]").value = "";
    load();
  };

  state.S.cform = async f => {
    const e = V.chk(), name = val("c_name"), desc = val("c_desc");
    if (V.req(e, "c_name", name, "Category name")) V.len(e, "c_name", name, "Category name", 2, 80);
    V.len(e, "c_desc", desc, "Description", 0, 250);
    if (V.show(e)) return;
    await save("incident_categories", $("#c_id").value, { name, description: desc }, f);
  };

  state.S.tform = async f => {
    const e = V.chk(), name = val("t_name"), category_id = Number($("#t_cat").value);
    if (V.req(e, "t_name", name, "Type name")) V.len(e, "t_name", name, "Type name", 2, 80);
    if (!category_id) e.bad("t_cat", "Category is required");
    if (types.some(t => t.category_id === category_id && t.name.toLowerCase() === name.toLowerCase() && t.id != $("#t_id").value)) {
      e.bad("t_name", "That type already exists in this category");
    }
    if (V.show(e)) return;
    await save("incident_types", $("#t_id").value, { name, category_id }, f);
  };
  load();
}

export async function locationsPage() {
  const depts = await DB.all("departments"), dn = byId(depts);
  let editing = null;
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

  const clear = () => {
    editing = null;
    $("#lform").reset();
    app().querySelectorAll(".invalid").forEach(x => { x.classList.remove("invalid"); x.removeAttribute("aria-invalid"); });
    $("#ltitle").textContent = "Register Location";
  };

  state.I = render;
  state.A.clear = clear;
  state.A.edit = async id => {
    const l = need(await DB.get("locations", id), "Location");
    editing = l.id;
    F.forEach(k => ($("#" + k).value = l[k] ?? ""));
    $("#ltitle").textContent = "Edit Location";
    scrollTo(0, 0);
  };
  state.A.tog = async id => {
    const l = need(await DB.get("locations", id), "Location");
    l.status = l.status === "Active" ? "Inactive" : "Active";
    await DB.put("locations", l);
    render();
    msg(`${l.name} is now ${l.status}.`);
  };
  state.S.lform = async () => {
    const r = {};
    F.forEach(k => (r[k] = val(k)));
    if (V.show(V.location(r))) return;
    r.department_id = r.department_id ? +r.department_id : null;
    r.name = [r.building, r.floor && `Floor ${r.floor}`, r.room, r.area].filter(Boolean).join(" – ");
    if (editing) {
      await DB.put("locations", { ...need(await DB.get("locations", editing), "Location"), ...r });
      msg("Location updated.");
    } else {
      await DB.add("locations", r);
      msg("Location registered successfully.");
    }
    clear();
    render();
  };
  render();
}

export async function locmonPage() {
  const [locs, incs, types] = await Promise.all(["locations", "incidents", "incident_types"].map(s => DB.all(s)));
  const tn = byId(types);
  const groups = [...locs.map(l => [l.name, incs.filter(i => i.location_id === l.id)]), ["Not specified", incs.filter(i => !i.location_id)]]
    .filter(([n, a]) => n !== "Not specified" || a.length)
    .sort((a, b) => b[1].length - a[1].length);
  const sev = ["Critical", "High", "Medium", "Low"];

  const rows = groups.map(([name, a]) => {
    const tc = {};
    a.forEach(i => (tc[tn[i.type_id]?.name || "?"] = (tc[tn[i.type_id]?.name || "?"] || 0) + 1));
    const tl = Object.entries(tc), rec = tl.filter(([, c]) => c >= 2);
    return `<tr><td>${esc(name)}</td><td><b>${a.length}</b></td><td>${tl.map(([t, c]) => `${esc(t)} ×${c}`).join(", ") || "—"}</td>
      <td>${sev.map(s => { const c = a.filter(i => i.severity === s).length; return c ? bd(`${s} ${c}`, s) : ""; }).join(" ") || "—"}</td>
      <td>${a.filter(i => ["Open", "Under Investigation"].includes(i.status)).length}</td><td>${a.filter(i => ["Resolved", "Closed"].includes(i.status)).length}</td>
      <td>${rec.map(([t, c]) => bd(`${t} ×${c}`, "Overdue")).join(" ") || "—"}</td></tr>`;
  }).join("");

  app().innerHTML = `<p>${incs.length} incident(s) across ${groups.filter(g => g[1].length).length} location(s). Recurring = the same incident type reported 2+ times at one location.</p>
    <div class="table-wrap"><table><thead><tr><th>Location</th><th>Incidents</th><th>Types</th><th>Severity</th><th>Open</th><th>Resolved</th><th>Recurring</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">No incidents yet.</td></tr>'}</tbody></table></div>`;
}