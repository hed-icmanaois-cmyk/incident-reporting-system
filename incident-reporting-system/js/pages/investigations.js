import { INV_STATUSES, FILE_ACCEPT } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, nowISO, today, fmtD, bd, ph, msg, canInv, audit, readFile, notesHTML, state } from "../helpers.js";
import { AppError, need, V, BR, moveIncident, guardInv, denied } from "../validation.js";

export async function investigationsPage(q) {
  let sel = Number(q.get("id")) || null;
  const users = await DB.all("users"), un = byId(users);
  const investigators = users.filter(u => u.active && ["Investigator", "Admin", "Administrator", "Supervisor"].includes(state.ROLES[u.role_id]?.name));
  const ok = canInv();

  app().innerHTML = `<div id="notes"></div>
    ${ok ? `<form id="nform"><h3>Assign Investigation</h3><div class="grid">
      <label>Incident *<select id="n_inc"></select></label>
      <label>Investigator *<select id="n_inv">${ph("-- Select investigator --")}${opts(investigators, "full_name")}</select></label>
      <label>Start Date *<input type="date" id="n_start" value="${today()}"></label><label>Target Completion Date *<input type="date" id="n_target"></label></div>
      <label>Investigation Instructions<textarea id="n_instr" rows="2"></textarea></label><label>Investigation Notes<textarea id="n_notes" rows="2"></textarea></label>
      <button>Assign &amp; Notify</button></form>` : '<p class="card">Only investigators and admins can assign or update investigations.</p>'}
    <h3>Investigations</h3><div class="table-wrap"><table><thead><tr><th>Incident</th><th>Investigator</th><th>Start</th><th>Deadline</th><th>Status</th><th>Completed</th><th></th></tr></thead><tbody id="irows"></tbody></table></div><div id="detail"></div>`;

  const notes = async () => { $("#notes").innerHTML = await notesHTML(); state.drawNav(); };

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
    const inc = need(await DB.get("incidents", v.incident_id), "Incident"), idx = INV_STATUSES.indexOf(v.status), r = v.rca || {};
    const finds = await DB.byIndex("investigation_findings", "investigation_id", v.id);
    const evs = await DB.byIndex("investigation_evidence", "investigation_id", v.id);
    const editable = ok && !BR.editable(inc);
    const ta = (id, label, text = "", rows = 2) => `<label>${label}<textarea id="${id}" rows="${rows}">${esc(text)}</textarea></label>`;

    el.innerHTML = `<div class="card"><h3>${esc(inc.incident_no)} — ${esc(un[v.investigator_id]?.full_name)}</h3>
      <div class="steps">${INV_STATUSES.map((s, i) => `<span class="step ${i < idx ? "done" : i === idx ? "on" : ""}">${s}</span>`).join("")}</div>
      <p><b>Start:</b> ${fmtD(v.start_date)} · <b>Deadline:</b> ${fmtD(v.target_date)} · <b>Completed:</b> ${fmtD(v.end_date)} · <b>Assigned:</b> ${fmtD(v.assigned_at)}</p>
      <p><b>Instructions:</b> ${esc(v.instructions) || "—"}</p><p><b>Notes:</b> ${esc(v.notes) || "—"}</p>
      ${editable && idx < INV_STATUSES.length - 1 ? `<button data-a="adv" data-id="${v.id}">Move to “${INV_STATUSES[idx + 1]}”</button>` : ""}</div>

      <div class="card"><h3>Findings</h3><div class="table-wrap"><table><thead><tr><th>Findings</th><th>Root cause</th><th>Contributing factors</th><th>Witnesses</th><th>Evidence</th><th>Recommendation</th></tr></thead><tbody>
      ${finds.map(f => `<tr><td>${esc(f.finding)}</td><td>${esc(f.root_cause)}</td><td>${esc(f.contributing_factors)}</td><td>${esc(f.witnesses)}</td><td>${esc(f.evidence_summary)}</td><td>${esc(f.recommendation)}</td></tr>`).join("") || '<tr><td colspan="6">No findings recorded.</td></tr>'}</tbody></table></div>
      ${editable ? `<form id="fform">${ta("f_finding", "Findings *")}<div class="grid">${ta("f_root", "Root cause")}${ta("f_contrib", "Contributing factors")}${ta("f_wit", "Witnesses")}${ta("f_evid", "Evidence summary")}</div>${ta("f_rec", "Investigator recommendation")}<button>Add Finding</button></form>` : ""}</div>

      <div class="card"><h3>Evidence</h3>${ok ? `<div class="table-wrap"><table><thead><tr><th>File</th><th>Description</th><th>Uploaded by</th><th>Uploaded</th></tr></thead><tbody>
      ${evs.map(e => `<tr><td>${e.file_type?.startsWith("image/") ? `<img class="thumb" src="${e.file_data}" alt=""> ` : ""}<a href="${e.file_data}" download="${esc(e.file_name)}">${esc(e.file_name)}</a></td><td>${esc(e.description)}</td><td>${esc(un[e.uploaded_by]?.full_name)}</td><td>${fmtD(e.collected_at)}</td></tr>`).join("") || '<tr><td colspan="4">No evidence uploaded.</td></tr>'}</tbody></table></div>
      ${editable ? `<form id="eform"><div class="grid"><label>File (document or photo, max 2 MB) *<input type="file" id="e_file" accept="${FILE_ACCEPT}"></label><label>Description<input id="e_desc"></label></div><button>Upload Evidence</button></form>` : ""}`
      : "<p>Restricted: only investigators and admins can view or upload evidence.</p>"}</div>

      <div class="card"><h3>Root Cause Analysis</h3>${editable ? `<form id="rcaform"><p>Problem → Cause → Evidence → Root Cause → Recommendation</p>
      ${ta("r_problem", "Problem *", r.problem ?? inc.description)}<div class="grid">${ta("r_immediate", "Immediate cause", r.immediate)}${ta("r_cause", "Cause", r.cause)}${ta("r_evidence", "Supporting evidence", r.evidence)}
      ${ta("r_root", "Root cause *", r.root)}${ta("r_contrib", "Contributing factors", r.contrib)}${ta("r_prevent", "Recommended preventive measures", r.prevent)}</div><button>Save Analysis</button></form>` : "<p>Restricted or incident closed.</p>"}</div>`;
  };

  state.A.open = id => { sel = Number(id); detail(); $("#detail").scrollIntoView(); };

  state.A.adv = async id => {
    const { v } = await guardInv(id);
    const next = INV_STATUSES[INV_STATUSES.indexOf(v.status) + 1];
    if (!next) return;
    if (next === "Completed" && !(await DB.byIndex("investigation_findings", "investigation_id", v.id)).length) {
      throw new AppError("Record at least one finding before completing the investigation.", "rule");
    }
    const was = v.status;
    v.status = next;
    if (next === "Completed") v.end_date = today();
    await DB.put("investigations", v);
    await audit("investigations", v.id, "status", next, { incident_id: v.incident_id, old: was, new: next });
    msg(`Investigation moved to ${next}.`);
    list();
    detail();
  };

  state.S.nform = async f => {
    const raw = { incident_id: val("n_inc"), investigator_id: val("n_inv"), start_date: val("n_start"), target_date: val("n_target"), instructions: val("n_instr"), notes: val("n_notes") };
    const inc0 = raw.incident_id ? await DB.get("incidents", raw.incident_id) : null;
    const e = V.investigation(raw, inc0);
    if (raw.incident_id) {
      const [existingInvs, rep, loc] = await Promise.all([
        DB.byIndex("investigations", "incident_id", +raw.incident_id),
        inc0 ? DB.get("reporters", inc0.reporter_id) : null,
        inc0 ? DB.get("locations", inc0.location_id) : null
      ]);
      BR.investigable(inc0, existingInvs.length > 0, rep, loc).forEach(m => e.bad("n_inc", m));
    }
    if (V.show(e)) return;

    const i = need(inc0, "Incident");
    const id = await DB.add("investigations", {
      incident_id: i.id, investigator_id: +raw.investigator_id, status: "Assigned",
      start_date: raw.start_date, target_date: raw.target_date, end_date: null,
      instructions: raw.instructions, notes: raw.notes, assigned_at: nowISO(), assigned_by: state.ME.id
    });
    const wasSt = await moveIncident(i, "Under Investigation");
    await DB.add("notifications", { user_id: +raw.investigator_id, incident_id: i.id, message: `You were assigned to investigate ${i.incident_no} (due ${raw.target_date}).`, is_read: false, created_at: nowISO() });
    await audit("investigations", id, "create", i.incident_no, { incident_id: i.id, old: wasSt, new: "Under Investigation" });
    msg(`Investigation assigned for ${i.incident_no}; investigator notified.`);
    f.reset();
    $("#n_start").value = today();
    sel = id;
    list();
    notes();
    detail();
  };

  state.S.fform = async () => {
    await guardInv(sel);
    const rec = {
      finding: val("f_finding"), root_cause: val("f_root"), contributing_factors: val("f_contrib"),
      witnesses: val("f_wit"), evidence_summary: val("f_evid"), recommendation: val("f_rec")
    };
    if (V.show(V.finding(rec))) return;
    await DB.add("investigation_findings", { investigation_id: sel, ...rec, created_at: nowISO() });
    await audit("investigations", sel, "finding");
    msg("Finding recorded.");
    detail();
  };

  state.S.eform = async () => {
    if (!canInv()) { denied("upload investigation evidence"); return; }
    await guardInv(sel);
    const f = $("#e_file").files[0], desc = val("e_desc");
    const e = V.chk();
    V.file(e, "e_file", f, true, "Evidence file");
    V.len(e, "e_desc", desc, "Description", 0, 300);
    if (V.show(e)) return;
    const data = await readFile(f);
    await DB.add("investigation_evidence", { investigation_id: sel, description: desc, file_name: f.name, file_type: f.type, file_data: data, uploaded_by: state.ME.id, collected_at: nowISO() });
    await audit("investigations", sel, "evidence", f.name);
    msg("Evidence uploaded.");
    detail();
  };

  state.S.rcaform = async () => {
    const { v } = await guardInv(sel);
    const r = {
      problem: val("r_problem"), immediate: val("r_immediate"), cause: val("r_cause"),
      evidence: val("r_evidence"), root: val("r_root"), contrib: val("r_contrib"), prevent: val("r_prevent")
    };
    if (V.show(V.rca(r))) return;
    v.rca = r;
    await DB.put("investigations", v);
    await audit("investigations", sel, "rca");
    msg("Root cause analysis saved.");
  };

  notes();
  list();
  detail();
}