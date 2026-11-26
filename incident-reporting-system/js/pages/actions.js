import { ACTION_TYPES, ACTION_STATUSES, PRIORITIES, NEXT_ACTION_STATUS, DONE_STATUSES } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, nowISO, today, fmtD, bd, ph, types3, msg, can, audit, state } from "../helpers.js";
import { need, V, guardIncident, denied } from "../validation.js";

export async function actionsPage() {
  const [users, incs, invs, finds] = await Promise.all(["users", "incidents", "investigations", "investigation_findings"].map(s => DB.all(s)));
  const un = byId(users), inc = byId(incs), vn = byId(invs);
  const ready = invs.filter(v => finds.some(f => f.investigation_id === v.id));

  app().innerHTML = `<form id="aform"><h3>Assign Action</h3><div class="grid">
    <label>Investigation *<select id="a_inv">${ph(ready.length ? "-- Select investigation --" : "-- Record findings first --")}${opts(ready, v => `${inc[v.incident_id]?.incident_no} (${v.status})`)}</select></label>
    <label>Action Type *<select id="a_type">${ph("-- Select --")}${types3(ACTION_TYPES)}</select></label>
    <label>Responsible Person *<select id="a_who">${ph("-- Select --")}${opts(users.filter(u => u.active), u => `${u.full_name} (${state.ROLES[u.role_id]?.name})`)}</select></label>
    <label>Target Date *<input type="date" id="a_due" min="${today()}"></label>
    <label>Priority *<select id="a_pri">${ph("-- Select --")}${types3(PRIORITIES)}</select></label></div>
    <div id="basis"></div>
    <label>Action Description *<textarea id="a_desc" rows="2"></textarea></label>
    <label>Action Requirements *<textarea id="a_req" rows="2" placeholder="What must be done, resources needed, how completion is judged"></textarea></label>
    <button>Assign &amp; Notify</button></form>
    <div class="card grid flt"><label>Status<select id="f_st">${ph("All")}${types3(ACTION_STATUSES)}</select></label><label>Priority<select id="f_pri">${ph("All")}${types3(PRIORITIES)}</select></label></div>
    <div class="table-wrap"><table><thead><tr><th>Incident</th><th>Type</th><th>Description</th><th>Requirements</th><th>Responsible</th><th>Target</th><th>Priority</th><th>Status</th></tr></thead><tbody id="rows"></tbody></table></div>
    <p>Track progress on the <a href="#actmon">Action Monitoring</a> page.</p>`;

  const render = async () => {
    const s = $("#f_st").value, p = $("#f_pri").value;
    const rows = (await DB.all("actions")).filter(a => (!s || a.status === s) && (!p || a.priority === p)).reverse();
    $("#rows").innerHTML = rows.map(a => `<tr><td>${esc(inc[a.incident_id]?.incident_no)}</td><td>${esc(a.action_type)}</td><td>${esc(a.description)}</td><td>${esc(a.requirements) || "—"}</td><td>${esc(un[a.assigned_to]?.full_name)}</td>
      <td>${fmtD(a.due_date)} ${!DONE_STATUSES.includes(a.status) && a.due_date < today() ? bd("Overdue") : ""}</td><td>${bd(a.priority)}</td><td>${bd(a.status)}</td></tr>`).join("") || '<tr><td colspan="8">No actions found.</td></tr>';
  };

  state.I = render;
  state.CH.a_inv = () => {
    const id = val("a_inv"), v = vn[id];
    $("#basis").innerHTML = !v ? "" : `<div class="card"><h4>Basis: findings &amp; root cause</h4>${finds.filter(f => f.investigation_id == id).map(f =>
      `<p><b>Root cause:</b> ${esc(f.root_cause) || "—"} · <b>Recommendation:</b> ${esc(f.recommendation) || "—"}</p>`).join("")}${v.rca ? `<p><b>RCA root cause:</b> ${esc(v.rca.root)} · <b>Preventive measures:</b> ${esc(v.rca.prevent) || "—"}</p>` : ""}</div>`;
  };

  state.S.aform = async f => {
    const raw = {
      investigation_id: val("a_inv"), action_type: val("a_type"), assigned_to: val("a_who"),
      description: val("a_desc"), requirements: val("a_req"), due_date: val("a_due"), priority: val("a_pri")
    };
    const v = raw.investigation_id ? vn[raw.investigation_id] : undefined;
    if (V.show(V.action(raw, v))) return;
    const n = await guardIncident(v.incident_id);
    const id = await DB.add("actions", {
      investigation_id: v.id, incident_id: v.incident_id, action_type: raw.action_type, description: raw.description, requirements: raw.requirements,
      assigned_to: +raw.assigned_to, assigned_by: state.ME.id, assigned_at: nowISO(), due_date: raw.due_date, priority: raw.priority, status: "Pending", completion_date: null, remarks: ""
    });
    await DB.add("action_monitoring", { action_id: id, from_status: null, to_status: "Pending", remarks: "Action assigned", changed_by: state.ME.id, changed_at: nowISO() });
    await DB.add("notifications", { user_id: +raw.assigned_to, incident_id: v.incident_id, action_id: id, message: `You were assigned a ${raw.action_type} for ${n.incident_no} (due ${raw.due_date}, ${raw.priority} priority).`, is_read: false, created_at: nowISO() });
    await audit("actions", id, "create", raw.action_type, { incident_id: v.incident_id });
    msg("Action saved; responsible person notified.");
    f.reset();
    $("#basis").innerHTML = "";
    render();
  };
  render();
}

