import { toEmail } from "../config.js";
import { sb, DB } from "../db.js";
import { $, app, esc, opts, byId, val, bd, ph, msg, can, audit, state } from "../helpers.js";
import { need, V, friendly, denied } from "../validation.js";

export async function usersPage() {
  if (!can("admin")) {
    denied("access User Management");
    app().innerHTML = '<p class="card fail">Access denied. Administrator role is required to manage users.</p>';
    return;
  }

  const [roles, depts] = await Promise.all([DB.all("roles"), DB.all("departments")]);
  const rn = byId(roles), dn = byId(depts);
  let editing = null;

  app().innerHTML = `<form id="uform"><h3 id="utitle">Edit User Account</h3>
    <p><small>Select a user below to edit their role, department, email, or active status. Account deactivation immediately blocks sign-in.</small></p>
    <div class="grid">
      <label>Username<input id="u_username" disabled placeholder="Select a user below"></label>
      <label>Full Name *<input id="u_name"></label>
      <label>Email<input id="u_email" type="email"></label>
      <label>Role *<select id="u_role">${ph("-- Select role --")}${opts(roles)}</select></label>
      <label>Department<select id="u_dept">${ph("-- None --")}${opts(depts)}</select></label>
      <label>Status<select id="u_active"><option value="1">Active</option><option value="0">Inactive</option></select></label>
    </div>
    <div class="btn-row">
      <button type="submit">Save Changes</button>
      <button type="button" class="sec" data-a="clearU">Clear</button>
    </div>
  </form>

  <div class="card grid flt">
    <label>Search name or username<input id="uq" placeholder="Filter users…"></label>
    <label>Role<select id="uf_role">${ph("All roles")}${opts(roles)}</select></label>
    <label>Status<select id="uf_st">${ph("All")}<option value="1">Active</option><option value="0">Inactive</option></select></label>
  </div>

  <div class="table-wrap">
    <table>
      <thead><tr><th>Username</th><th>Full Name</th><th>Role</th><th>Department</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody id="urows"></tbody>
    </table>
  </div>`;

  const render = async () => {
    const q = val("uq").toLowerCase(), rf = $("#uf_role").value, sf = $("#uf_st").value;
    const users = (await DB.all("users")).filter(u =>
      (u.full_name + " " + u.username + " " + (u.email || "")).toLowerCase().includes(q) &&
      (!rf || u.role_id == rf) &&
      (!sf || String(u.active ? 1 : 0) === sf)
    );
    $("#urows").innerHTML = users.map(u => `<tr>
      <td>${esc(u.username)}</td>
      <td>${esc(u.full_name)}${u.id === state.ME.id ? " <small>(you)</small>" : ""}</td>
      <td>${esc(rn[u.role_id]?.name || "—")}</td>
      <td>${esc(dn[u.department_id]?.name || "—")}</td>
      <td>${esc(u.email || toEmail(u.username))}</td>
      <td>${bd(u.active ? "Active" : "Inactive")}</td>
      <td>
        <button class="sec" data-a="editU" data-id="${u.id}">Edit</button>
        ${u.id !== state.ME.id ? `<button class="sec" data-a="togU" data-id="${u.id}">${u.active ? "Deactivate" : "Activate"}</button>` : ""}
        <button class="sec" data-a="resetU" data-id="${u.id}">Reset PW</button>
      </td>
    </tr>`).join("") || '<tr><td colspan="7">No users found.</td></tr>';
  };

  const clear = () => {
    editing = null;
    $("#uform").reset();
    $("#u_username").value = "";
    $("#utitle").textContent = "Edit User Account";
  };

  state.I = render;
  state.A.clearU = clear;

  state.A.editU = async id => {
    const u = need(await DB.get("users", id), "User");
    editing = u.id;
    $("#u_username").value = u.username;
    $("#u_name").value = u.full_name || "";
    $("#u_email").value = u.email || "";
    $("#u_role").value = u.role_id || "";
    $("#u_dept").value = u.department_id || "";
    $("#u_active").value = u.active ? "1" : "0";
    $("#utitle").textContent = `Edit User — ${u.username}`;
    scrollTo(0, 0);
  };

  state.A.togU = async id => {
    const u = need(await DB.get("users", id), "User");
    if (u.id === state.ME.id) return msg("You cannot deactivate your own account.", false);
    const oldSt = u.active ? "Active" : "Inactive";
    u.active = !u.active;
    const newSt = u.active ? "Active" : "Inactive";
    await DB.put("users", u);
    await audit("users", u.id, "user_update", `${u.username} ${newSt}`, { old: oldSt, new: newSt });
    msg(`${u.full_name} is now ${newSt}.`);
    render();
  };

  state.A.resetU = async id => {
    const u = need(await DB.get("users", id), "User");
    const email = u.email || toEmail(u.username);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return msg(friendly(error), false);
    await audit("users", u.id, "password_reset", email);
    msg(`Password reset email sent to ${email}.`);
  };

  state.S.uform = async () => {
    if (!editing) return msg("Click Edit on a user in the table first.", false);
    const u = need(await DB.get("users", editing), "User");
    const name = val("u_name"), email = val("u_email"), roleId = Number($("#u_role").value), deptId = $("#u_dept").value ? Number($("#u_dept").value) : null;
    const active = $("#u_active").value === "1";
    const e = V.chk();
    if (V.req(e, "u_name", name, "Full name")) V.len(e, "u_name", name, "Full name", 2, 100);
    if (!roleId) e.bad("u_role", "Role is required");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.bad("u_email", "Email is invalid");
    if (u.id === state.ME.id && !active) e.bad("u_active", "You cannot deactivate your own account");
    if (V.show(e)) return;

    const oldRole = rn[u.role_id]?.name || "";
    const newRole = rn[roleId]?.name || "";
    await DB.put("users", { ...u, full_name: name, email: email || null, role_id: roleId, department_id: deptId, active });
    await audit("users", u.id, "user_update", `Updated ${u.username}`, { old: oldRole, new: newRole });
    msg(`User ${u.username} updated.`);
    clear();
    render();
  };

  render();
}
