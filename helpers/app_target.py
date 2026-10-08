"""Point the monitoring app's deployment at the CDF project in .env. Used by deploy-app.ps1.

The deploy command takes its target from the `deployments` list in the app's app.json, which holds
whatever project the app was created for. This rewrites the first entry so the app goes to the
project in your .env, and prints the Fusion organization, which is the first part of the app's
address (https://<organization>.fusion.cognite.com) and is not in .env.
"""

import json
import re
from urllib.parse import urlparse

from helpers.auth import get_client
from helpers.constants import REPO_ROOT

APP_JSON = REPO_ROOT / "apps" / "integrations-monitoring" / "app.json"

client = get_client()
project = client.config.project
organization = client.get(f"/api/v1/projects/{project}").json()["organization"]
cluster = urlparse(client.config.base_url).hostname.split(".")[0]

app = json.loads(APP_JSON.read_text(encoding="utf-8"))
app["deployments"][0].update(
    org=organization,
    project=project,
    baseUrl=client.config.base_url,
    # Only used when deploying from CI with a client secret; named after the target it belongs to.
    deploySecretName="_".join(re.sub(r"[^A-Za-z0-9]", "_", part).upper() for part in (organization, project, cluster)),
)
APP_JSON.write_text(json.dumps(app, indent=2) + "\n", encoding="utf-8")

print(organization)
