import { DONE_STATUSES } from "../config.js";
import { DB } from "../db.js";
import { $, app, esc, today, notesHTML, can, state } from "../helpers.js";

export async function homePage() {
  const [inc, inv, act, notes] = await Promise.all([
    DB.all("incidents"),
    DB.all("investigations"),
    DB.all("actions"),
    notesHTML()
  ]);

  const n = st => inc.filter(i => i.status === st).length;
  const late = act.filter(a => a.due_date < today() && !DONE_STATUSES.includes(a.status)).length;
  const tile = (cls, href, num, label) => `<a class="stat ${cls}" href="#${href}"><b>${num}</b><span>${label}</span></a>`;

  app().innerHTML = `<p class="lead">Welcome back, ${esc(state.ME.full_name)}.</p>
    ${notes}
    <div class="stats">
      ${tile("s-open", "incidents", n("Open"), "Open incidents")}
      ${tile("s-inv", "investigations", n("Under Investigation"), "Under investigation")}
      ${tile("s-res", "closure", n("Resolved"), "Resolved, awaiting closure")}
      ${tile(late ? "s-late" : "s-ok", "overdue", late, "Overdue actions")}
      ${tile("", "incidents", inc.length, "Total incidents")}
    </div>
    <div class="card health">
      <div class="health-row">
        <div>
          <h3>System Status</h3>
          <p>Database: <strong class="ok">Connected</strong></p>
          <p>Investigations: <strong>${inv.length}</strong> &middot; Actions: <strong>${act.length}</strong></p>
          <p id="rel-status">Record links: <small>Not checked yet</small></p>
        </div>
        <div class="btn-row" style="margin:0"><button type="button" class="sec" data-a="checkRel">Run Integrity Check</button>${can("admin") ? `<a href="#backup" class="sec" style="padding:0.3rem 0.65rem;border:1px solid var(--line-strong);border-radius:var(--radius-sm);font-size:0.78rem;background:var(--surface-alt);color:var(--text-soft)">Backup &amp; Recovery</a>` : ""}</div>
      </div>
    </div>`;

  state.A.checkRel = async () => {
    const el = $("#rel-status");
    el.innerHTML = `Record links: <small>Checking…</small>`;
    const bad = await DB.testRelations();
    el.innerHTML = `Record links: <strong class="${bad.length ? "fail" : "ok"}">${bad.length ? "Broken: " + esc(bad.join(", ")) : "All references valid"}</strong>`;
  };
}