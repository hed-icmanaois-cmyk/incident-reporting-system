# Incident Reporting System

A web-based **Incident Reporting System** developed as a final project for **Software Engineering (3rd Year)**. Built with vanilla HTML5, CSS3, ES6 JavaScript modules, and Supabase, the application manages the complete incident lifecycle—from initial reporting and location tracking to investigation, root cause analysis, corrective actions, resolution, closure, and management reporting.

## System Workflow

```text
Reporter -> Incident -> Location -> Investigation -> Findings / RCA -> Corrective Action -> Resolution -> Closure -> Reports & Dashboard
```

## Core Features

- **Reporter & Master Data Management:** Register and search reporters, view individual reporter incident profiles, and maintain departments, incident categories, incident types, and active locations.
- **Incident Registration & Monitoring:** Log incidents with unique generated numbers (`INC-YYYYMMDD-####`), category-filtered incident types, severity levels, file attachments (up to 2 MB), and multi-criteria filtering.
- **Investigation & Root Cause Analysis (RCA):** Assign investigators with start/target dates, track 5-stage progress (`Assigned -> In Progress -> Evidence Gathering -> Findings Prepared -> Completed`), upload role-restricted evidence, and document structured RCA findings.
- **Corrective Action & Overdue Tracking:** Create corrective/preventive actions linked to investigation findings, track 4-stage completion (`Pending -> In Progress -> Completed -> Verified`), and automatically flag overdue tasks.
- **Resolution, Closure & Lifecycle Trace:** Enforce readiness checks (completed investigation and corrective actions) prior to resolution and supervisor/admin closure, paired with a visual Incident Trace view.
- **Analytics Dashboard & Reports:** View 7 KPI summary tiles, 7 visual breakdown charts, location risk and recurring-incident monitoring, monthly/quarterly trends, and print/PDF-ready management reports.
- **Security, Audit Trail & Backup:** 7-role Role-Based Access Control (RBAC), transaction audit logging, in-app notifications, light/dark mode support, and 17-table JSON backup/restore with integrity checks.

## Tech Stack

- **Frontend:** HTML5, CSS3 (Custom Properties, Responsive Layout, Print Styles), Vanilla JavaScript (ES6 Modules, Hash-Based SPA Router)
- **Backend & Database:** Supabase (PostgreSQL 17-table relational schema + Supabase JS v2)
- **Hosting:** Netlify (`netlify.toml` static configuration)

## Project Structure

```text
incident-reporting-system/
├── index.html                  # SPA shell and theme bootstrap
├── netlify.toml                # Netlify static hosting & security headers
├── css/
│   └── style.css               # Light/dark theme, layout, and print styles
├── js/
│   ├── app.js                  # Application entry point and session init
│   ├── config.js               # Supabase configuration, constants, RBAC rules
│   ├── db.js                   # Supabase client wrapper and query helpers
│   ├── helpers.js              # Formatting, DOM, audit, and notification helpers
│   ├── router.js               # Hash router, sidebar navigation, route guards
│   ├── validation.js           # Input validation and business rule checks
│   └── pages/
│       ├── auth.js             # Login, logout, password reset, account settings
│       ├── home.js             # Dashboard overview, KPIs, and system health
│       ├── reporters.js        # Reporter registration, search, and profiles
│       ├── masters.js          # Categories, types, locations, location monitoring
│       ├── incidents.js        # Incident registration, search, and details
│       ├── investigations.js   # Investigation assignment, findings, evidence, RCA
│       ├── actions.js          # Corrective actions, monitoring, overdue tracker
│       ├── resolutions.js      # Resolution recording and incident closure
│       ├── workflow.js         # End-to-end incident lifecycle trace
│       ├── reports.js          # 7 analytical reports and audit trail viewer
│       ├── users.js            # User account and role management
│       └── backup.js           # JSON backup export, verification, and restore
└── docs/                       # Software Engineering project documentation
    ├── user_manual.pdf
    ├── technical_documentation.pdf
    ├── testing_package.pdf
    └── uat_scenarios.pdf
```

## Database Schema (17 Tables)

`roles` · `departments` · `users` · `reporters` · `incident_categories` · `incident_types` · `locations` · `incidents` · `incident_attachments` · `investigations` · `investigation_findings` · `investigation_evidence` · `actions` · `action_monitoring` · `resolutions` · `notifications` · `audit_logs`

## Running Locally

Because the application uses native ES6 modules, run it through a local HTTP server instead of opening `index.html` directly via `file://`:

1. Clone the repository:
   ```bash
   git clone https://github.com/[your-username]/[repo-name].git
   cd [repo-name]
   ```
2. Verify your Supabase project URL and publishable key in `js/config.js`.
3. Start a local static server:
   ```bash
   npx serve .
   ```
   *(Alternatively, use the VS Code **Live Server** extension or `python -m http.server 8000`.)*
4. Open the local URL shown in your terminal (e.g., `http://localhost:3000`).

## Deployment

The project is configured for static deployment on **Netlify** using `netlify.toml`.

- **Live Application:** `[https://your-site-name.netlify.app]`

## User Roles & Demo Accounts

The system supports 7 RBAC roles: **Administrator**, **Reporter**, **Incident Officer**, **Investigator**, **Action Officer**, **Supervisor**, and **Management**.

| Username | Role | Default Password |
| :--- | :--- | :--- |
| `admin` | Administrator | `Password1!` |
| `officer1` | Incident Officer | `Password1!` |
| `investigator1` | Investigator | `Password1!` |
| `viewer1` | Management / Viewer | `Password1!` |

## End-to-End Demo Scenario

Used for system demonstration and User Acceptance Testing:

- **Reporter:** Juan Dela Cruz
- **Incident:** Computer equipment accident
- **Location:** IT Laboratory 2
- **Category / Severity:** Safety / High

## Project Documentation

Place your exported PDF deliverables inside a `docs/` folder to activate the links below:

- [User Manual](docs/user_manual.pdf)
- [Technical Documentation](docs/technical_documentation.pdf)
- [Testing Package](docs/testing_package.pdf)
- [UAT Scenarios & Sign-Off Pack](docs/uat_scenarios.pdf)

## Course & Project Information

- **Subject:** Software Engineering (3rd Year — Final Project)
- **Developer(s):** `[Your Name / Group Members]`
- **Section:** `[Your Section]`
- **Instructor:** `[Instructor Name]`
- **Academic Year:** `[2026–2027]`