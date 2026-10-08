# Feature Specification: Integrations Monitoring

A read-only dashboard for the `psp_pump_feed` integration, built as part of the
`psp-integrations-getting-started` Partner Solution Pattern. It answers one question at a glance:
**is the feed healthy, and if not, what broke and where?**

## User Scenarios & Testing

### User Stories

1. As a partner engineer following the walkthrough, I want to see whether the extractor is
   connected and delivering, so that I know the integration is working before I start
   changing things.
2. As a partner engineer, I want to see the feed's pace over time, so that when I switch the
   notebook between `slow`, `normal`, `fast` and `burst` I can confirm the change reached CDF.
3. As a partner engineer, I want to see the integration's structured errors with severity and
   type, and whether each is still active, so that I can tell a transient blip from an
   ongoing outage.
4. As a partner engineer, I want to see downstream workflow and transformation runs with
   their error messages, so that I can tell an extractor problem apart from a data-quality
   problem.

### Acceptance Scenarios

- Given the integration exists and the extractor has connected, when the dashboard loads,
  then it shows the extractor id and version, the active configuration revision, and the
  task names the extractor reported.
- Given readings have been staged, when the dashboard loads, then the chart shows readings
  per minute for the last 20 minutes.
- Given the feed has been paused longer than `allowedNotSeenMinutes`, when the dashboard
  refreshes, then the missed check-in appears as an **active** error.
- Given a reading with a non-numeric `flow_rate` was staged, when the datapoints
  transformation next runs, then the dashboard shows that run as failed together with the
  message naming the offending column.
- Given the integration has not been deployed, when the dashboard loads, then it says so and
  points at `cdf deploy` rather than showing an empty dashboard.
- Given the user lacks `integrations:read`, when the dashboard loads, then it names the
  missing capability instead of failing silently.

## Requirements

### Functional Requirements

- Read the integration, its errors and its task history from the Integrations API.
- Read staged rows from RAW and bucket them per minute.
- Read recent transformation jobs and workflow executions.
- Refresh every 15 seconds without user action.
- Never write to CDF. The dashboard is strictly read-only; all changes come from the notebook.

### Non-Functional Requirements

- Authenticate through the Fusion host via `connectToHostApp`; no credentials in the app.
- Use Aura primitives and semantic tokens so light and dark mode both work.
- Convey status with a labelled badge, never colour alone.
- Call the Integrations REST endpoints directly with the beta `cdf-version` header, rather
  than depending on alpha SDK helpers whose shape may change.

## Out of Scope

- Controlling the feed. That is the notebook's job, and a browser app cannot write to the
  extractor's local CSV anyway.
- Any aggregation or alerting beyond what the Integrations API already returns.
- Publishing to App Hosting, which needs Builder Certification and a developer signature.
