"""Run the Cognite Toolkit (`cdf build` + `cdf deploy`) from a notebook."""

import os
import subprocess
import sys
from pathlib import Path

from helpers.constants import REPO_ROOT


def _cdf(*args: str) -> subprocess.CompletedProcess:
    # The `cdf` script sits next to the interpreter, so this uses the same environment as the
    # notebook kernel without needing the virtual environment to be activated.
    script = Path(sys.executable).parent / ("cdf.exe" if os.name == "nt" else "cdf")
    # The Toolkit prints box-drawing characters, which crash it on Windows consoles that
    # default to a legacy code page unless output is forced to UTF-8.
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "NO_COLOR": "1"}
    return subprocess.run(
        [str(script), *args],
        cwd=REPO_ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )


def build_and_deploy(environment: str = "dev") -> None:
    """Build the module and deploy it, printing only the deploy summary. Raises on failure."""
    print(f"Running: cdf build --env {environment}")
    build = _cdf("build", "--env", environment)
    if build.returncode != 0:
        print(build.stdout + build.stderr)
        raise RuntimeError("cdf build failed - see the output above.")

    print("Running: cdf deploy")
    deploy = _cdf("deploy")
    if deploy.returncode != 0:
        print(deploy.stdout + deploy.stderr)
        raise RuntimeError("cdf deploy failed - see the output above.")

    output = deploy.stdout
    start = output.find("Deploy summary")
    print(output[max(0, output.rfind("\n", 0, start)) :].strip() if start != -1 else output.strip())
