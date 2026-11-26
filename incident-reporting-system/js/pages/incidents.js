import { SEVERITIES, FILE_ACCEPT } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, nowISO, today, fmtD, bd, ph, types3, msg, audit, readFile, state } from "../helpers.js";
import { AppError, need, V, BR, guardIncident } from "../validation.js";

export async function reportPage() {
  const [reps, cats, locs, all] = await Promise.all(["reporters", "incident_categories", "locations", "incident_types"].map(s => DB.all(s)));
  const types = all.filter(t => t.active);

  app().innerHTML = `<form id="iform"><div class="grid">
    <label>Reporter *<select id="reporter_id">${ph("-- Select reporter --")}${opts(reps.filter(r => r.status === "Active"), r => `${r.full_name} (${r.reporter_no})`)}</select></label>
    <label>Category *<select id="category_id">${ph("-- Select category --")}${opts(cats.filter(c => c.active))}</select></label>
    <label>Incident Type *<select id="type_id">${ph("-- Select category first --")}</select></label>
    <label>Location *<select id="location_id">${ph("-- Select location --")}${opts(locs.filter(l => l.status === "Active"))}</select></label>
    <label>Date of Incident *<input type="date" id="incident_date" max="${today()}"></label>
    <label>Time of Incident *<input type="time" id="incident_time"></label>
    <label>Severity *<select id="severity">${ph("-- Select --")}${types3(SEVERITIES)}</select></label>
    <label>Attachment (optional, max 2 MB)<input type="file" id="inc_file" accept="${FILE_ACCEPT}"></label></div>
    <label>Description *<textarea id="description" rows="4"></textarea></label>
    <label>Immediate Response<textarea id="immediate_response" rows="2"></textarea></label><button>Save Incident</button></form>`;

  state.CH.category_id = () => ($("#type_id").innerHTML = ph("-- Select type --") + opts(types.filter(t => t.category_id == $("#category_id").value)));

  state.S.iform = async f => {
    const raw = {
      reporter_id: val("reporter_id"), category_id: val("category_id"), type_id: val("type_id"), location_id: val("location_id"),
      incident_date: val("incident_date"), incident_time: val("incident_time"), description: val("description"), severity: val("severity"),
      immediate_response: val("immediate_response")
    };
    const file = $("#inc_file")?.files?.[0];
    const e = V.incident(raw);
    V.file(e, "inc_file", file, false, "Attachment");
    const [rep, loc, typ] = await Promise.all([
      raw.reporter_id ? DB.get("reporters", raw.reporter_id) : null,
      raw.location_id ? DB.get("locations", raw.location_id) : null,
      raw.type_id ? DB.get("incident_types", raw.type_id) : null
    ]);
    const rErr = BR.reporter(rep, true); if (raw.reporter_id && rErr) e.bad("reporter_id", rErr);
    const lErr = BR.location(loc, true); if (raw.location_id && lErr) e.bad("location_id", lErr);
    const tErr = BR.typeInCategory(typ, raw.category_id); if (raw.category_id && raw.type_id && tErr) e.bad("type_id", tErr);
    if (V.show(e)) return;

    const d = today().replaceAll("-", "");
    const existing = await DB.all("incidents");
    let n = existing.filter(i => i.incident_no.startsWith("INC-" + d)).length + 1;
    const rec = {
      reporter_id: +raw.reporter_id, category_id: +raw.category_id, type_id: +raw.type_id, location_id: +raw.location_id,
      incident_date: raw.incident_date, incident_time: raw.incident_time, description: raw.description, severity: raw.severity,
      immediate_response: raw.immediate_response, status: "Open", date_reported: nowISO()
    };

    for (let tries = 0; tries < 5; tries++) {
      const candidate = `INC-${d}-${String(n++).padStart(4, "0")}`;
      if (BR.uniqueNo(candidate, existing)) continue;
      rec.incident_no = candidate;
      try {
        const id = await DB.add("incidents", rec);
        if (file) {
          const data = await readFile(file);
          await DB.add("incident_attachments", {
            incident_id: id, file_name: file.name, file_type: file.type, file_data: data, uploaded_at: nowISO()
          }).catch(() => {});
        }
        await audit("incidents", id, "create", rec.incident_no, { incident_id: id, new: "Open" });
        msg(`Incident saved as ${rec.incident_no}.`);
        f.reset();
        $("#type_id").innerHTML = ph("-- Select category first --");
        return;
      } catch (x) {
        if (x.name !== "ConstraintError" && x.code !== "23505") throw x;
      }
    }
    throw new AppError("Could not generate a unique incident number. Please try again.", "duplicate");
  };
}

