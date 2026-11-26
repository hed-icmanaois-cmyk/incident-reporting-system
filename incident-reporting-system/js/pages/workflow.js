import { DONE_STATUSES } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, fmtD, bd, ph, state } from "../helpers.js";

export async function workflowPage(q) {
  const [reps, locs, incs, invs, finds, acts, ress, users, logs] = await Promise.all([
    "reporters", "locations", "incidents", "investigations", "investigation_findings", "actions", "resolutions", "users", "audit_logs"
  ].map(s => DB.all(s)));

  const rn = byId(reps), ln = byId(locs), inc = byId(incs), un = byId(users);
  const okAct = a => DONE_STATUSES.includes(a.status);

  app().innerHTML = `<p>Select any incident to trace its complete lifecycle from reporter registration through closure and audit logs.</p>
    <div class="card"><h3>Incident Trace</h3>
      <label>Incident<select id="t_inc">${ph("-- Select incident --")}${opts(incs, i => `${i.incident_no} (${i.status})`)}</select></label>
    </div><div id="trace"></div>`;

  const step = (ok, title, body) => `<div class="card"><b class="${ok ? "ok" : "fail"}">${ok ? "✔" : "○"}</b> <b>${title}</b><div>${body || "Not yet done."}</div></div>`;

  state.CH.t_inc = () => {
    const i = inc[val("t_inc")];
    if (!i) { $("#trace").innerHTML = ""; return; }
    const r = rn[i.reporter_id], l = ln[i.location_id], v = invs.find(x => x.incident_id === i.id);
    const fs = v ? finds.filter(f => f.investigation_id === v.id) : [];
    const as = acts.filter(a => a.incident_id === i.id), res = ress.find(x => x.incident_id === i.id);
    const keys = new Set([`incidents:${i.id}`, ...(v ? [`investigations:${v.id}`] : []), ...as.map(a => `actions:${a.id}`), ...(res ? [`resolutions:${res.id}`] : [])]);
    const trail = logs.filter(x => keys.has(x.entity + ":" + x.entity_id));

    $("#trace").innerHTML = `<h3>${esc(i.incident_no)} ${bd(i.severity)} ${bd(i.status)}</h3>
      ${step(!!r, "1. Reporter registration", r && `${esc(r.full_name)} (${esc(r.reporter_no)}), ${esc(r.reporter_type)} — registered ${fmtD(r.created_at)}`)}
      ${step(true, "2. Incident reporting", `${esc(i.incident_no)} — ${esc(i.description)} (occurred ${esc(i.incident_date)} ${esc(i.incident_time)}, reported ${fmtD(i.date_reported)})`)}
      ${step(!!l, "3. Location identification", l && esc(l.name))}
      ${step(!!v, "4. Investigation assignment", v && `Investigator ${esc(un[v.investigator_id]?.full_name)}, assigned ${fmtD(v.assigned_at)}, deadline ${fmtD(v.target_date)}`)}
      ${step(v?.status === "Completed", "5. Investigation", v && `${bd(v.status)} started ${fmtD(v.start_date)}, completed ${fmtD(v.end_date)}`)}
      ${step(fs.length > 0, "6. Findings / root cause", fs.length ? fs.map(f => `${esc(f.finding)} — root cause: ${esc(f.root_cause) || "—"}`).join("<br>") + (v.rca ? `<br><b>RCA root cause:</b> ${esc(v.rca.root)}` : "") : "")}
      ${step(as.length > 0 && as.every(okAct), "7. Corrective action", as.map(a => `${esc(a.action_type)} — ${esc(un[a.assigned_to]?.full_name)}, due ${fmtD(a.due_date)}, ${bd(a.status)}, completed ${fmtD(a.completion_date)}`).join("<br>"))}
      ${step(!!res, "8. Resolution", res && `${esc(res.type)} on ${fmtD(res.resolution_date)} by ${esc(un[res.resolved_by]?.full_name)}`)}
      ${step(i.status === "Closed", "9. Closure", i.status === "Closed" && res && `Closed ${fmtD(res.closure_date)} by ${esc(un[res.closed_by]?.full_name)}`)}
      <div class="card"><h4>Audit trail</h4><div class="table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Record</th><th>Action</th><th>Details</th></tr></thead><tbody>${trail.map(x =>
        `<tr><td>${fmtD(x.created_at)}</td><td>${esc(un[x.user_id]?.full_name)}</td><td>${esc(x.entity)} #${x.entity_id}</td><td>${esc(x.action)}</td><td>${esc(x.details)}</td></tr>`).join("") || '<tr><td colspan="5">No audit entries.</td></tr>'}</tbody></table></div></div>`;
  };

  const pre = q.get("inc");
  if (pre) {
    $("#t_inc").value = pre;
    state.CH.t_inc();
  }
}