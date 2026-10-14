const CONFIG = {
  DB_NAME: "IncidentReportingDB",
  DB_VERSION: 2, // bumped: schema now has all 17 tables (rebuilds stores, clears data)
  STORE: "incidents",
  // store: [[indexName, unique?], ...]  (every store: id, autoIncrement)
  SCHEMA: {
    roles: [["name", 1]],
    users: [["username", 1], ["role_id"], ["department_id"]],
    departments: [["name", 1]],
    reporters: [["reporter_no", 1], ["department_id"], ["reporter_type"], ["status"]],
    incident_categories: [["name", 1]],
    incident_types: [["category_id"], ["name"]],
    locations: [["name", 1]],
    incidents: [["incident_no", 1], ["reporter_id"], ["category_id"], ["type_id"], ["location_id"], ["severity"], ["status"], ["incident_date"]],
    incident_attachments: [["incident_id"]],
    investigations: [["incident_id"], ["investigator_id"], ["status"]],
    investigation_findings: [["investigation_id"]],
    investigation_evidence: [["investigation_id"]],
    actions: [["investigation_id"], ["assigned_to"], ["status"]],
    action_monitoring: [["action_id"]],
    resolutions: [["incident_id", 1]],
    notifications: [["user_id"], ["incident_id"]],
    audit_logs: [["user_id"], ["entity"]]
  },
  FKS: { // for the relationship test: store.field -> parent store
    "users.role_id": "roles", "users.department_id": "departments",
    "reporters.department_id": "departments", "incident_types.category_id": "incident_categories",
    "incidents.reporter_id": "reporters", "incidents.category_id": "incident_categories",
    "incidents.type_id": "incident_types", "incidents.location_id": "locations",
    "incident_attachments.incident_id": "incidents", "investigations.incident_id": "incidents",
    "investigation_findings.investigation_id": "investigations", "investigation_evidence.investigation_id": "investigations",
    "actions.investigation_id": "investigations", "action_monitoring.action_id": "actions",
    "resolutions.incident_id": "incidents", "notifications.incident_id": "incidents"
  }
};
