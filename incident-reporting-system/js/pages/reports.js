import { DONE_STATUSES, TARGET_DAYS } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, opts, byId, val, today, fmtD, bd, state } from "../helpers.js";

const rd = async () => {
  const n = ["incidents", "incident_categories", "incident_types", "locations", "departments", "reporters", "investigations", "actions", "resolutions", "users"];
  const v = await Promise.all(n.map(s => DB.all(s)));
  const D = Object.fromEntries(n.map((s, i) => [s, v[i]]));
  D.M = Object.fromEntries(n.map((s, i) => [s, byId(v[i])]));
  return D;
};

const rcnt = (a, f) => {
  const o = {};
  a.forEach(x => { const k = f(x) || "—"; o[k] = (o[k] || 0) + 1; });
  return Object.entries(o).sort((p, q) => q[1] - p[1]);
};
const rdays = (a, b) => Math.round((new Date(String(b).slice(0, 10)) - new Date(String(a).slice(0, 10))) / 864e5);
const rpct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";
const rtb = (h, rows) => `<div class="table-wrap"><table><thead><tr>${h.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${h.length}">No data.</td></tr>`}</tbody></table></div>`;
const rbar = (n, m) => `<div class="bar-track"><div class="bar-fill" style="width:${m ? n / m * 100 : 0}%"></div></div>`;
const rdist = (title, pairs) => {
  const m = Math.max(0, ...pairs.map(p => p[1])), t = pairs.reduce((s, p) => s + p[1], 0);
  return `<h3>${title}</h3>` + rtb([title.replace("By ", ""), "Incidents", "Share", ""], pairs.map(([k, c]) => [esc(k), c, rpct(c, t), rbar(c, m)]));
};
const rlate = a => a.due_date && a.due_date < today() && !DONE_STATUSES.includes(a.status);
const rdept = (D, i) => D.M.departments[D.M.locations[i.location_id]?.department_id ?? D.M.reporters[i.reporter_id]?.department_id]?.name;
const rtile = (cls, href, n, l) => `<a class="stat ${cls}" href="#${href}"><b>${n}</b><span>${l}</span></a>`;
const rsolved = i => ["Resolved", "Closed"].includes(i.status);
const rforAction = D => {
  const s = new Set(D.actions.filter(a => !DONE_STATUSES.includes(a.status)).map(a => a.incident_id));
  return D.incidents.filter(i => s.has(i.id) && !rsolved(i));
};
const rwho = (D, id) => esc(D.M.users[id]?.full_name || "—");

const ACT = {
  create: "Created", status: "Status changed", close: "Closed incident", login: "Signed in",
  finding: "Finding recorded", evidence: "Evidence uploaded", rca: "Root cause analysis saved",
  password: "Password changed", password_change: "Password changed", password_reset: "Password reset requested",
  user_update: "User updated", backup: "Backup exported", restore: "Backup restored", denied: "Access denied"
};

export async function auditPage() {
  const [logs, D] = await Promise.all([DB.all("audit_logs"), rd()]);
  const users = D.users, un = D.M.users;
  const incOf = r => r.incident_id ?? (r.entity === "incidents" ? r.entity_id : r.entity === "investigations" ? D.M.investigations[r.entity_id]?.incident_id
    : r.entity === "actions" ? D.M.actions[r.entity_id]?.incident_id : r.entity === "resolutions" ? D.M.resolutions[r.entity_id]?.incident_id : null);
  const rows = logs.slice().reverse().map(r => ({ r, inc: D.M.incidents[incOf(r)]?.incident_no || "—" }));

  app().innerHTML = `<p>Complete transaction history (${logs.length} entries, newest first).</p>
    <div class="card grid flt">
      <label>Search<input id="aq" placeholder="User, activity, incident, value…"></label>
      <label>User<select id="au"><option value="">All users</option>${opts(users, "full_name")}</select></label>
    </div><div id="atab"></div>`;

  const draw = () => {
    const q = val("aq").toLowerCase(), u = $("#au").value;
    const out = rows.filter(({ r, inc }) => (!u || r.user_id == u) && (!q || [un[r.user_id]?.full_name, r.entity, r.action, inc, r.details, r.old_value, r.new_value].join(" ").toLowerCase().includes(q))).slice(0, 300);
    $("#atab").innerHTML = rtb(["Date/time", "User", "Activity", "Incident affected", "Previous value", "New value", "Action performed"], out.map(({ r, inc }) =>
      [esc(new Date(r.created_at).toLocaleString()), esc(un[r.user_id]?.full_name || "—"), esc(r.entity) + " #" + r.entity_id, esc(inc), esc(r.old_value ?? "—"),
        esc(r.new_value ?? (r.action === "status" ? r.details : "—")), esc(ACT[r.action] || r.action) + (r.details ? " — " + esc(r.details) : "")]));
  };
  state.I = draw;
  state.CH.au = draw;
  draw();
}

const RP = {
  summary: D => {
    const n = s => D.incidents.filter(i => i.status === s).length;
    return `<div class="stats">${rtile("", "incidents", D.incidents.length, "Total incidents")}${rtile("s-open", "incidents", n("Open"), "Open")}${rtile("s-inv", "investigations", n("Under Investigation"), "Under investigation")}
      ${rtile("s-late", "actions", rforAction(D).length, "For action (unfinished)")}${rtile("s-res", "closure", n("Resolved"), "Resolved")}${rtile("s-ok", "incidents", n("Closed"), "Closed")}</div>`
      + rdist("By Status", rcnt(D.incidents, i => i.status));
  },
  category: D => rdist("By Category", rcnt(D.incidents, i => D.M.incident_categories[i.category_id]?.name))
    + rdist("By Type", rcnt(D.incidents, i => D.M.incident_types[i.type_id]?.name))
    + rdist("By Severity", rcnt(D.incidents, i => i.severity))
    + rdist("By Department", rcnt(D.incidents, i => rdept(D, i)))
    + rdist("By Location", rcnt(D.incidents, i => D.M.locations[i.location_id]?.name)),
  location: D => {
    const W = { Critical: 4, High: 3, Medium: 2, Low: 1 }, L = id => D.M.locations[id];
    const risk = D.locations.map(l => {
      const a = D.incidents.filter(i => i.location_id === l.id);
      const s = a.reduce((t, i) => t + (W[i.severity] || 0), 0);
      const hi = a.filter(i => ["Critical", "High"].includes(i.severity)).length;
      const rec = rcnt(a, i => D.M.incident_types[i.type_id]?.name).filter(([, c]) => c >= 2);
      return { l, n: a.length, s, hi, rec };
    }).filter(x => x.n).sort((a, b) => b.s - a.s);
    return rdist("By Building", rcnt(D.incidents, i => L(i.location_id)?.building))
      + rdist("By Room", rcnt(D.incidents, i => L(i.location_id)?.room || L(i.location_id)?.name))
      + rdist("By Department", rcnt(D.incidents, i => rdept(D, i)))
      + `<h3>High-risk locations</h3><p>Risk score = Critical×4 + High×3 + Medium×2 + Low×1. High risk = 2+ Critical/High incidents or score ≥ 6.</p>`
      + rtb(["Location", "Incidents", "Critical/High", "Risk score", "Rating"], risk.map(x => [esc(x.l.name), x.n, x.hi, x.s, x.hi >= 2 || x.s >= 6 ? bd("High risk", "Critical") : bd("Normal", "Low")]))
      + `<h3>Recurring incident locations</h3><p>Same incident type reported 2+ times at one location.</p>`
      + rtb(["Location", "Recurring types"], risk.filter(x => x.rec.length).map(x => [esc(x.l.name), x.rec.map(([t, c]) => bd(`${t} ×${c}`, "Overdue")).join(" ")]));
  },
  investigation: D => {
    const V = D.investigations, done = V.filter(v => v.status === "Completed"), pend = V.filter(v => v.status !== "Completed");
    const late = v => v.status !== "Completed" && v.target_date && v.target_date < today();
    const dur = done.filter(v => v.start_date && v.end_date).map(v => rdays(v.start_date, v.end_date));
    const avg = dur.length ? (dur.reduce((a, b) => a + b, 0) / dur.length).toFixed(1) + " days" : "—";
    return `<div class="stats">${rtile("", "investigations", V.length, "Assigned (total)")}${rtile("s-ok", "investigations", done.length, "Completed")}${rtile("s-inv", "investigations", pend.length, "Pending")}
      ${rtile(V.filter(late).length ? "s-late" : "s-ok", "investigations", V.filter(late).length, "Overdue")}${rtile("", "investigations", avg, "Average duration")}</div>`
      + rtb(["Incident", "Investigator", "Status", "Start", "Target", "End", "Overdue"], V.map(v => [esc(D.M.incidents[v.incident_id]?.incident_no), rwho(D, v.investigator_id), bd(v.status), fmtD(v.start_date), fmtD(v.target_date), fmtD(v.end_date), late(v) ? bd("Overdue", "Overdue") : "—"]));
  },
  action: D => {
    const A2 = D.actions, done = A2.filter(a => DONE_STATUSES.includes(a.status)), late = A2.filter(rlate), pend = A2.filter(a => a.status === "Pending");
    const who = [...new Set(A2.map(a => a.assigned_to))].map(id => {
      const a = A2.filter(x => x.assigned_to === id);
      return [rwho(D, id), a.length, a.filter(x => x.status === "Pending").length, a.filter(x => DONE_STATUSES.includes(x.status)).length, a.filter(rlate).length];
    });
    return `<div class="stats">${rtile("", "actions", A2.length, "Total actions")}${rtile("s-open", "actmon", pend.length, "Pending")}${rtile("s-ok", "actmon", done.length, "Completed")}${rtile(late.length ? "s-late" : "s-ok", "overdue", late.length, "Overdue")}</div>`
      + `<h3>Actions by responsible person</h3>` + rtb(["Person", "Total", "Pending", "Completed", "Overdue"], who);
  },
  resolution: D => {
    const S = D.incidents.filter(rsolved), t = i => i.resolved_date ? rdays(i.date_reported, i.resolved_date) : null;
    const ts = S.map(t).filter(x => x != null), avg = ts.length ? (ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(1) + " days" : "—";
    const ok = ts.filter(x => x <= TARGET_DAYS).length;
    const open = D.incidents.filter(i => !rsolved(i) && rdays(i.date_reported, today()) > TARGET_DAYS);
    return `<div class="stats">${rtile("s-res", "resolutions", S.length, "Total resolved (incl. closed)")}${rtile("", "resolutions", rpct(S.length, D.incidents.length), "Resolution rate")}${rtile("", "resolutions", avg, "Average resolution time")}
      ${rtile("s-ok", "resolutions", ok, `Within ${TARGET_DAYS}-day target`)}${rtile(open.length ? "s-late" : "s-ok", "resolutions", open.length, "Overdue resolutions")}</div>`
      + `<h3>Overdue resolutions (unresolved after ${TARGET_DAYS} days)</h3>` + rtb(["Incident", "Severity", "Status", "Reported", "Age (days)"], open.map(i => [esc(i.incident_no), bd(i.severity), bd(i.status), fmtD(i.date_reported), rdays(i.date_reported, today())]));
  },
  trend: (D, q) => {
    const mode = q.get("p") === "q" ? "q" : "m";
    const key = i => { const d = String(i.incident_date); return mode === "q" ? d.slice(0, 4) + " Q" + Math.ceil(+d.slice(5, 7) / 3) : d.slice(0, 7); };
    const per = [...new Set(D.incidents.map(key))].sort();
    const xt = (title, f) => {
      const cols = rcnt(D.incidents, f).map(c => c[0]);
      return `<h3>${title}</h3>` + rtb(["Period", ...cols.map(esc)], per.map(p => [p, ...cols.map(c => D.incidents.filter(i => key(i) === p && (f(i) || "—") === c).length || "·")]));
    };
    return `<div class="tabs" style="width:fit-content"><a href="#reports?r=trend&p=m" class="${mode === "m" ? "on" : ""}">Monthly</a><a href="#reports?r=trend&p=q" class="${mode === "q" ? "on" : ""}">Quarterly</a></div>`
      + `<h3>Incidents and resolution rate</h3>` + rtb(["Period", "Incidents", "Resolved/Closed", "Resolution rate", ""], per.map(p => {
        const a = D.incidents.filter(i => key(i) === p), r = a.filter(rsolved).length, m = Math.max(...per.map(x => D.incidents.filter(i => key(i) === x).length));
        return [p, a.length, r, rpct(r, a.length), rbar(a.length, m)];
      }))
      + xt("Categories", i => D.M.incident_categories[i.category_id]?.name)
      + xt("Incident types", i => D.M.incident_types[i.type_id]?.name)
      + xt("Severity", i => i.severity)
      + xt("Locations", i => D.M.locations[i.location_id]?.name);
  }
};

const RTABS = [
  ["summary", "Summary"], ["category", "Category"], ["location", "Location"],
  ["investigation", "Investigation"], ["action", "Corrective Actions"],
  ["resolution", "Resolution"], ["trend", "Trends"]
];

export async function reportsPage(q) {
  const r = RP[q.get("r")] ? q.get("r") : "summary", D = await rd();
  app().innerHTML = `<div class="toolbar">
      <div class="tabs" style="margin:0">${RTABS.map(([k, t]) => `<a href="#reports?r=${k}" class="${k === r ? "on" : ""}">${t}</a>`).join("")}</div>
      <div class="btn-row" style="margin:0"><button type="button" class="sec" data-a="printRep">Print / PDF</button></div>
    </div>` + RP[r](D, q);
  state.A.printRep = () => window.print();
}

const rchart = (title, pairs, colors = {}) => {
  const m = Math.max(0, ...pairs.map(p => p[1]));
  return `<div class="card"><h3>${title}</h3>${pairs.slice(0, 8).map(([k, c]) => `<div class="chart-row">
    <span class="chart-label" title="${esc(k)}">${esc(k)}</span>
    <div class="chart-track"><div class="chart-fill" style="width:${m ? c / m * 100 : 0}%;${colors[k] ? `background:${colors[k]}` : ""}"></div></div>
    <span class="chart-val">${c}</span>
  </div>`).join("") || "<p><small>No data yet.</small></p>"}</div>`;
};

const rtrend = list => {
  const p = rcnt(list, i => String(i.incident_date).slice(0, 7)).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(-12);
  const m = Math.max(1, ...p.map(x => x[1]));
  return `<div class="card"><h3>Monthly Incident Trend</h3><div class="trend-bars">${p.map(([k, c]) => `<div class="trend-col">
    <b>${c}</b>
    <div class="trend-bar" style="height:${Math.max(4, Math.round(c / m * 105))}px"></div>
    <span>${esc(k.slice(2))}</span>
  </div>`).join("") || "<p><small>No data yet.</small></p>"}</div></div>`;
};

export async function dashboardPage() {
  const D = await rd(), n = s => D.incidents.filter(i => i.status === s).length;
  const late = D.actions.filter(rlate).length, pend = D.actions.filter(a => !DONE_STATUSES.includes(a.status)).length;

  app().innerHTML = `<div class="stats">${rtile("", "incidents", D.incidents.length, "Total incidents")}${rtile("s-open", "incidents", n("Open"), "Open incidents")}${rtile("s-inv", "investigations", n("Under Investigation"), "Under investigation")}
    ${rtile("s-open", "actmon", pend, "Pending actions")}${rtile("s-res", "closure", n("Resolved"), "Resolved")}${rtile("s-ok", "incidents", n("Closed"), "Closed")}${rtile(late ? "s-late" : "s-ok", "overdue", late, "Overdue actions")}</div>
    <h3>Analytics</h3>
    <div class="chart-grid">
      ${rchart("Incidents by Category", rcnt(D.incidents, i => D.M.incident_categories[i.category_id]?.name))}
      ${rchart("Incidents by Type", rcnt(D.incidents, i => D.M.incident_types[i.type_id]?.name))}
      ${rchart("Incidents by Location", rcnt(D.incidents, i => D.M.locations[i.location_id]?.name))}
      ${rchart("Incidents by Severity", rcnt(D.incidents, i => i.severity), { Critical: "var(--crit)", High: "var(--high)", Medium: "var(--med)", Low: "var(--good)" })}
      ${rtrend(D.incidents)}
      ${rchart("Investigation Status", rcnt(D.investigations, v => v.status), { Completed: "var(--good)", "Findings Prepared": "var(--teal)" })}
      ${rchart("Resolution Status", [["Unresolved", D.incidents.filter(i => !rsolved(i)).length], ["Resolved (awaiting closure)", D.incidents.filter(i => i.status === "Resolved").length], ["Closed", D.incidents.filter(i => i.status === "Closed").length]].filter(p => p[1]), { Unresolved: "var(--high)", "Resolved (awaiting closure)": "var(--teal)", Closed: "var(--good)" })}
    </div>
    <h3>Latest Incidents</h3>
    ${rtb(["Incident", "Date", "Location", "Severity", "Status"], D.incidents.slice(-5).reverse().map(i => [esc(i.incident_no), fmtD(i.incident_date), esc(D.M.locations[i.location_id]?.name), bd(i.severity), bd(i.status)]))}
    <p><a href="#reports">Open full reports →</a></p>`;
}
