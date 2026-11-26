import { sb, DB } from "./db.js";
import { $, app, esc, msg, role, can, state } from "./helpers.js";
import { need, friendly, denied } from "./validation.js";

import { loginPage, accountPage } from "./pages/auth.js";
import { homePage } from "./pages/home.js";
import { reportersPage, profilePage } from "./pages/reporters.js";
import { categoriesPage, locationsPage, locmonPage } from "./pages/masters.js";
import { reportPage, incidentsPage } from "./pages/incidents.js";
import { investigationsPage } from "./pages/investigations.js";
import { actionsPage, actmonPage, overduePage } from "./pages/actions.js";
import { resolutionsPage, closurePage } from "./pages/resolutions.js";
import { workflowPage } from "./pages/workflow.js";
import { auditPage, reportsPage, dashboardPage } from "./pages/reports.js";
import { usersPage } from "./pages/users.js";
import { backupPage } from "./pages/backup.js";

const PAGES = {
  home: homePage,
  reporters: reportersPage,
  profile: profilePage,
  categories: categoriesPage,
  locations: locationsPage,
  report: reportPage,
  incidents: incidentsPage,
  locmon: locmonPage,
  investigations: investigationsPage,
  actions: actionsPage,
  actmon: actmonPage,
  overdue: overduePage,
  resolutions: resolutionsPage,
  closure: closurePage,
  workflow: workflowPage,
  audit: auditPage,
  reports: reportsPage,
  dashboard: dashboardPage,
  users: usersPage,
  backup: backupPage,
  account: accountPage,
  login: loginPage
};

const TITLES = {
  home: "Overview",
  reporters: "Reporter Management",
  profile: "Reporter Profile",
  categories: "Categories & Types",
  locations: "Location Management",
  report: "Report Incident",
  incidents: "Incident Monitoring",
  locmon: "Location Monitoring",
  investigations: "Investigations",
  actions: "Action Assignment",
  actmon: "Action Monitoring",
  overdue: "Overdue Actions",
  resolutions: "Incident Resolution",
  closure: "Incident Closure",
  workflow: "Incident Lifecycle Trace",
  audit: "Audit Trail",
  reports: "Reports",
  dashboard: "Management Dashboard",
  users: "User Management",
  backup: "Backup & Recovery",
  account: "My Account",
  login: "Incident Reporting System"
};

const NAV_GROUPS = [
  {
    label: "Overview",
    links: [
      ["home", "Home"],
      ["dashboard", "Dashboard"]
    ]
  },
  {
    label: "Incident Workflow",
    links: [
      ["report", "Report Incident"],
      ["incidents", "Incidents"],
      ["investigations", "Investigations"],
      ["actions", "Actions"],
      ["actmon", "Action Monitoring"],
      ["overdue", "Overdue"],
      ["resolutions", "Resolution"],
      ["closure", "Closure"],
      ["workflow", "Incident Trace"]
    ]
  },
  {
    label: "Directory & Setup",
    links: [
      ["reporters", "Reporters"],
      ["categories", "Categories & Types"],
      ["locations", "Locations"],
      ["locmon", "Location Monitoring"]
    ]
  },
  {
    label: "Governance",
    links: [
      ["reports", "Reports"],
      ["audit", "Audit Trail"],
      ["users", "User Management", "admin"],
      ["backup", "Backup & Recovery", "admin"]
    ]
  }
];

const GUARD_FORMS = {
  rform: "reg", cform: "reg", tform: "reg", lform: "reg",
  iform: "report",
  nform: "inv", fform: "inv", eform: "inv", rcaform: "inv", aform: "inv", resform: "inv",
  closeform: "close",
  uform: "admin"
};

const GUARD_ACTIONS = {
  edit: "reg", tog: "reg", editC: "reg", editT: "reg", toggle: "reg",
  adv: "inv",
  editU: "admin", togU: "admin", resetU: "admin", exportBackup: "admin", restoreBackup: "admin"
};

const GLOBAL_ACTIONS = {
  read: async id => {
    const n = need(await DB.get("notifications", id), "Notification");
    if (n.user_id !== state.ME.id) return;
    n.is_read = true;
    await DB.put("notifications", n);
    route();
  }
};

