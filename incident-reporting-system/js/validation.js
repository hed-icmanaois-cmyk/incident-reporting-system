import {
  SEVERITIES, REPORTER_TYPES, ACTION_TYPES, PRIORITIES,
  RESOLUTION_TYPES, DONE_STATUSES, MAX_FILE_SIZE, FILE_TYPES, PERM, TRANS
} from "./config.js";
import { DB } from "./db.js";
import { app, today, msg, role, audit, state } from "./helpers.js";

export class AppError extends Error {
  constructor(message, kind = "rule") {
    super(message);
    this.name = "AppError";
    this.kind = kind;
  }
}

export const need = (rec, what) => {
  if (!rec) throw new AppError(`${what} not found. It may have been removed. Refresh the page and try again.`, "missing");
  return rec;
};

export const isNetwork = x => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String(x?.message || x));

export function friendly(x) {
  if (!x) return "Something went wrong. Please try again.";
  if (x instanceof AppError) return x.message;
  const m = String(x.message || x), c = String(x.code || ""), raw = m + " " + (x.details || "");
  if (isNetwork(x)) return "Cannot reach the database. Check your internet connection and try again.";
  if (c === "P0001") return m;
  if (c === "PGRST301" || /\bjwt\b|session (has )?expired|not authenticated/i.test(m)) return "Your session has expired. Please sign in again.";
  if (c === "42501" || /row-level security|permission denied/i.test(m)) return "You are not authorized to do that.";
  if (c === "23505" || x.name === "ConstraintError") return /incident_no/.test(raw) ? "That incident number already exists." : /reporter_no/.test(raw) ? "That Employee/Student ID already exists." : "That record already exists (duplicate value).";
  if (c === "23503" || x.name === "ForeignKeyError") return "This record refers to something that no longer exists, or it is still used by other records.";
  if (c === "23502") { const col = (m.match(/column "([^"]+)"/) || [])[1]; return "Required information is missing" + (col ? ": " + col.replace(/_/g, " ") : "") + "."; }
  if (c === "23514") return "A value is outside what the system allows. Check the form and try again.";
  if (c === "22007" || c === "22008" || /invalid input syntax for type (date|timestamp)|date\/time field value out of range/i.test(m)) return "That date is not valid. Use a real calendar date.";
  if (c === "22P02") return "One of the values has an invalid format.";
  if (c === "PGRST116") return "The record could not be found.";
  if (/timeout|timed out|\b50[0-4]\b/i.test(m) || /^(08|53|57)/.test(c)) return "The database is busy or unavailable. Please try again in a moment.";
  return "Unexpected error: " + m;
}

export const loginError = e => isNetwork(e) ? friendly(e)
  : (e.status === 429 || /rate limit|too many/i.test(e.message || "")) ? "Too many sign-in attempts. Wait a few minutes and try again."
  : e.status >= 500 ? "The sign-in service is unavailable. Please try again shortly."
  : /not confirmed/i.test(e.message || "") ? "This account has not been activated yet. Contact the administrator."
  : "Invalid username or password.";

export const V = {
  chk() { const e = []; e.bad = (id, m) => { e.push({ id, m }); return e; }; return e; },
  isDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; },
  isTime: s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s || ""),
  req(e, id, v, label) { if (v == null || String(v).trim() === "") { e.bad(id, `${label} is required`); return false; } return true; },
  len(e, id, v, label, min, max) { const n = String(v ?? "").trim().length; if (n && n < min) e.bad(id, `${label} must be at least ${min} characters`); if (n > max) e.bad(id, `${label} must be ${max} characters or fewer`); },
  oneOf(e, id, v, list, label) { if (!list.includes(v)) e.bad(id, `${label} must be one of: ${list.join(", ")}`); },
  date(e, id, v, label, { min = "2000-01-01", noFuture = false } = {}) {
    if (!V.req(e, id, v, label)) return false;
    if (!V.isDate(v)) { e.bad(id, `${label} is not a valid date (use YYYY-MM-DD)`); return false; }
    if (v < min) { e.bad(id, `${label} cannot be before ${min}`); return false; }
    if (noFuture && v > today()) { e.bad(id, `${label} cannot be in the future`); return false; }
    return true;
  },
  file(e, id, f, required = true, label = "File") {
    if (!f) { if (required) e.bad(id, `Choose a ${label.toLowerCase()} to upload`); return; }
    const ext = f.name.includes(".") ? f.name.split(".").pop().toLowerCase() : "";
    if (!FILE_TYPES[ext]) return e.bad(id, `${label} type ".${ext || "?"}" is not allowed. Allowed: ${Object.keys(FILE_TYPES).join(", ")}`);
    if (f.name.length > 150) return e.bad(id, `${label} name is too long (max 150 characters)`);
    if (f.size === 0) return e.bad(id, `${label} is empty`);
    if (f.size > MAX_FILE_SIZE) return e.bad(id, `${label} is too large (${(f.size / 1048576).toFixed(1)} MB; max 2 MB)`);
    if (f.type && !FILE_TYPES[ext].includes(f.type)) e.bad(id, `${label} content (${f.type}) does not match its .${ext} extension`);
  },
  show(e) {
    app().querySelectorAll(".invalid").forEach(x => { x.classList.remove("invalid"); x.removeAttribute("aria-invalid"); });
    if (!e.length) return false;
    e.forEach(x => { const el = document.getElementById(x.id); if (el) { el.classList.add("invalid"); el.setAttribute("aria-invalid", "true"); } });
    document.getElementById(e[0].id)?.focus();
    msg(e.map(x => x.m.replace(/\.?$/, ".")).join(" "), false);
    return true;
  },

  login(u, p) {
    const e = V.chk();
    if (V.req(e, "l_user", u, "Username") && !/^[A-Za-z0-9._-]{3,30}$/.test(u.trim())) e.bad("l_user", "Username must be 3-30 characters (letters, numbers, . _ -)");
    V.req(e, "l_pass", p, "Password");
    return e;
  },
  reporter(r) {
    const e = V.chk();
    if (V.req(e, "reporter_no", r.reporter_no, "Employee/Student ID") && !/^[A-Za-z0-9][A-Za-z0-9\-_/]{2,19}$/.test(r.reporter_no)) e.bad("reporter_no", "ID must be 3-20 characters (letters, numbers, - _ /)");
    if (V.req(e, "full_name", r.full_name, "Full name")) {
      if (r.full_name.length < 2 || r.full_name.length > 100) e.bad("full_name", "Full name must be 2-100 characters");
      else if (!/^[\p{L}][\p{L}\s.,'’-]*$/u.test(r.full_name)) e.bad("full_name", "Full name may only contain letters, spaces and . , ' -");
    }
    if (!Number(r.department_id)) e.bad("department_id", "Department is required");
    if (V.req(e, "reporter_type", r.reporter_type, "Reporter type")) V.oneOf(e, "reporter_type", r.reporter_type, REPORTER_TYPES, "Reporter type");
    if (r.status) V.oneOf(e, "status", r.status, ["Active", "Inactive"], "Status");
    if (r.email && (r.email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))) e.bad("email", "Email is invalid");
    if (r.contact) { const digits = r.contact.replace(/\D/g, "").length; if (!/^\+?[0-9\s\-()]+$/.test(r.contact) || digits < 7 || digits > 15) e.bad("contact", "Contact number must have 7-15 digits"); }
    V.len(e, "position", r.position, "Position", 0, 60);
    V.len(e, "address", r.address, "Address", 0, 200);
    return e;
  },
  incident(i) {
    const e = V.chk();
    V.req(e, "reporter_id", i.reporter_id, "Reporter");
    V.req(e, "category_id", i.category_id, "Incident category");
    V.req(e, "type_id", i.type_id, "Incident type");
    V.req(e, "location_id", i.location_id, "Location");
    V.date(e, "incident_date", i.incident_date, "Incident date", { noFuture: true });
    if (V.req(e, "incident_time", i.incident_time, "Incident time")) {
      if (!V.isTime(i.incident_time)) e.bad("incident_time", "Incident time is not valid");
      else if (V.isDate(i.incident_date) && new Date(`${i.incident_date}T${i.incident_time}`) > new Date()) e.bad("incident_time", "Incident date/time cannot be in the future");
    }
    if (V.req(e, "description", i.description, "Description")) V.len(e, "description", i.description, "Description", 10, 2000);
    if (V.req(e, "severity", i.severity, "Severity")) V.oneOf(e, "severity", i.severity, SEVERITIES, "Severity");
    V.len(e, "immediate_response", i.immediate_response, "Immediate response", 0, 1000);
    return e;
  },
  location(l) {
    const e = V.chk();
    if (V.req(e, "building", l.building, "Building")) V.len(e, "building", l.building, "Building", 2, 100);
    V.len(e, "floor", l.floor, "Floor", 0, 20);
    V.len(e, "room", l.room, "Room/Office", 0, 60);
    V.len(e, "area", l.area, "Area", 0, 60);
    V.len(e, "description", l.description, "Location description", 0, 300);
    if (l.status) V.oneOf(e, "status", l.status, ["Active", "Inactive"], "Status");
    return e;
  },
  investigation(v, inc) {
    const e = V.chk();
    V.req(e, "n_inc", v.incident_id, "Incident");
    V.req(e, "n_inv", v.investigator_id, "Investigator");
    const s = V.date(e, "n_start", v.start_date, "Start date");
    const t = V.date(e, "n_target", v.target_date, "Target completion date");
    if (s && t && BR.deadline(v.start_date, v.target_date)) e.bad("n_target", "Target date cannot be before the start date");
    if (s && inc && v.start_date < inc.incident_date) e.bad("n_start", "Investigation cannot start before the incident date");
    V.len(e, "n_instr", v.instructions, "Instructions", 0, 1000);
    V.len(e, "n_notes", v.notes, "Notes", 0, 1000);
    return e;
  },
  finding(f) {
    const e = V.chk();
    if (V.req(e, "f_finding", f.finding, "Findings text")) V.len(e, "f_finding", f.finding, "Findings text", 5, 2000);
    [["f_root", f.root_cause, "Root cause"], ["f_contrib", f.contributing_factors, "Contributing factors"], ["f_wit", f.witnesses, "Witnesses"],
      ["f_evid", f.evidence_summary, "Evidence summary"], ["f_rec", f.recommendation, "Recommendation"]].forEach(([id, v, l]) => V.len(e, id, v, l, 0, 1000));
    return e;
  },
  rca(r) {
    const e = V.chk();
    V.req(e, "r_problem", r.problem, "Problem");
    V.req(e, "r_root", r.root, "Root cause");
    [["r_problem", r.problem, "Problem"], ["r_root", r.root, "Root cause"], ["r_immediate", r.immediate, "Immediate cause"], ["r_cause", r.cause, "Cause"],
      ["r_evidence", r.evidence, "Supporting evidence"], ["r_contrib", r.contrib, "Contributing factors"], ["r_prevent", r.prevent, "Preventive measures"]].forEach(([id, v, l]) => V.len(e, id, v, l, 0, 1000));
    return e;
  },
  action(a, inv) {
    const e = V.chk();
    V.req(e, "a_inv", a.investigation_id, "Investigation");
    if (V.req(e, "a_type", a.action_type, "Action type")) V.oneOf(e, "a_type", a.action_type, ACTION_TYPES, "Action type");
    V.req(e, "a_who", a.assigned_to, "Responsible person");
    if (V.req(e, "a_desc", a.description, "Action description")) V.len(e, "a_desc", a.description, "Action description", 5, 1000);
    if (V.req(e, "a_req", a.requirements, "Action requirements")) V.len(e, "a_req", a.requirements, "Action requirements", 5, 1000);
    if (V.req(e, "a_pri", a.priority, "Priority")) V.oneOf(e, "a_pri", a.priority, PRIORITIES, "Priority");
    if (V.date(e, "a_due", a.due_date, "Target date")) {
      if (a.due_date < today()) e.bad("a_due", "Target date cannot be in the past");
      else if (inv?.start_date && a.due_date < inv.start_date) e.bad("a_due", "Target date cannot precede the investigation start date");
    }
    return e;
  },
  resolution(r, inc, file) {
    const e = V.chk();
    V.req(e, "r_inc", r.incident_id, "Incident");
    if (V.req(e, "r_type", r.type, "Resolution type")) V.oneOf(e, "r_type", r.type, RESOLUTION_TYPES, "Resolution type");
    if (V.req(e, "r_desc", r.description, "Resolution description")) V.len(e, "r_desc", r.description, "Resolution description", 10, 2000);
    if (V.date(e, "r_date", r.resolution_date, "Resolution date", { noFuture: true }) && inc && r.resolution_date < inc.incident_date) e.bad("r_date", "Resolution date cannot precede the incident date");
    V.len(e, "r_rem", r.remarks, "Remarks", 0, 1000);
    V.file(e, "r_file", file, false, "Supporting document");
    return e;
  }
};

