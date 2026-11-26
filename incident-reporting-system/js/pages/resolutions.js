import { RESOLUTION_TYPES, FILE_ACCEPT, PERM } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, nowISO, today, fmtD, bd, ph, types3, msg, audit, readFile, state } from "../helpers.js";
import { need, V, BR, moveIncident } from "../validation.js";

async function reviewData(incId) {
  const i = need(await DB.get("incidents", incId), "Incident"), users = byId(await DB.all("users"));
  const [rep, loc, cat, type] = await Promise.all([
    DB.get("reporters", i.reporter_id),
    i.location_id ? DB.get("locations", i.location_id) : null,
    DB.get("incident_categories", i.category_id),
    DB.get("incident_types", i.type_id)
  ]);
  const inv = (await DB.byIndex("investigations", "incident_id", i.id))[0];
  const finds = inv ? await DB.byIndex("investigation_findings", "investigation_id", inv.id) : [];
  const acts = await DB.byIndex("actions", "incident_id", i.id);
  const res = (await DB.byIndex("resolutions", "incident_id", i.id))[0];
  const checks = [
    ["Incident has an investigation", !!inv],
    ["Investigation is completed with findings", !BR.findingsComplete(inv, finds)],
    ["Corrective actions exist and all are completed", !BR.actionsComplete(acts)]
  ];
  return { i, rep, loc, cat, type, inv, finds, acts, res, users, checks };
}

function reviewHTML(d) {
  const { i, rep, loc, cat, type, inv, finds, acts, res, users, checks } = d;
  return `<div class="card"><h3>${esc(i.incident_no)} ${bd(i.severity)} ${bd(i.status)}</h3>
    <p><b>Reporter:</b> ${esc(rep?.full_name)} · <b>Category/Type:</b> ${esc(cat?.name)} / ${esc(type?.name)} · <b>Location:</b> ${esc(loc?.name) || "—"} · <b>When:</b> ${esc(i.incident_date)} ${esc(i.incident_time)}</p>
    <p><b>Description:</b> ${esc(i.description)}</p>
    <h4>Investigation</h4>${inv ? `<p>${bd(inv.status)} · Investigator: ${esc(users[inv.investigator_id]?.full_name)} · Deadline ${fmtD(inv.target_date)} · Completed ${fmtD(inv.end_date)}</p>
      <div class="table-wrap"><table><thead><tr><th>Findings</th><th>Root cause</th><th>Recommendation</th></tr></thead><tbody>${finds.map(f => `<tr><td>${esc(f.finding)}</td><td>${esc(f.root_cause)}</td><td>${esc(f.recommendation)}</td></tr>`).join("") || '<tr><td colspan="3">No findings.</td></tr>'}</tbody></table></div>
      ${inv.rca ? `<p><b>RCA:</b> ${esc(inv.rca.problem)} → <b>Root cause:</b> ${esc(inv.rca.root)}</p>` : ""}` : "<p>No investigation.</p>"}
    <h4>Corrective actions</h4><div class="table-wrap"><table><thead><tr><th>Action</th><th>Responsible</th><th>Due</th><th>Completed</th><th>Status</th></tr></thead><tbody>${acts.map(a =>
      `<tr><td>${esc(a.action_type)}: ${esc(a.description)}</td><td>${esc(users[a.assigned_to]?.full_name)}</td><td>${fmtD(a.due_date)}</td><td>${fmtD(a.completion_date)}</td><td>${bd(a.status)}</td></tr>`).join("") || '<tr><td colspan="5">No actions.</td></tr>'}</tbody></table></div>
    ${res ? `<h4>Resolution</h4><p><b>${esc(res.type)}</b> on ${fmtD(res.resolution_date)} by ${esc(users[res.resolved_by]?.full_name)}<br>${esc(res.description)}<br><b>Remarks:</b> ${esc(res.remarks) || "—"}
      ${res.doc_data ? `<br><b>Document:</b> <a href="${res.doc_data}" download="${esc(res.doc_name)}">${esc(res.doc_name)}</a>` : ""}
      ${res.closure_date ? `<br><b>Closed:</b> ${fmtD(res.closure_date)} by ${esc(users[res.closed_by]?.full_name)} — ${esc(res.closure_remarks) || "no remarks"}` : ""}</p>` : ""}
    <h4>Readiness checks</h4><ul class="checks">${checks.map(([t, ok]) => `<li class="${ok ? "ok" : "fail"}">${ok ? "✔" : "✘"} ${t}</li>`).join("")}</ul></div>`;
}

