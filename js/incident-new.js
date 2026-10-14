let types = [];
const sel = (id, list, ph) => ($("#" + id).innerHTML = `<option value="">${ph}</option>` + opts(list));
async function init() {
  sel("reporter_id", (await DB.all("reporters")).filter(r => r.status === "Active"), "-- Select reporter --");
  sel("category_id", (await DB.all("incident_categories")).filter(c => c.active), "-- Select category --");
  sel("location_id", await DB.all("locations"), "-- Not specified --");
  types = (await DB.all("incident_types")).filter(t => t.active);
  sel("type_id", [], "-- Select category first --");
  $("#incident_date").max = today();
}
$("#category_id").onchange = () => sel("type_id", types.filter(t => t.category_id == $("#category_id").value), "-- Select type --");

async function makeNumber() { // INC-YYYYMMDD-0001, retried if the unique index rejects it
  const d = today().replaceAll("-", "");
  let n = (await DB.all("incidents")).filter(i => i.incident_no.startsWith("INC-" + d)).length + 1;
  return () => `INC-${d}-${String(n++).padStart(4, "0")}`;
}

$("#form").onsubmit = async e => {
  e.preventDefault();
  const v = id => $("#" + id).value.trim(), err = [];
  if (!v("reporter_id")) err.push("Reporter is required");
  if (!v("category_id")) err.push("Incident category is required");
  if (!v("type_id")) err.push("Incident type is required");
  if (!v("incident_date") || !v("incident_time")) err.push("Date and time of incident are required");
  else {
    const dt = new Date(`${v("incident_date")}T${v("incident_time")}`);
    if (isNaN(dt)) err.push("Incident date/time is invalid");
    else if (dt > new Date()) err.push("Incident date/time cannot be in the future");
  }
  if (!v("description")) err.push("Description cannot be empty");
  if (!v("severity")) err.push("Severity must be selected");
  if (err.length) return msg(err.join(". ") + ".", false);

  const next = await makeNumber();
  const rec = {
    reporter_id: +v("reporter_id"), category_id: +v("category_id"), type_id: +v("type_id"),
    location_id: v("location_id") ? +v("location_id") : null,
    incident_date: v("incident_date"), incident_time: v("incident_time"), description: v("description"),
    severity: v("severity"), immediate_response: v("immediate_response"), status: "Open", date_reported: new Date().toISOString()
  };
  for (let tries = 0; tries < 5; tries++) {
    try {
      rec.incident_no = next();
      await DB.add("incidents", rec);
      msg(`Incident saved as ${rec.incident_no}.`); e.target.reset(); sel("type_id", [], "-- Select category first --"); return;
    } catch (x) { if (x.name !== "ConstraintError") return msg(x.message, false); }
  }
  msg("Could not generate a unique incident number. Try again.", false);
};
init();
