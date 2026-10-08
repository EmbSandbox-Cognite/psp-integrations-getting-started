"""Grant the Integrations capabilities to the Toolkit's service principal group.

Integrations is in public preview and most sandboxes do not grant its capabilities by
default. This extends the existing `cognite_toolkit_service_principal` group
*additively*: it reads the group as raw JSON, appends only what is missing, recreates the
group and deletes the old one.

It deliberately does not go through a Toolkit Group resource, because `cdf deploy`
replaces a group's capability list wholesale with whatever the YAML declares - which would
silently drop every capability the sandbox already had.
"""

import json

from helpers.constants import TOOLKIT_GROUP_NAME

# Both are all-scope only - the API rejects any other scope.
REQUIRED_CAPABILITIES = {
    "integrationsAcl": ["READ", "WRITE", "USE"],
    "integrationConfigsAcl": ["READ", "WRITE"],
}


def _groups_url(client) -> str:
    return f"/api/v1/projects/{client.config.project}/groups"


def _find_group(client, name: str) -> dict:
    groups = client.get(f"{_groups_url(client)}?all=true").json()["items"]
    matches = [group for group in groups if group["name"] == name]
    if not matches:
        raise RuntimeError(
            f"No group named {name!r} in project {client.config.project!r}. This sample expects the "
            "group the Cognite Toolkit creates for its service principal (run `cdf auth init` first), "
            "or change TOOLKIT_GROUP_NAME in helpers/constants.py to the group your credentials use."
        )
    if len(matches) > 1:
        raise RuntimeError(
            f"Found {len(matches)} groups named {name!r}. Remove the duplicates in Fusion before continuing."
        )
    return matches[0]


def _missing_actions(capabilities: list[dict], acl_name: str, required: list[str]) -> list[str]:
    """Actions of `acl_name` that no all-scope entry already grants."""
    granted: set[str] = set()
    for capability in capabilities:
        entry = capability.get(acl_name)
        if entry and entry.get("scope", {}).get("all") is not None:
            granted.update(entry.get("actions", []))
    return [action for action in required if action not in granted]


def _merge(capabilities: list[dict], acl_name: str, actions: list[str]) -> None:
    for capability in capabilities:
        entry = capability.get(acl_name)
        if entry and entry.get("scope", {}).get("all") is not None:
            entry["actions"] = entry.get("actions", []) + actions
            return
    capabilities.append({acl_name: {"actions": actions, "scope": {"all": {}}}})


def grant_integration_capabilities(client, group_name: str = TOOLKIT_GROUP_NAME, dry_run: bool = False) -> dict:
    """Add any missing Integrations capabilities. Safe to re-run: a second call changes nothing.

    Returns {"group", "added", "before", "after"}, where `added` maps each ACL to the actions
    that were (or, with dry_run, would be) added.
    """
    group = _find_group(client, group_name)
    existing = group.get("capabilities", [])
    added = {
        acl: missing
        for acl, required in REQUIRED_CAPABILITIES.items()
        if (missing := _missing_actions(existing, acl, required))
    }
    result = {"group": group_name, "added": added, "before": len(existing), "after": len(existing)}
    if not added or dry_run:
        return result

    updated = json.loads(json.dumps(existing))
    for acl, actions in added.items():
        _merge(updated, acl, actions)

    body = {"name": group["name"], "capabilities": updated}
    # A group has either a sourceId (an IdP group) or members (CDF user ids), never both.
    if group.get("sourceId"):
        body["sourceId"] = group["sourceId"]
    elif group.get("members"):
        body["members"] = group["members"]
    if group.get("metadata"):
        body["metadata"] = group["metadata"]

    created = client.post(_groups_url(client), json={"items": [body]}).json()["items"][0]
    client.post(f"{_groups_url(client)}/delete", json={"items": [group["id"]]})

    # Check the group we just created, by id: right after a delete, a listing by name can still
    # return the old group for a moment.
    still_missing = {
        acl: _missing_actions(created.get("capabilities", []), acl, required)
        for acl, required in REQUIRED_CAPABILITIES.items()
        if _missing_actions(created.get("capabilities", []), acl, required)
    }
    if still_missing:
        raise RuntimeError(f"Capabilities still missing after the update: {still_missing}")
    result["after"] = len(created["capabilities"])
    return result