export const BR = {
  reporter: (r, active = false) => !r ? "An incident must have a reporter." : active && r.status !== "Active" ? `Reporter ${r.full_name} is inactive. Reactivate the reporter first.` : null,
  location: (l, active = false) => !l ? "An incident must have a valid location." : active && l.status !== "Active" ? `Location "${l.name}" is inactive.` : null,
  typeInCategory: (t, catId) => !t || Number(t.category_id) !== Number(catId) ? "The incident type must belong to the selected category." : t.active === false ? `Incident type "${t.name}" is inactive.` : null,
  uniqueNo: (no, list) => list.some(i => i.incident_no === no) ? `Incident number ${no} already exists.` : null,
  investigable(inc, hasInv, rep, loc) {
    if (!inc) return ["Incident not found."];
    const m = [];
    if (inc.status !== "Open") m.push("Only reported (Open) incidents can be investigated");
    if (hasInv) m.push("That incident already has an investigation");
    if (!rep) m.push("The incident has no valid reporter");
    if (!loc) m.push("The incident has no valid location");
    return m;
  },
  findingsComplete: (inv, finds) => !inv ? "Incident must have an investigation" : inv.status !== "Completed" ? "Investigation must be completed" : !finds.length ? "Investigation findings must be recorded before resolution" : null,
  actionsComplete: acts => !acts.length ? "At least one corrective action must exist" : !acts.every(a => DONE_STATUSES.includes(a.status)) ? "All required corrective actions must be completed" : null,
  editable: (inc, r = role()) => inc?.status === "Closed" && !PERM.admin.includes(r) ? "This incident is closed. Only an administrator can edit a closed incident." : null,
  transition(from, to, r = role()) {
    const p = TRANS[from]?.[to];
    if (!p) return `Invalid status change: ${from} → ${to}.`;
    return PERM[p].includes(r) ? null : `Your role (${r}) is not allowed to change an incident from ${from} to ${to}.`;
  },
  deadline: (start, target) => start && target && target < start ? "Investigation deadline cannot precede the start date." : null
};

export async function moveIncident(i, to, extra = {}) {
  const e = BR.transition(i.status, to);
  if (e) throw new AppError(e, "transition");
  const was = i.status;
  Object.assign(i, extra, { status: to });
  await DB.put("incidents", i);
  return was;
}

export async function guardIncident(incId) {
  const inc = need(await DB.get("incidents", incId), "Incident");
  const e = BR.editable(inc);
  if (e) throw new AppError(e, "closed");
  return inc;
}

export async function guardInv(id) {
  const v = need(await DB.get("investigations", id), "Investigation");
  return { v, inc: await guardIncident(v.incident_id) };
}

export function denied(what) {
  msg(`You are not authorized to ${what}. The attempt was recorded.`, false);
  if (state.ME) audit("security", state.ME.id, "denied", what).catch(() => {});
}