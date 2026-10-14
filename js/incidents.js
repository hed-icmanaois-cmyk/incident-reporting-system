let D = {};
async function init() {
  D = { cats: await DB.all("incident_categories"), types: await DB.all("incident_types"), reps: byId(await DB.all("reporters")) };
  $("#f_cat").innerHTML = '<option value="">All</option>' + opts(D.cats);
  catChange();
}
function catChange() {
  const c = $("#f_cat").value;
  $("#f_type").innerHTML = '<option value="">All</option>' + opts(D.types.filter(t => !c || t.category_id == c));
  render();
}
async function render() {
  const cn = byId(D.cats), tn = byId(D.types);
  const q = { no: $("#q_no").value.toLowerCase(), rep: $("#q_rep").value.toLowerCase(), cat: $("#f_cat").value, type: $("#f_type").value, date: $("#f_date").value, sev: $("#f_sev").value, st: $("#f_stat").value };
  const rows = (await DB.all("incidents")).filter(i =>
    i.incident_no.toLowerCase().includes(q.no) && (D.reps[i.reporter_id]?.full_name || "").toLowerCase().includes(q.rep) &&
    (!q.cat || i.category_id == q.cat) && (!q.type || i.type_id == q.type) && (!q.date || i.incident_date === q.date) &&
    (!q.sev || i.severity === q.sev) && (!q.st || i.status === q.st)).reverse();
  $("#count").textContent = `${rows.length} incident(s) found`;
  $("#rows").innerHTML = rows.map(i => `<tr><td>${esc(i.incident_no)}</td>
    <td><a href="profile.html?id=${i.reporter_id}">${esc(D.reps[i.reporter_id]?.full_name)}</a></td>
    <td>${esc(cn[i.category_id]?.name)}</td><td>${esc(tn[i.type_id]?.name)}</td><td>${esc(i.incident_date)} ${esc(i.incident_time)}</td>
    <td><span class="badge ${i.severity}">${i.severity}</span></td><td>${esc(i.status)}</td></tr>`).join("")
    || '<tr><td colspan="7">No incidents match.</td></tr>';
}
init();
