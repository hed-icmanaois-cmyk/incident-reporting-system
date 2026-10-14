const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const opts = (list, label = "name") => list.map(x => `<option value="${x.id}">${esc(x[label])}</option>`).join("");
const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
function msg(text, ok = true) {
  const m = $("#msg"); if (!m) return;
  m.textContent = text; m.className = "msg " + (ok ? "ok" : "fail");
  clearTimeout(msg.t); msg.t = setTimeout(() => (m.textContent = ""), 5000);
}
document.querySelector("header").insertAdjacentHTML("afterend",
  `<nav><a href="index.html">Home</a><a href="reporters.html">Reporters</a><a href="categories.html">Categories &amp; Types</a><a href="incident-new.html">Report Incident</a><a href="incidents.html">Incidents</a></nav>`);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