export async function actmonPage() {
  const [users, incs] = await Promise.all(["users", "incidents"].map(s => DB.all(s)));
  const un = byId(users), inc = byId(incs);

  app().innerHTML = `<div class="card grid flt"><label>Status<select id="f_st">${ph("All")}${types3(ACTION_STATUSES)}</select></label>
    <label>Responsible<select id="f_who">${ph("All")}${opts(users, "full_name")}</select></label><label><input type="checkbox" id="f_mine"> My actions only</label></div>
    <div class="table-wrap"><table><thead><tr><th>Incident</th><th>Action</th><th>Responsible</th><th>Deadline</th><th>Completion date</th><th>Status</th><th>Remarks</th><th></th></tr></thead><tbody id="rows"></tbody></table></div><div id="detail"></div>`;

  const allowed = a => NEXT_ACTION_STATUS[a.status] && (NEXT_ACTION_STATUS[a.status] === "Verified" ? can("verify") : (can("action") || a.assigned_to === state.ME.id));

  const render = async () => {
    const s = $("#f_st").value, w = $("#f_who").value, mine = $("#f_mine").checked;
    const rows = (await DB.all("actions")).filter(a => (!s || a.status === s) && (!w || a.assigned_to == w) && (!mine || a.assigned_to === state.ME.id)).reverse();
    $("#rows").innerHTML = rows.map(a => `<tr><td>${esc(inc[a.incident_id]?.incident_no)}</td><td><b>${esc(a.action_type)}</b><br>${esc(a.description)}</td><td>${esc(un[a.assigned_to]?.full_name)}</td>
      <td>${fmtD(a.due_date)} ${!DONE_STATUSES.includes(a.status) && a.due_date < today() ? bd("Overdue") : ""}</td><td>${fmtD(a.completion_date)}</td><td>${bd(a.status)}</td><td>${esc(a.remarks) || "—"}</td>
      <td>${allowed(a) ? `<button class="sec" data-a="advAct" data-id="${a.id}">Move to ${NEXT_ACTION_STATUS[a.status]}</button> ` : ""}<button class="sec" data-a="hist" data-id="${a.id}">History</button></td></tr>`).join("") || '<tr><td colspan="8">No actions found.</td></tr>';
  };

  state.I = render;

  state.A.advAct = async id => {
    const a = need(await DB.get("actions", id), "Action"), next = NEXT_ACTION_STATUS[a.status];
    if (!next || !allowed(a)) { denied(`update action #${a.id}`); return; }
    await guardIncident(a.incident_id);
    const remarks = prompt(`Remarks for moving to "${next}" (optional):`);
    if (remarks === null) return;
    const from = a.status;
    a.status = next;
    if (next === "Completed") a.completion_date = today();
    if (next === "Verified") { a.verified_by = state.ME.id; a.verified_date = today(); }
    if (remarks.trim()) a.remarks = remarks.trim();
    await DB.put("actions", a);
    await DB.add("action_monitoring", { action_id: a.id, from_status: from, to_status: next, remarks: remarks.trim(), changed_by: state.ME.id, changed_at: nowISO() });
    await audit("actions", a.id, "status", next, { incident_id: a.incident_id, old: from, new: next });
    if (next === "Completed" && a.assigned_by && a.assigned_by !== state.ME.id) {
      await DB.add("notifications", { user_id: a.assigned_by, incident_id: a.incident_id, action_id: a.id, message: `${state.ME.full_name} completed "${a.action_type}" for ${inc[a.incident_id]?.incident_no}. Please verify.`, is_read: false, created_at: nowISO() });
    }
    msg(`Action moved to ${next}.`);
    render();
    state.drawNav();
  };

  state.A.hist = async id => {
    const h = await DB.byIndex("action_monitoring", "action_id", Number(id));
    $("#detail").innerHTML = `<div class="card"><h3>Status history</h3><div class="table-wrap"><table><thead><tr><th>When</th><th>From</th><th>To</th><th>By</th><th>Remarks</th></tr></thead><tbody>${h.map(x =>
      `<tr><td>${fmtD(x.changed_at)}</td><td>${x.from_status ? bd(x.from_status) : "—"}</td><td>${bd(x.to_status)}</td><td>${esc(un[x.changed_by]?.full_name)}</td><td>${esc(x.remarks) || "—"}</td></tr>`).join("") || '<tr><td colspan="5">No history.</td></tr>'}</tbody></table></div></div>`;
    $("#detail").scrollIntoView();
  };
  render();
}

export async function overduePage() {
  const [acts, users, incs] = await Promise.all(["actions", "users", "incidents"].map(s => DB.all(s)));
  const un = byId(users), inc = byId(incs), t = today();
  const rows = acts.filter(a => a.due_date < t && !DONE_STATUSES.includes(a.status))
    .map(a => ({ a, d: Math.round((Date.parse(t) - Date.parse(a.due_date)) / 864e5) }))
    .sort((x, y) => y.d - x.d);

  app().innerHTML = `<p>Today is ${esc(t)}. <b>${rows.length}</b> action(s) are overdue (target date passed and not yet completed).</p>
    <div class="table-wrap"><table><thead><tr><th>Incident</th><th>Action</th><th>Responsible</th><th>Due date</th><th>Days overdue</th><th>Priority</th><th>Status</th></tr></thead><tbody>${rows.map(({ a, d }) =>
      `<tr><td>${esc(inc[a.incident_id]?.incident_no)}</td><td><b>${esc(a.action_type)}</b><br>${esc(a.description)}</td><td>${esc(un[a.assigned_to]?.full_name)}</td><td>${fmtD(a.due_date)}</td><td>${bd(d + " day" + (d === 1 ? "" : "s"), "Overdue")}</td><td>${bd(a.priority)}</td><td>${bd(a.status)}</td></tr>`).join("") || '<tr><td colspan="7">No overdue actions.</td></tr>'}</tbody></table></div>`;
}