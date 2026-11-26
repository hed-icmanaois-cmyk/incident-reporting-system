export const CONFIG = {
  SUPABASE_URL: "https://rurufwwijlagegmqaqtx.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_xps6-C06Pe1ljV18ihuSfA_ApmRaAFd",
  PRODUCTION: false,
  FKS: {
    "users.role_id": "roles",
    "users.department_id": "departments",
    "reporters.department_id": "departments",
    "incident_types.category_id": "incident_categories",
    "locations.department_id": "departments",
    "incidents.reporter_id": "reporters",
    "incidents.category_id": "incident_categories",
    "incidents.type_id": "incident_types",
    "incidents.location_id": "locations",
    "incident_attachments.incident_id": "incidents",
    "investigations.incident_id": "incidents",
    "investigations.investigator_id": "users",
    "investigations.assigned_by": "users",
    "investigation_findings.investigation_id": "investigations",
    "investigation_evidence.investigation_id": "investigations",
    "investigation_evidence.uploaded_by": "users",
    "actions.investigation_id": "investigations",
    "actions.incident_id": "incidents",
    "actions.assigned_to": "users",
    "actions.assigned_by": "users",
    "action_monitoring.action_id": "actions",
    "action_monitoring.changed_by": "users",
    "resolutions.incident_id": "incidents",
    "resolutions.resolved_by": "users",
    "notifications.user_id": "users",
    "notifications.incident_id": "incidents",
    "audit_logs.user_id": "users"
  }
};

// Topological order for backup & restore (Lab 54)
export const BACKUP_TABLES = [
  "roles",
  "departments",
  "users",
  "reporters",
  "incident_categories",
  "incident_types",
  "locations",
  "incidents",
  "incident_attachments",
  "investigations",
  "investigation_findings",
  "investigation_evidence",
  "actions",
  "action_monitoring",
  "resolutions",
  "notifications",
  "audit_logs"
];

export const DEFAULT_PW = "password";
export const EMAIL_DOMAIN = "irs.local";
export const toEmail = u => `${String(u).trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const SEVERITIES = ["Low", "Medium", "High", "Critical"];
export const REPORTER_TYPES = ["Employee", "Student", "Visitor", "Contractor"];
export const INV_STATUSES = ["Assigned", "In Progress", "Evidence Gathering", "Findings Prepared", "Completed"];
export const ACTION_TYPES = ["Corrective Action", "Preventive Action", "Safety Improvement", "Equipment Repair", "Policy Improvement", "Training", "Process Improvement"];
export const ACTION_STATUSES = ["Pending", "In Progress", "Completed", "Verified"];
export const PRIORITIES = ["Low", "Medium", "High", "Critical"];
export const NEXT_ACTION_STATUS = { Pending: "In Progress", "In Progress": "Completed", Completed: "Verified" };
export const DONE_STATUSES = ["Completed", "Verified"];
export const RESOLUTION_TYPES = ["Corrected", "Mitigated", "Preventive Measures Implemented", "No Fault Found", "Referred to Another Unit", "Other"];
export const TARGET_DAYS = 7;

export const MAX_FILE_SIZE = 2 * 1024 * 1024;
export const FILE_TYPES = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"]
};
export const FILE_ACCEPT = Object.keys(FILE_TYPES).map(x => "." + x).join(",");

// Full 7-role RBAC (Labs 35-36) with backward compatibility for legacy DB role names
export const PERM = {
  admin: ["Admin", "Administrator"],
  reg: ["Admin", "Administrator", "Reporter Officer", "Incident Officer"],
  report: ["Admin", "Administrator", "Reporter", "Reporter Officer", "Incident Officer", "Supervisor"],
  inv: ["Admin", "Administrator", "Investigator", "Supervisor"],
  action: ["Admin", "Administrator", "Investigator", "Action Officer", "Supervisor"],
  verify: ["Admin", "Administrator", "Investigator", "Supervisor"],
  close: ["Admin", "Administrator", "Supervisor"]
};

export const TRANS = {
  Open: { "Under Investigation": "inv" },
  "Under Investigation": { Resolved: "inv" },
  Resolved: { Closed: "close" }
};
