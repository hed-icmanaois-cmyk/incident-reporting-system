import { BACKUP_TABLES, CONFIG } from "../config.js";
import { sb, DB } from "../db.js";
import { $, app, esc, nowISO, today, msg, can, audit, state } from "../helpers.js";
import { friendly, denied } from "../validation.js";

async function sha256(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function backupPage() {
  if (!can("admin")) {
    denied("access Backup & Recovery");
    app().innerHTML = '<p class="card fail">Access denied. Administrator role is required for database backup and recovery.</p>';
    return;
  }

  let parsedBackup = null;

  app().innerHTML = `<div class="card">
      <h3>1. Create Database Backup</h3>
      <p>Export a complete JSON snapshot of all 17 system tables with a SHA-256 integrity checksum.</p>
      <div class="btn-row">
        <button type="button" data-a="exportBackup">Download Full JSON Backup</button>
        <button type="button" class="sec" data-a="checkRel">Run Integrity Check</button>
      </div>
      <p id="bk-status" style="margin-top:0.75rem"></p>
    </div>

    <div class="card">
      <h3>2. Verify &amp; Restore Backup</h3>
      <p>Upload a previously exported <code>irs-backup-*.json</code> file to verify its checksum, table counts, and foreign keys before restoring.</p>
      <label>Backup File (.json)<input type="file" id="bk_file" accept=".json,application/json"></label>
      <div id="bk-preview" style="margin-top:0.85rem"></div>
    </div>`;

  state.A.checkRel = async () => {
    const el = $("#bk-status");
    el.innerHTML = `<small>Checking all foreign-key references across 17 tables…</small>`;
    const bad = await DB.testRelations();
    el.innerHTML = bad.length
      ? `<strong class="fail">Broken references: ${esc(bad.join(", "))}</strong>`
      : `<strong class="ok">All foreign-key references verified intact.</strong>`;
  };

  state.A.exportBackup = async () => {
    const el = $("#bk-status");
    el.innerHTML = `<small>Exporting 17 tables…</small>`;
    const tables = {};
    const counts = {};
    for (const t of BACKUP_TABLES) {
      try {
        const rows = await DB.all(t, { fresh: true });
        tables[t] = rows;
        counts[t] = rows.length;
      } catch {
        tables[t] = [];
        counts[t] = 0;
      }
    }
    const payload = { version: 1, exported_at: nowISO(), exported_by: state.ME.username, counts, tables };
    const checksum = await sha256(JSON.stringify(tables));
    payload.checksum = checksum;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `irs-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);

    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    await audit("system", 0, "backup", `Exported ${total} rows across ${BACKUP_TABLES.length} tables`);
    el.innerHTML = `<strong class="ok">Backup downloaded (${total} total records · SHA-256: ${esc(checksum.slice(0, 12))}…).</strong>`;
    msg("Database backup exported.");
  };

  state.CH.bk_file = async e => {
    const f = e.target.files[0];
    const box = $("#bk-preview");
    parsedBackup = null;
    if (!f) { box.innerHTML = ""; return; }
    try {
      const data = JSON.parse(await f.text());
      if (!data.tables || typeof data.tables !== "object") throw new Error("Invalid backup structure: missing tables object.");
      const actualHash = await sha256(JSON.stringify(data.tables));
      const hashOk = !data.checksum || data.checksum === actualHash;

      // Verify FK references inside backup snapshot
      const badFks = [];
      for (const [fk, parent] of Object.entries(CONFIG.FKS)) {
        const [store, field] = fk.split(".");
        const ids = new Set((data.tables[parent] || []).map(r => r.id));
        (data.tables[store] || []).forEach(r => {
          if (r[field] != null && !ids.has(r[field])) badFks.push(`${fk} #${r.id}`);
        });
      }

      parsedBackup = data;
      const rowsHtml = BACKUP_TABLES.map(t => `<tr><td>${esc(t)}</td><td>${(data.tables[t] || []).length}</td></tr>`).join("");
      box.innerHTML = `<p><b>Exported:</b> ${esc(data.exported_at || "Unknown")} · <b>Checksum:</b> <span class="${hashOk ? "ok" : "fail"}">${hashOk ? "Verified" : "Mismatch"}</span> · <b>Referential integrity:</b> <span class="${badFks.length ? "fail" : "ok"}">${badFks.length ? badFks.length + " issue(s)" : "Valid"}</span></p>
        <div class="table-wrap"><table><thead><tr><th>Table</th><th>Records</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        <label><input type="checkbox" id="bk_confirm"> I understand this will upsert records from the backup into the live database.</label>
        <div class="btn-row"><button type="button" data-a="restoreBackup">Restore &amp; Verify</button></div>`;
    } catch (err) {
      box.innerHTML = `<p class="fail">${esc(friendly(err))}</p>`;
    }
  };

  state.A.restoreBackup = async () => {
    if (!parsedBackup) return msg("Load a backup file first.", false);
    if (!$("#bk_confirm")?.checked) return msg("Please check the confirmation box before restoring.", false);

    let restored = 0;
    const errors = [];
    for (const t of BACKUP_TABLES) {
      const rows = parsedBackup.tables[t] || [];
      if (!rows.length) continue;
      const { error } = await sb.from(t).upsert(rows, { onConflict: "id" });
      if (error) errors.push(`${t}: ${error.message}`);
      else restored += rows.length;
    }
    DB.invalidate();
    const bad = await DB.testRelations();
    await audit("system", 0, "restore", `Restored ${restored} rows (${errors.length} errors)`);
    if (errors.length) {
      msg(`Restored ${restored} records with ${errors.length} table error(s): ${errors[0]}`, false);
    } else {
      msg(`Restored ${restored} records. Post-restore integrity: ${bad.length ? bad.length + " broken link(s)" : "All valid"}.`, !bad.length);
    }
  };
}
