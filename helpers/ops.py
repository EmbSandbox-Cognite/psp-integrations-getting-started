"""CDF-side reads shared by the notebooks: what the Integrations UI shows, and what has arrived."""

import time

from cognite.client.data_classes.data_modeling import NodeId

from helpers.constants import (
    INTEGRATION_EXTERNAL_ID,
    METRICS,
    PUMP_IDS,
    RAW_DATABASE,
    RAW_TABLE,
    SPACE,
    TRANSFORMATION_EXTERNAL_IDS,
    WORKFLOW_EXTERNAL_ID,
)

# The Integrations API is in preview and the Python SDK's typed support is still
# alpha, so these go straight to the REST endpoints with the beta header.
BETA = {"cdf-version": "beta"}


def _url(client, path: str) -> str:
    return f"/api/v1/projects/{client.config.project}/{path}"


def get_integration(client, external_id: str = INTEGRATION_EXTERNAL_ID) -> dict | None:
    items = client.get(_url(client, "integrations"), headers=BETA).json()["items"]
    return next((i for i in items if i["externalId"] == external_id), None)


def get_task_history(client, external_id: str = INTEGRATION_EXTERNAL_ID, limit: int = 100) -> list[dict]:
    """Task run history - one entry per extractor task run. Empty until an extractor connects."""
    response = client.get(
        _url(client, "integrations/history"),
        params={"integration": external_id, "limit": limit},
        headers=BETA,
    )
    return response.json().get("items", [])


def get_errors(client, external_id: str = INTEGRATION_EXTERNAL_ID, limit: int = 100) -> list[dict]:
    """Structured errors: externalId, level, type, description, startTime, endTime."""
    response = client.get(
        _url(client, "integrations/errors"),
        params={"integration": external_id, "limit": limit},
        headers=BETA,
    )
    return response.json().get("items", [])


def extractor_status(client) -> dict:
    """What the extractor has told CDF: is it connected, which tasks it runs, which config it uses."""
    integration = get_integration(client) or {}
    last_seen = integration.get("lastSeen")
    age = None if not last_seen else round(time.time() - last_seen / 1000)
    return {
        "connected": age is not None and age < 90,
        "seconds_since_check_in": age,
        # Archived tasks are ones that stopped reporting, e.g. a query that was renamed.
        "tasks": [task["name"] for task in integration.get("tasks", []) if not task.get("archived")],
        "latest_revision": integration.get("lastConfigRevision"),
        "active_revision": integration.get("activeConfigRevision"),
    }


def raw_row_count(client) -> int:
    return sum(1 for _ in client.raw.rows(RAW_DATABASE, RAW_TABLE, limit=None))


def raw_rows_last_minute(client) -> int:
    """Rows written to RAW in the last 60 seconds - this is what a change of pace changes."""
    since = int((time.time() - 60) * 1000)
    return len(client.raw.rows.list(RAW_DATABASE, RAW_TABLE, min_last_updated_time=since, limit=None))


def datapoint_counts(client) -> dict[str, int]:
    counts = {}
    for pump in PUMP_IDS:
        for metric in METRICS:
            external_id = f"{pump}:{metric}"
            points = client.time_series.data.retrieve(
                instance_id=NodeId(SPACE, external_id), start=0, end="now"
            )
            counts[external_id] = len(points) if points else 0
    return counts


def transformation_runs(client, limit: int = 5) -> list[dict]:
    runs = []
    for external_id in TRANSFORMATION_EXTERNAL_IDS:
        jobs = client.transformations.jobs.list(transformation_external_id=external_id, limit=limit)
        for job in jobs:
            runs.append(
                {
                    "transformation": external_id,
                    "status": str(job.status),
                    "error": job.error,
                    "startedTime": job.started_time,
                    "finishedTime": job.finished_time,
                }
            )
    return sorted(runs, key=lambda r: r["startedTime"] or 0, reverse=True)


def workflow_runs(client, limit: int = 5) -> list[dict]:
    executions = client.workflows.executions.list(workflow_version_ids=WORKFLOW_EXTERNAL_ID, limit=limit)
    return [
        {
            "id": execution.id,
            "status": execution.status,
            "startTime": execution.start_time,
            "endTime": execution.end_time,
            "reason": getattr(execution, "reason_for_incompletion", None),
        }
        for execution in executions
    ]
