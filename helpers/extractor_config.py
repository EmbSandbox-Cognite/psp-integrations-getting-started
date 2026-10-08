"""Control the extractor's configuration from the cloud.

The extractor does not keep its settings locally. It downloads them from the integration as a
*configuration revision*, and keeps checking for a newer one. Pushing a new revision is how you
reconfigure an extractor that runs on an edge machine without touching that machine.

This module breaks that configuration on purpose, and repairs it again, so you can watch what
the extractor does with a bad revision.
"""

import yaml

from helpers import ops
from helpers.constants import DATA_DIR, INTEGRATION_EXTERNAL_ID

# Where the last valid config is kept while it is broken, so it can be put back.
GOOD_CONFIG_BACKUP = DATA_DIR / "last_good_config.yaml"


def _url(client) -> str:
    return f"/api/v1/projects/{client.config.project}/integrations/config"


def get_config(client) -> dict:
    """The newest configuration revision: {"config": <yaml text>, "revision": <int>, ...}."""
    return client.get(_url(client), params={"integration": INTEGRATION_EXTERNAL_ID}, headers=ops.BETA).json()


def push_config(client, config: str, description: str) -> int:
    """Publish `config` as a new revision and return its number."""
    response = client.post(
        _url(client),
        json={"externalId": INTEGRATION_EXTERNAL_ID, "description": description, "config": config},
        headers=ops.BETA,
    )
    return response.json()["revision"]


def is_broken(config: str) -> bool:
    """True when a query is missing `sheet`, the setting the spreadsheet source requires."""
    queries = (yaml.safe_load(config) or {}).get("queries", [])
    return any("sheet" not in query for query in queries)


def break_config(client) -> str:
    current = get_config(client)
    if is_broken(current["config"]):
        return f"Revision {current['revision']} is already broken. Press 'Repair the config'."

    DATA_DIR.mkdir(exist_ok=True)
    GOOD_CONFIG_BACKUP.write_text(current["config"], encoding="utf-8")

    parsed = yaml.safe_load(current["config"])
    for query in parsed["queries"]:
        query.pop("sheet", None)
    revision = push_config(
        client,
        yaml.safe_dump(parsed, sort_keys=False),
        "Broken on purpose by integrations_tutorial.ipynb: removed the required 'sheet' setting",
    )
    return f"Published revision {revision} with the required 'sheet' setting removed."


def repair_config(client) -> str:
    current = get_config(client)
    if not is_broken(current["config"]):
        return "The config is already valid."
    if not GOOD_CONFIG_BACKUP.exists():
        raise RuntimeError(
            f"No saved copy of the good config at {GOOD_CONFIG_BACKUP}. "
            "Re-run the Deploy step instead: it publishes the config from the module again."
        )

    revision = push_config(
        client,
        GOOD_CONFIG_BACKUP.read_text(encoding="utf-8"),
        "Repaired by integrations_tutorial.ipynb: put the 'sheet' setting back",
    )
    GOOD_CONFIG_BACKUP.unlink()
    return f"Published revision {revision}, which restores the last good config."
