import { REPORTER_TYPES } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, nowISO, bd, ph, types3, msg, state } from "../helpers.js";
import { need, V } from "../validation.js";

export async function reportersPage() {
  const depts = await DB.all("departments"), dn = byId(depts);
  let editing = null;
  const F = ["reporter_no", "full_name", "department_id", "position", "contact", "email", "address", "reporter_type", "status"];
  const T = types3(REPORTER_TYPES);

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
    const rows = (await DB.all("reporters")).filter(r =>
      r.full_name.toLowerCase().includes(n) && r.reporter_no.toLowerCase().includes(i) && (!d || r.department_id == d) && (!t || r.reporter_type === t)
    );
    $("#rows").innerHTML = rows.map(r => `<tr><td>${esc(r.reporter_no)}</td><td><a href="#profile?id=${r.id}">${esc(r.full_name)}</a></td>
      <td>${esc(dn[r.department_id]?.name)}</td><td>${esc(r.reporter_type)}</td><td>${esc(r.contact)}</td><td>${bd(r.status)}</td>
      <td><button class="sec" data-a="edit" data-id="${r.id}">Edit</button> <button class="sec" data-a="tog" data-id="${r.id}">${r.status === "Active" ? "Deactivate" : "Activate"}</button></td></tr>`).join("")
      || '<tr><td colspan="7">No reporters found.</td></tr>';
  };

  const clear = () => {
    editing = null;
    $("#rform").reset();
    app().querySelectorAll(".invalid").forEach(x => { x.classList.remove("invalid"); x.removeAttribute("aria-invalid"); });
    $("#ftitle").textContent = "Register Reporter";
  };

  state.I = render;
  state.A.clear = clear;
  state.A.edit = async id => {
    const r = need(await DB.get("reporters", id), "Reporter");
    editing = r.id;
    F.forEach(k => ($("#" + k).value = r[k] ?? ""));
    $("#ftitle").textContent = "Edit Reporter";
    scrollTo(0, 0);
  };
  state.A.tog = async id => {
    const r = need(await DB.get("reporters", id), "Reporter");
    r.status = r.status === "Active" ? "Inactive" : "Active";
    await DB.put("reporters", r);
    render();
    msg(`${r.full_name} is now ${r.status}.`);
  };
  state.S.rform = async () => {
    const r = {};
    F.forEach(k => (r[k] = val(k)));
    r.department_id = Number(r.department_id);
    if (V.show(V.reporter(r))) return;
    if (editing) {
      const existing = need(await DB.get("reporters", editing), "Reporter");
      await DB.put("reporters", { ...existing, ...r });
      msg("Reporter updated.");
    } else {
      await DB.add("reporters", { ...r, created_at: nowISO() });
      msg("Reporter registered successfully.");
    }
    clear();
    render();
  };
  render();
}

export async function profilePage(q) {
  const id = Number(q.get("id")), r = id > 0 ? await DB.get("reporters", id) : null;
  if (!r) { app().innerHTML = '<p class="card fail">Reporter not found.</p>'; return; }
  const dept = await DB.get("departments", r.department_id);
  const cats = byId(await DB.all("incident_categories"));
  const incs = (await DB.byIndex("incidents", "reporter_id", id)).sort((a, b) => b.incident_date.localeCompare(a.incident_date));
  let rows = "";
  for (const i of incs) {
    const inv = (await DB.byIndex("investigations", "incident_id", i.id))[0];
    const res = (await DB.byIndex("resolutions", "incident_id", i.id))[0];
    rows += `<tr><td>${esc(i.incident_no)}</td><td>${esc(i.incident_date)}</td><td>${esc(cats[i.category_id]?.name)}</td><td>${bd(i.status)}</td><td>${esc(inv?.status || "Not started")}</td><td>${res ? "Resolved" : "Unresolved"}</td></tr>`;
  }
  app().innerHTML = `<div class="card"><h2>${esc(r.full_name)} ${bd(r.status)}</h2>
    <p>ID: ${esc(r.reporter_no)} · ${esc(r.reporter_type)} · ${esc(dept?.name)} · ${esc(r.position)}<br>${esc(r.contact)} · ${esc(r.email)} · ${esc(r.address)}</p>
    <p><strong>Incidents reported: ${incs.length}</strong></p></div><h3>Reported Incidents</h3>
    <div class="table-wrap"><table><thead><tr><th>Incident No.</th><th>Date</th><th>Category</th><th>Status</th><th>Investigation</th><th>Resolution</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">No incidents reported.</td></tr>'}</tbody></table></div>`;
}