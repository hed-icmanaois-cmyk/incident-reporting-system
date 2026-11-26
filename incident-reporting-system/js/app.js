import { DB, loadMe } from "./db.js";
import { $, app, byId, esc, state } from "./helpers.js";
import { friendly } from "./validation.js";
import { lock, route } from "./router.js";

const SUN_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>`;
const MOON_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function syncTheme() {
  const dark = document.documentElement.dataset.theme === "dark";
  const btn = $("#theme-toggle");
  if (btn) {
    btn.innerHTML = dark ? SUN_ICON : MOON_ICON;
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
    btn.title = dark ? "Switch to light mode" : "Switch to dark mode";
  }
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0B1120" : "#0F172A");
}

$("#theme-toggle")?.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("irs-theme", next);
  syncTheme();
});

syncTheme();

(async function boot() {
  try {
    await DB.open();
    state.ME = await loadMe();
    state.ROLES = state.ME ? byId(await DB.all("roles")) : {};
    new MutationObserver(lock).observe(app(), { childList: true, subtree: true });
    route();
  } catch (x) {
    app().innerHTML = `<p class="card fail">${esc(friendly(x))}</p>`;
  }
})();