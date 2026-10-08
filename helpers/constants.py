"""External IDs and names used across the module, the scripts and the notebooks.

These match the values in modules/psp_integrations/. Change them in both places
if you want the sample to live somewhere else in your project.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# CDF resources
SPACE = "sp_psp_integrations"
RAW_DATABASE = "psp_integrations"
RAW_TABLE = "pump_readings"
INTEGRATION_EXTERNAL_ID = "psp_pump_feed"
WORKFLOW_EXTERNAL_ID = "wf_psp_pump_processing"
WORKFLOW_VERSION = "v1"
TRANSFORMATION_EXTERNAL_IDS = [
    "tr_psp_pump_assets",
    "tr_psp_pump_timeseries",
    "tr_psp_pump_datapoints",
]

# The group the Cognite Toolkit creates for its service principal. Present in
# every sandbox, which is why we extend it rather than create a new one.
TOOLKIT_GROUP_NAME = "cognite_toolkit_service_principal"

# Local "source system"
DATA_DIR = REPO_ROOT / "data"
FEED_CSV = DATA_DIR / "pump_readings.csv"

# The CSV schema. reading_id is the RAW primary key.
CSV_COLUMNS = [
    "reading_id",
    "timestamp",
    "pump_id",
    "flow_rate",
    "pressure",
    "temperature",
    "status",
]

PUMP_IDS = ["PUMP-101", "PUMP-102", "PUMP-103"]

# Metrics that become CogniteTimeSeries, one per pump per metric.
METRICS = ["flow_rate", "pressure", "temperature"]

# Where the extractor remembers the last reading_id it sent (see run-extractor.ps1).
EXTRACTOR_STATE = REPO_ROOT / "extractor" / "state.json"

# The location filter that makes the data show up under "Pump House" in Search.
LOCATION_FILTER_EXTERNAL_ID = "loc_psp_integrations"
