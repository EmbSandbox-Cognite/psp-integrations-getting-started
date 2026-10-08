"""Build a CogniteClient from the .env file in the repo root."""

import os
from pathlib import Path

from cognite.client import ClientConfig, CogniteClient
from cognite.client.credentials import OAuthClientCredentials
from dotenv import load_dotenv

from helpers.constants import REPO_ROOT

ENV_FILE = REPO_ROOT / ".env"
REQUIRED = ["CDF_CLUSTER", "CDF_PROJECT", "IDP_CLIENT_ID", "IDP_CLIENT_SECRET", "IDP_TENANT_ID"]


def require_env_file() -> Path:
    """Return the path to .env, or stop with instructions if it is not there."""
    if not ENV_FILE.exists():
        raise FileNotFoundError(
            f"No .env file found at {ENV_FILE}\n\n"
            "Copy the .env file from your sandbox image repo into the root of this repository "
            "(next to pyproject.toml), then run this cell again."
        )
    return ENV_FILE


def load_env(env_file: Path | None = None) -> None:
    load_dotenv(env_file or require_env_file())
    missing = [key for key in REQUIRED if not os.getenv(key)]
    if missing:
        raise RuntimeError(
            f"The .env file is missing: {', '.join(missing)}. "
            "Copy the .env file from your sandbox image repo, or fill in the values in .env.example and rename it."
        )


def get_client(client_name: str = "psp-integrations-getting-started") -> CogniteClient:
    load_env()
    cluster = os.environ["CDF_CLUSTER"]
    base_url = os.getenv("CDF_URL") or f"https://{cluster}.cognitedata.com"
    token_url = os.getenv("IDP_TOKEN_URL") or (
        f"https://login.microsoftonline.com/{os.environ['IDP_TENANT_ID']}/oauth2/v2.0/token"
    )
    scopes = (os.getenv("IDP_SCOPES") or f"{base_url}/.default").split()

    return CogniteClient(
        ClientConfig(
            client_name=client_name,
            project=os.environ["CDF_PROJECT"],
            base_url=base_url,
            credentials=OAuthClientCredentials(
                token_url=token_url,
                client_id=os.environ["IDP_CLIENT_ID"],
                client_secret=os.environ["IDP_CLIENT_SECRET"],
                scopes=scopes,
            ),
        )
    )
