import { DB } from "./db.js";
import { PERM } from "./config.js";

export const $ = s => document.querySelector(s);
export const app = () => $("#app");
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const opts = (list, label = "name") => list.map(x => `<option value="${x.id}">${esc(typeof label === "function" ? label(x) : x[label])}</option>`).join("");
export const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
export const val = id => $("#" + id).value.trim();
export const nowISO = () => new Date().toISOString();
export const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

export const fmtD = s => {
  if (!s) return "—";
  const t = String(s);
  if (t.length > 10) {
    const d = new Date(t);
    if (!isNaN(d)) return esc(new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10));
  }
  return esc(t.slice(0, 10));
};

export const bd = (t, k = t) => `<span class="badge ${String(k).replace(/\s/g, "")}">${esc(t)}</span>`;
export const ph = t => `<option value="">${t}</option>`;
export const types3 = a => a.map(t => `<option>${t}</option>`).join("");

export function msg(text, ok = true) {
  const m = $("#msg");
  if (!m) return;
  m.textContent = text;
  m.className = "msg " + (ok ? "ok" : "fail");
  clearTimeout(msg.t);
  msg.t = setTimeout(() => (m.textContent = ""), 6000);
}

// Shared reactive application state
export const state = {
  ME: null,
  ROLES: {},
  A: {},
  S: {},
  CH: {},
  I: null,
  drawNav: () => {},
  route: () => {}
};

export const role = () => state.ROLES[state.ME?.role_id]?.name;
export const can = p => !!state.ME && PERM[p].includes(role());
export const canInv = () => can("inv");

export const audit = async (entity, entity_id, action, details = "", x = {}) => {
  const base = { user_id: state.ME.id, entity, entity_id, action, details, created_at: nowISO() };
  try {
    await DB.add("audit_logs", { ...base, incident_id: x.incident_id ?? null, old_value: x.old ?? null, new_value: x.new ?? null });
  } catch {
    await DB.add("audit_logs", base);
  }
};

export const readFile = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

export async function notesHTML() {
  const ns = (await DB.byIndex("notifications", "user_id", state.ME.id)).reverse();
  if (!ns.length) return "";
  return `<div class="card"><h3>Notifications (${ns.filter(n => !n.is_read).length} unread)</h3>${ns.slice(0, 5).map(n =>
    `<p>${n.is_read ? "" : '<span class="dot"></span>'}${esc(n.message)} <small>${fmtD(n.created_at)}</small> ${n.is_read ? "" : `<button class="sec" data-a="read" data-id="${n.id}">Mark read</button>`}</p>`
  ).join("")}</div>`;
}