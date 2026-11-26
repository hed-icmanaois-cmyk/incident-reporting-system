import { DEFAULT_PW, toEmail } from "../config.js";
import { sb, DB, loadMe } from "../db.js";
import { $, app, esc, byId, val, msg, role, audit, state } from "../helpers.js";
import { V, friendly, loginError } from "../validation.js";

export async function loginPage() {
  app().innerHTML = `<form id="login"><h3>Sign In</h3>
    <label>Username<input id="l_user" autocomplete="username"></label>
    <label>Password<input id="l_pass" type="password" autocomplete="current-password"></label>
    <button>Sign In</button>
    <div class="login-links">
      <a href="#" data-a="showReset">Forgot password?</a>
      <small>Session protected</small>
    </div>
    <p style="margin-top:0.85rem"><small>Demo accounts: admin, investigator1, investigator2, officer1, viewer1. Default password: <b>${esc(DEFAULT_PW)}</b> (change under My Account).</small></p>
  </form>
  <div id="reset-box"></div>`;

  state.A.showReset = () => {
    $("#reset-box").innerHTML = `<form id="resetform" style="max-width:380px;margin:1rem auto 0"><h3>Reset Password</h3>
      <p><small>Enter your username or registered email address to request a password reset link.</small></p>
      <label>Username or Email<input id="rs_id" autocomplete="email"></label>
      <div class="btn-row"><button>Send Reset Link</button> <button type="button" class="sec" data-a="hideReset">Cancel</button></div>
    </form>`;
    $("#rs_id")?.focus();
  };

  state.A.hideReset = () => { $("#reset-box").innerHTML = ""; };

  state.S.resetform = async () => {
    const raw = val("rs_id");
    if (!raw) return msg("Enter your username or email address.", false);
    const email = raw.includes("@") ? raw : toEmail(raw);
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) return msg(friendly(error), false);
    msg(`If an account exists for ${email}, a password reset link has been sent.`);
    $("#reset-box").innerHTML = "";
  };

  state.S.login = async () => {
    const uName = val("l_user"), pass = $("#l_pass").value;
    if (V.show(V.login(uName, pass))) return;
    const { error } = await sb.auth.signInWithPassword({ email: toEmail(uName), password: pass });
    if (error) return msg(loginError(error), false);
    const u = await loadMe();
    if (!u) {
      await sb.auth.signOut();
      return msg("This login is not linked to an active user record.", false);
    }
    state.ME = u;
    state.ROLES = byId(await DB.all("roles"));
    await audit("users", u.id, "login");
    const h = location.hash;
    if (!h || h === "#login") location.hash = "#home";
    else state.route();
  };
}

export async function accountPage() {
  const u = state.ME;
  const dept = u.department_id ? await DB.get("departments", u.department_id) : null;
  app().innerHTML = `<h2>My Account</h2>
    <div class="card" style="max-width:480px;margin-bottom:1.25rem">
      <p><b>Name:</b> ${esc(u.full_name)}</p>
      <p><b>Username:</b> ${esc(u.username)}</p>
      <p><b>Role:</b> ${esc(role() || "—")}</p>
      <p><b>Department:</b> ${esc(dept?.name || "—")}</p>
      <p><b>Email:</b> ${esc(u.email || toEmail(u.username))}</p>
    </div>
    <form id="pw" style="max-width:480px"><h3>Change Password</h3>
      <label>New Password<input id="p_new" type="password" autocomplete="new-password" placeholder="Minimum 8 characters"></label>
      <label>Confirm Password<input id="p_cfm" type="password" autocomplete="new-password"></label>
      <button>Update Password</button>
    </form>`;

  state.S.pw = async () => {
    const p1 = $("#p_new").value, p2 = $("#p_cfm").value;
    if (p1.length < 8) return msg("Password must be at least 8 characters.", false);
    if (p1 !== p2) return msg("Passwords do not match.", false);
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) return msg(friendly(error), false);
    await audit("users", u.id, "password_change");
    $("#p_new").value = "";
    $("#p_cfm").value = "";
    msg("Password updated.");
  };
}