export async function resolutionsPage() {
  const [incs, ress, users] = await Promise.all(["incidents", "resolutions", "users"].map(s => DB.all(s)));
  const un = byId(users), inc = byId(incs);
  const done = new Set(ress.map(r => r.incident_id));
  const pending = incs.filter(i => !done.has(i.id) && i.status !== "Closed");

  app().innerHTML = `<form id="resform"><h3>Record Resolution</h3><div class="grid">
    <label>Incident *<select id="r_inc">${ph("-- Select incident --")}${opts(pending, i => `${i.incident_no} (${i.status})`)}</select></label>
    <label>Resolution Type *<select id="r_type">${ph("-- Select --")}${types3(RESOLUTION_TYPES)}</select></label>
    <label>Resolution Date *<input type="date" id="r_date" value="${today()}" max="${today()}"></label>
    <label>Supporting Document (max 2 MB)<input type="file" id="r_file" accept="${FILE_ACCEPT}"></label></div>
    <label>Resolution Description *<textarea id="r_desc" rows="3"></textarea></label><label>Remarks<textarea id="r_rem" rows="2"></textarea></label>
    <button>Save Resolution</button></form><div id="review"></div>
    <h3>Recorded Resolutions</h3><div class="table-wrap"><table><thead><tr><th>Incident</th><th>Type</th><th>Date</th><th>Resolved by</th><th>Remarks</th><th>Document</th><th>Incident status</th></tr></thead><tbody>${ress.map(r =>
      `<tr><td>${esc(inc[r.incident_id]?.incident_no)}</td><td>${esc(r.type)}</td><td>${fmtD(r.resolution_date)}</td><td>${esc(un[r.resolved_by]?.full_name)}</td><td>${esc(r.remarks) || "—"}</td>
      <td>${r.doc_data ? `<a href="${r.doc_data}" download="${esc(r.doc_name)}">${esc(r.doc_name)}</a>` : "—"}</td><td>${bd(inc[r.incident_id]?.status || "")}</td></tr>`).join("") || '<tr><td colspan="7">No resolutions yet.</td></tr>'}</tbody></table></div>`;

  state.CH.r_inc = async () => {
    $("#review").innerHTML = val("r_inc") ? reviewHTML(await reviewData(val("r_inc"))) : "";
  };

  state.S.resform = async () => {
    const raw = {
      incident_id: val("r_inc"), type: val("r_type"), description: val("r_desc"),
      resolution_date: val("r_date"), remarks: val("r_rem")
    };
    const file = $("#r_file").files[0];
    const d = raw.incident_id ? await reviewData(raw.incident_id) : null;
    const e = V.resolution(raw, d?.i || null, file);
    if (d) {
      if (d.res) e.bad("r_inc", "This incident already has a resolution");
      const fErr = BR.findingsComplete(d.inv, d.finds); if (fErr) e.bad("r_inc", fErr);
      const aErr = BR.actionsComplete(d.acts); if (aErr) e.bad("r_inc", aErr);
      const tErr = BR.transition(d.i.status, "Resolved"); if (tErr) e.bad("r_inc", tErr);
    }
    if (V.show(e)) return;

    const doc = file ? await readFile(file) : null;
    const id = await DB.add("resolutions", {
      incident_id: d.i.id, type: raw.type, description: raw.description, resolution_date: raw.resolution_date,
      resolved_by: state.ME.id, remarks: raw.remarks, doc_name: file?.name || null, doc_type: file?.type || null, doc_data: doc, created_at: nowISO()
    });
    const wasSt = await moveIncident(d.i, "Resolved", { resolved_date: raw.resolution_date });
    await audit("resolutions", id, "create", d.i.incident_no, { incident_id: d.i.id, old: wasSt, new: "Resolved" });
    msg(`Resolution recorded; ${d.i.incident_no} is now Resolved.`);
    state.route();
  };
}

export async function closurePage() {
  const [incs, ress, users] = await Promise.all(["incidents", "resolutions", "users"].map(s => DB.all(s)));
  const un = byId(users), inc = byId(incs);

  app().innerHTML = `<p>Review a resolved incident, confirm the resolution and close it. Only authorized users (${PERM.close.join(", ")}) can close incidents.</p>
    <div class="table-wrap"><table><thead><tr><th>Incident</th><th>Resolution</th><th>Resolution date</th><th>Resolved by</th><th>Closure date</th><th>Status</th><th></th></tr></thead><tbody>${ress.map(r =>
      `<tr><td>${esc(inc[r.incident_id]?.incident_no)}</td><td>${esc(r.type)}</td><td>${fmtD(r.resolution_date)}</td><td>${esc(un[r.resolved_by]?.full_name)}</td><td>${fmtD(r.closure_date)}</td><td>${bd(inc[r.incident_id]?.status || "")}</td>
      <td><button class="sec" data-a="review" data-id="${r.incident_id}">Review</button></td></tr>`).join("") || '<tr><td colspan="7">No resolved incidents yet.</td></tr>'}</tbody></table></div><div id="detail"></div>`;

  state.A.review = async id => {
    const d = await reviewData(id);
    $("#detail").innerHTML = reviewHTML(d) + (d.i.status === "Resolved" ? `<form id="closeform" data-id="${d.i.id}"><h3>Confirm Resolution &amp; Close</h3>
      <label><input type="checkbox" id="c_ok"> I reviewed the incident, findings, actions and resolution and confirm the resolution.</label>
      <label>Closure Remarks<textarea id="c_rem" rows="2"></textarea></label><button>Close Incident</button></form>` : "");
    $("#detail").scrollIntoView();
  };

  state.S.closeform = async f => {
    const d = await reviewData(f.dataset.id), e = V.chk();
    if (d.i.status !== "Resolved" || !d.res) e.bad("c_ok", "Only resolved incidents can be closed");
    const fErr = BR.findingsComplete(d.inv, d.finds); if (fErr) e.bad("c_ok", fErr);
    const aErr = BR.actionsComplete(d.acts); if (aErr) e.bad("c_ok", aErr);
    const tErr = BR.transition(d.i.status, "Closed"); if (tErr) e.bad("c_ok", tErr);
    if (!$("#c_ok").checked) e.bad("c_ok", "Please confirm the resolution before closing");
    V.len(e, "c_rem", val("c_rem"), "Closure remarks", 0, 1000);
    if (V.show(e)) return;

    Object.assign(d.res, { confirmed: true, closure_date: today(), closed_by: state.ME.id, closure_remarks: val("c_rem") });
    await DB.put("resolutions", d.res);
    const wasSt = await moveIncident(d.i, "Closed", { closed_date: today() });
    await audit("incidents", d.i.id, "close", d.i.incident_no, { incident_id: d.i.id, old: wasSt, new: "Closed" });
    msg(`${d.i.incident_no} has been closed.`);
    state.route();
  };
}