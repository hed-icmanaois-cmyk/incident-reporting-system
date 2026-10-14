let depts = [], editing = null;
const FIELDS = ["reporter_no", "full_name", "department_id", "position", "contact", "email", "address", "reporter_type", "status"];

async function init() {
  depts = await DB.all("departments");
  $("#department_id").innerHTML = opts(depts);
  $("#fdept").innerHTML = '<option value="">All departments</option>' + opts(depts);
  render();
}

async function render() {
  const n = $("#qname").value.toLowerCase(), i = $("#qid").value.toLowerCase(), d = $("#fdept").value, t = $("#ftype").value;
  const dn = byId(depts);
  const rows = (await DB.all("reporters")).filter(r =>
    r.full_name.toLowerCase().includes(n) && r.reporter_no.toLowerCase().includes(i) &&
    (!d || r.department_id == d) && (!t || r.reporter_type === t));
  $("#rows").innerHTML = rows.map(r => `<tr>
    <td>${esc(r.reporter_no)}</td><td><a href="profile.html?id=${r.id}">${esc(r.full_name)}</a></td>
    <td>${esc(dn[r.department_id]?.name)}</td><td>${esc(r.reporter_type)}</td><td>${esc(r.contact)}</td>
    <td><span class="badge ${r.status}">${r.status}</span></td>
    <td><button class="sec" onclick="edit(${r.id})">Edit</button>
        <button class="sec" onclick="toggle(${r.id})">${r.status === "Active" ? "Deactivate" : "Activate"}</button></td></tr>`).join("")
    || '<tr><td colspan="7">No reporters found.</td></tr>';
}

function resetForm() { editing = null; $("#form").reset(); $("#ftitle").textContent = "Register Reporter"; }

async function edit(id) {
  const r = await DB.get("reporters", id); editing = id;
  FIELDS.forEach(k => ($("#" + k).value = r[k] ?? ""));
  $("#ftitle").textContent = "Edit Reporter"; scrollTo(0, 0);
}

async function toggle(id) {
  const r = await DB.get("reporters", id);
  r.status = r.status === "Active" ? "Inactive" : "Active";
  await DB.put("reporters", r); render(); msg(`${r.full_name} is now ${r.status}.`);
}

$("#form").onsubmit = async e => {
  e.preventDefault();
  const r = {}; FIELDS.forEach(k => (r[k] = $("#" + k).value.trim()));
  r.department_id = Number(r.department_id);
  const err = [];
  if (!r.reporter_no) err.push("ID is required");
  if (!r.full_name) err.push("Full name is required");
  if (!r.department_id) err.push("Department is required");
  if (r.email && !/^\S+@\S+\.\S+$/.test(r.email)) err.push("Email is invalid");
  if (r.contact && !/^[0-9+\-\s()]{7,15}$/.test(r.contact)) err.push("Contact number is invalid");
  if (err.length) return msg(err.join(". ") + ".", false);
  try {
    if (editing) { await DB.put("reporters", { ...(await DB.get("reporters", editing)), ...r }); msg("Reporter updated."); }
    else { await DB.add("reporters", { ...r, created_at: new Date().toISOString() }); msg("Reporter registered successfully."); }
    resetForm(); render();
  } catch (x) { msg(x.name === "ConstraintError" ? "That Employee/Student ID already exists." : x.message, false); }
};
init();