const run = fn => Promise.resolve().then(fn).catch(x => {
  console.error(x);
  msg(friendly(x), false);
});

export function closeNav() {
  document.body.classList.remove("nav-open");
  $("#menu-btn")?.setAttribute("aria-expanded", "false");
}

export function lock() {
  if (!state.ME) return;
  app().querySelectorAll("form").forEach(f => {
    const p = GUARD_FORMS[f.id];
    if (p && !can(p)) f.outerHTML = `<p class="card">Read-only: your role (${esc(role())}) cannot use this form.</p>`;
  });
  app().querySelectorAll("[data-a]").forEach(b => {
    const p = GUARD_ACTIONS[b.dataset.a];
    if (p && !can(p)) b.remove();
  });
}

export async function drawNav() {
  const nav = $("#nav");
  if (!state.ME) {
    nav.innerHTML = "";
    closeNav();
    return;
  }
  const unread = (await DB.byIndex("notifications", "user_id", state.ME.id)).filter(n => !n.is_read).length;
  const cur = (location.hash.slice(1) || "home").split("?")[0];

  nav.innerHTML =
    `<div class="nav-brand"><span class="nav-brand-dot"></span>Incident Reporting</div>` +
    NAV_GROUPS.map(g => {
      const visible = g.links.filter(([, , perm]) => !perm || can(perm));
      if (!visible.length) return "";
      return `<div class="nav-group">${esc(g.label)}</div>` +
        visible.map(([h, t]) =>
          `<a href="#${h}"${h === cur ? ' class="on" aria-current="page"' : ""}>${esc(t)}</a>`
        ).join("");
    }).join("") +
    `<div class="nav-footer">
      ${unread ? `<a href="#home" class="alert">${unread} unread notification${unread === 1 ? "" : "s"}</a>` : ""}
      <a href="#account" class="me"><b>${esc(state.ME.full_name)}</b><small>${esc(role())}</small></a>
      <a href="#" data-logout>Sign out</a>
    </div>`;
}

export async function route() {
  closeNav();
  const [n0, qs] = (location.hash.slice(1) || "home").split("?");
  const name = !state.ME ? "login" : (PAGES[n0] && n0 !== "login" ? n0 : "home");
  state.A = {};
  state.S = {};
  state.CH = {};
  state.I = null;
  $("#title").textContent = TITLES[name] || TITLES.home;
  document.title = `${TITLES[name] || TITLES.home} | Incident Reporting System`;
  app().innerHTML = `<div class="loading-state">Loading…</div>`;
  try {
    await Promise.all([
      drawNav(),
      PAGES[name](new URLSearchParams(qs || ""))
    ]);
  } catch (x) {
    console.error(x);
    app().innerHTML = `<p class="card fail">${esc(friendly(x))}</p>`;
  }
}

state.drawNav = drawNav;
state.route = route;

app().onclick = e => {
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const k = b.dataset.a, p = GUARD_ACTIONS[k];
  if (p && !can(p)) return denied(`perform action "${k}"`);
  run(() => (state.A[k] || GLOBAL_ACTIONS[k])?.(b.dataset.id, b));
};

app().onsubmit = e => {
  e.preventDefault();
  const id = e.target.id, p = GUARD_FORMS[id];
  if (p && !can(p)) return denied(`submit form "${id}"`);
  run(() => state.S[id]?.(e.target));
};

app().oninput = e => {
  if (e.target.closest(".flt")) run(() => state.I?.(e));
};

app().onchange = e => run(() => (state.CH[e.target.id] || state.CH[e.target.dataset.c])?.(e));

$("#nav").onclick = e => {
  if (e.target.dataset.logout !== undefined) {
    e.preventDefault();
    sb.auth.signOut().finally(() => {
      DB.invalidate();
      state.ME = null;
      if (location.hash === "#login") route();
      else location.hash = "#login";
    });
    return;
  }
  if (e.target.closest("a")) closeNav();
};

$("#menu-btn")?.addEventListener("click", () => {
  const open = document.body.classList.toggle("nav-open");
  $("#menu-btn")?.setAttribute("aria-expanded", String(open));
});

$("#nav-backdrop")?.addEventListener("click", closeNav);
window.addEventListener("keydown", e => { if (e.key === "Escape") closeNav(); });
window.onhashchange = route;
