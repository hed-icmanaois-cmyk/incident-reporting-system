let cats = [], types = [];
const stat = a => `<span class="badge ${a ? "Active" : "Inactive"}">${a ? "Active" : "Inactive"}</span>`;

async function load() {
  cats = await DB.all("incident_categories"); types = await DB.all("incident_types");
  const cn = byId(cats);
  $("#t_cat").innerHTML = opts(cats.filter(c => c.active));
  $("#crows").innerHTML = cats.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.description)}</td><td>${stat(c.active)}</td>
    <td><button class="sec" onclick="editC(${c.id})">Edit</button> <button class="sec" onclick="toggle('incident_categories',${c.id})">${c.active ? "Deactivate" : "Activate"}</button></td></tr>`).join("");
  $("#trows").innerHTML = types.map(t => `<tr><td>${esc(t.name)}</td><td>${esc(cn[t.category_id]?.name)}</td><td>${stat(t.active)}</td>
    <td><button class="sec" onclick="editT(${t.id})">Edit</button> <button class="sec" onclick="toggle('incident_types',${t.id})">${t.active ? "Deactivate" : "Activate"}</button></td></tr>`).join("");
}
function editC(id) { const c = cats.find(x => x.id === id); $("#c_id").value = id; $("#c_name").value = c.name; $("#c_desc").value = c.description; scrollTo(0, 0); }
function editT(id) { const t = types.find(x => x.id === id); $("#t_id").value = id; $("#t_name").value = t.name; $("#t_cat").value = t.category_id; $("#tform").scrollIntoView(); }
async function toggle(store, id) { const r = await DB.get(store, id); r.active = !r.active; await DB.put(store, r); load(); msg(`${r.name} is now ${r.active ? "active" : "inactive"}.`); }

async function save(store, id, data, form) {
  try {
    if (id) await DB.put(store, { ...(await DB.get(store, id)), ...data }); else await DB.add(store, { ...data, active: true });
    msg("Saved successfully."); form.reset(); form.querySelector("[type=hidden]").value = ""; load();
  } catch (x) { msg(x.name === "ConstraintError" ? "That name already exists." : x.message, false); }
}
$("#cform").onsubmit = e => {
  e.preventDefault(); const name = $("#c_name").value.trim();
  if (!name) return msg("Category name is required.", false);
  save("incident_categories", $("#c_id").value, { name, description: $("#c_desc").value.trim() }, e.target);
};
$("#tform").onsubmit = e => {
  e.preventDefault(); const name = $("#t_name").value.trim(), category_id = Number($("#t_cat").value);
  if (!name || !category_id) return msg("Type name and category are required.", false);
  if (types.some(t => t.category_id === category_id && t.name.toLowerCase() === name.toLowerCase() && t.id != $("#t_id").value)) return msg("That type already exists in this category.", false);
  save("incident_types", $("#t_id").value, { name, category_id }, e.target);
};
load();