export async function incidentsPage() {
  const [cats, types, reps, locs] = await Promise.all(["incident_categories", "incident_types", "reporters", "locations"].map(s => DB.all(s)));
  const cn = byId(cats), tn = byId(types), rn = byId(reps), ln = byId(locs);
  let limit = 25;

  app().innerHTML = `<div class="card grid flt">
    <label>Incident No.<input id="q_no"></label><label>Reporter<input id="q_rep"></label>
    <label>Category<select id="f_cat">${ph("All")}${opts(cats)}</select></label><label>Type<select id="f_type"></select></label>
    <label>Location<select id="f_loc">${ph("All")}${opts(locs)}</select></label><label>Date<input type="date" id="f_date"></label>
    <label>Severity<select id="f_sev">${ph("All")}${types3(SEVERITIES)}</select></label>
    <label>Status<select id="f_stat">${ph("All")}${types3(["Open", "Under Investigation", "Resolved", "Closed"])}</select></label></div>
    <div class="toolbar"><p id="count" style="margin:0"></p><div id="pager"></div></div>
    <div class="table-wrap"><table><thead><tr><th>Incident No.</th><th>Reporter</th><th>Category</th><th>Type</th><th>Location</th><th>Date</th><th>Severity</th><th>Status</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="detail"></div>`;

  const fillTypes = () => {
    const c = $("#f_cat").value;
    $("#f_type").innerHTML = ph("All") + opts(types.filter(t => !c || t.category_id == c));
  };

  const render = async () => {
    const q = { no: val("q_no").toLowerCase(), rep: val("q_rep").toLowerCase(), cat: $("#f_cat").value, type: $("#f_type").value, loc: $("#f_loc").value, date: $("#f_date").value, sev: $("#f_sev").value, st: $("#f_stat").value };
    const rows = (await DB.all("incidents")).filter(i =>
      i.incident_no.toLowerCase().includes(q.no) && (rn[i.reporter_id]?.full_name || "").toLowerCase().includes(q.rep) &&
      (!q.cat || i.category_id == q.cat) && (!q.type || i.type_id == q.type) && (!q.loc || i.location_id == q.loc) && (!q.date || i.incident_date === q.date) &&
      (!q.sev || i.severity === q.sev) && (!q.st || i.status === q.st)
    ).reverse();
    const shown = rows.slice(0, limit);
    $("#count").textContent = `Showing ${shown.length} of ${rows.length} incident(s)`;
    $("#pager").innerHTML = rows.length > limit ? `<button type="button" class="sec" data-a="more">Load more</button>` : "";
    $("#rows").innerHTML = shown.map(i => `<tr><td>${esc(i.incident_no)}</td><td><a href="#profile?id=${i.reporter_id}">${esc(rn[i.reporter_id]?.full_name)}</a></td>
      <td>${esc(cn[i.category_id]?.name)}</td><td>${esc(tn[i.type_id]?.name)}</td><td>${esc(ln[i.location_id]?.name) || "—"}</td>
      <td>${esc(i.incident_date)} ${esc(i.incident_time)}</td><td>${bd(i.severity)}</td><td>${bd(i.status)}</td>
      <td><button class="sec" data-a="view" data-id="${i.id}">View</button></td></tr>`).join("") || '<tr><td colspan="9">No incidents match.</td></tr>';
  };

  state.I = e => { if (e.target.id === "f_cat") fillTypes(); limit = 25; render(); };
  state.A.more = () => { limit += 25; render(); };

  state.A.view = async id => {
    const i = need(await DB.get("incidents", id), "Incident");
    const [invs, ress, atts] = await Promise.all([
      DB.byIndex("investigations", "incident_id", i.id),
      DB.byIndex("resolutions", "incident_id", i.id),
      DB.byIndex("incident_attachments", "incident_id", i.id).catch(() => [])
    ]);
    const inv = invs[0], res = ress[0];
    const lockMsg = BR.editable(i);
    $("#detail").innerHTML = `<div class="card"><h3>${esc(i.incident_no)} ${bd(i.severity)} ${bd(i.status)}</h3>
      <p><b>Reporter:</b> ${esc(rn[i.reporter_id]?.full_name)} · <b>Category:</b> ${esc(cn[i.category_id]?.name)} · <b>Type:</b> ${esc(tn[i.type_id]?.name)}</p>
      <p><b>Location:</b> ${esc(ln[i.location_id]?.name) || "Not specified"} · <b>When:</b> ${esc(i.incident_date)} ${esc(i.incident_time)} · <b>Reported:</b> ${fmtD(i.date_reported)}</p>
      <p><b>Description:</b> ${esc(i.description)}</p><p><b>Immediate response:</b> ${esc(i.immediate_response) || "—"}</p>
      ${atts.length ? `<p><b>Attachments:</b> ${atts.map(a => `<a href="${a.file_data}" download="${esc(a.file_name)}">${esc(a.file_name)}</a>`).join(", ")}</p>` : ""}
      <p><b>Investigation:</b> ${inv ? `${esc(inv.status)} (<a href="#investigations?id=${inv.id}">open</a>)` : "Not started"}</p>
      <p><b>Resolution:</b> ${res ? `${esc(res.type)} (${fmtD(res.resolution_date)})${res.closure_date ? " · Closed " + fmtD(res.closure_date) : ""}` : "Not resolved"} · <a href="#workflow?inc=${i.id}">Trace this incident</a></p>
      ${lockMsg ? `<p><small>${esc(lockMsg)}</small></p>` : `<button class="sec" data-a="editInc" data-id="${i.id}">Edit Incident Details</button>`}
      <div id="inc_edit_box"></div></div>`;
    $("#detail").scrollIntoView();
  };

  state.A.editInc = async id => {
    const i = await guardIncident(id);
    $("#inc_edit_box").innerHTML = `<form id="ieditform" data-id="${i.id}"><h4>Edit Incident</h4><div class="grid">
      <label>Location *<select id="e_loc">${opts(locs.filter(l => l.status === "Active" || l.id === i.location_id))}</select></label>
      <label>Severity *<select id="e_sev">${types3(SEVERITIES)}</select></label></div>
      <label>Description *<textarea id="e_desc" rows="3">${esc(i.description)}</textarea></label>
      <label>Immediate Response<textarea id="e_resp" rows="2">${esc(i.immediate_response || "")}</textarea></label>
      <button>Save Changes</button></form>`;
    $("#e_loc").value = i.location_id;
    $("#e_sev").value = i.severity;
  };

  state.S.ieditform = async f => {
    const i = await guardIncident(f.dataset.id);
    const locId = val("e_loc"), sev = val("e_sev"), desc = val("e_desc"), resp = val("e_resp");
    const e = V.chk();
    V.req(e, "e_loc", locId, "Location");
    if (V.req(e, "e_sev", sev, "Severity")) V.oneOf(e, "e_sev", sev, SEVERITIES, "Severity");
    if (V.req(e, "e_desc", desc, "Description")) V.len(e, "e_desc", desc, "Description", 10, 2000);
    V.len(e, "e_resp", resp, "Immediate response", 0, 1000);
    const loc = locId ? await DB.get("locations", locId) : null;
    const lErr = BR.location(loc, false); if (locId && lErr) e.bad("e_loc", lErr);
    if (V.show(e)) return;
    Object.assign(i, { location_id: +locId, severity: sev, description: desc, immediate_response: resp });
    await DB.put("incidents", i);
    await audit("incidents", i.id, "status", "Updated details", { incident_id: i.id });
    msg(`${i.incident_no} updated.`);
    render();
    state.A.view(i.id);
  };

  fillTypes();
  render();
}
