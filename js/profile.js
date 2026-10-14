(async () => {
  const id = Number(new URLSearchParams(location.search).get("id"));
  const r = await DB.get("reporters", id);
  if (!r) { $("#info").textContent = "Reporter not found."; return; }
  const [dept, cats, incs] = [await DB.get("departments", r.department_id), byId(await DB.all("incident_categories")), await DB.byIndex("incidents", "reporter_id", id)];
  incs.sort((a, b) => b.incident_date.localeCompare(a.incident_date));
  $("#info").innerHTML = `<h2>${esc(r.full_name)} <span class="badge ${r.status}">${r.status}</span></h2>
    <p>ID: ${esc(r.reporter_no)} · ${esc(r.reporter_type)} · ${esc(dept?.name)} · ${esc(r.position)}<br>
    ${esc(r.contact)} · ${esc(r.email)} · ${esc(r.address)}</p>
    <p><strong>Incidents reported: ${incs.length}</strong></p>`;
  const rowsHtml = [];
  for (const i of incs) {
    const inv = (await DB.byIndex("investigations", "incident_id", i.id))[0];
    const res = (await DB.byIndex("resolutions", "incident_id", i.id))[0];
    rowsHtml.push(`<tr><td>${esc(i.incident_no)}</td><td>${esc(i.incident_date)}</td><td>${esc(cats[i.category_id]?.name)}</td>
      <td>${esc(i.status)}</td><td>${esc(inv?.status || "Not started")}</td><td>${res ? "Resolved" : "Unresolved"}</td></tr>`);
  }
  $("#rows").innerHTML = rowsHtml.join("") || '<tr><td colspan="6">No incidents reported.</td></tr>';
})();
