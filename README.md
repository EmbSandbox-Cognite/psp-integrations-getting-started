# Getting Started with Integrations

An end-to-end Cognite Data Fusion **Integration**: a local extractor feeds data in continuously, you watch it in monitoring, break it on purpose, and fix it from the cloud.

## What it does

A pretend pump house writes sensor readings to a CSV file. The **Cognite DB extractor** reads that file every 15 seconds and sends the new rows to CDF. A workflow turns them into assets and time series in the Core Data Model, which you can browse in **Search**.

You drive all of it from one notebook, which also breaks things on purpose so you can see what a healthy integration looks like and what its failures look like in monitoring: bad data that the extractor cannot read, and a bad extractor configuration published from the cloud and repaired the same way. A small Flows app shows the integration's health, throughput and errors on one page.

## Prerequisites

- Windows, because the extractor runs as a Windows executable
- Python 3.11 or newer, and [uv](https://docs.astral.sh/uv/)
- Node.js 20.19 or newer (only for the monitoring app)
- A CDF project with **Integrations** enabled. It is in public preview: if **Integrate → Integrations** is missing in Fusion, ask Cognite Support to enable it
- A service principal that belongs to the group `cognite_toolkit_service_principal`, created by the Cognite Toolkit

## How to use

1. Clone this repo and open it.
2. Install dependencies, including the notebook kernel:

   ```bash
   uv sync
   ```

3. Copy the `.env` file from your sandbox image repo into the root of this repo. See [Configuration](#configuration).
4. Open `notebooks/integrations_tutorial.ipynb` and select the `.venv` kernel.
5. Run the cells in order. The notebook grants the permissions, deploys everything, has you deploy the monitoring app (`.\deploy-app.ps1`, Step 4) so you can watch from the start, and walks you through starting the extractor. After each step, follow its **Verify in Cognite Data Fusion** notes, which cover Fusion and the monitoring app.
6. When you are done, run `notebooks/cleanup.ipynb`. It deletes nothing until you type `YES` in the box that pops up.

## Configuration

The `.env` file holds your project and the service principal that the notebooks, the Toolkit and the extractor use. It comes from your sandbox image repo and is never committed. If you do not have one, copy `.env.example` to `.env` and fill in the values.

| Setting | Where | Description |
|---|---|---|
| CDF project and service principal | `.env` | Used by the notebooks, the Toolkit, the extractor and `deploy-app.ps1`. |

The extractor's own settings (which file to read, the query, the schedule) live in `modules/psp_integrations/integrations/psp_pump_feed.IntegrationConfig.yaml`. The comments there explain the settings that are easy to get wrong.

## Known limitations

- Integrations is in public preview and the Toolkit's integration resources are behind an alpha flag (`integrations = true` in `cdf.toml`). Screens and APIs may change.
- The extractor runs on your machine. Nothing arrives while it is stopped.
- The workflow runs every 5 minutes, because CDF has no trigger that fires on new RAW rows.
- `deploy-app.ps1` deploys the monitoring app so you can open it from the link it prints. Activating it in the **Custom apps** dashboard needs signatures from a certified Flows developer and a certified app: see [Builder certification](https://docs.cognite.com/cdf/flows/guides/builder-certification) and [Application certification](https://docs.cognite.com/cdf/flows/guides/application-certification).
