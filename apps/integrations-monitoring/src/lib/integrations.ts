import type { CogniteClient } from '@cognite/sdk';

/**
 * Thin wrappers over the CDF Integrations API.
 *
 * Integrations are in public preview: the REST endpoints take a beta `cdf-version`
 * header, and the typed SDK helpers are still alpha. Calling the endpoints directly
 * keeps this app working regardless of which SDK version is installed.
 */

const BETA_HEADERS = { 'cdf-version': 'beta' };

export const INTEGRATION_EXTERNAL_ID = 'psp_pump_feed';
export const WORKFLOW_EXTERNAL_ID = 'wf_psp_pump_processing';
export const TRANSFORMATION_EXTERNAL_IDS = [
  'tr_psp_pump_assets',
  'tr_psp_pump_timeseries',
  'tr_psp_pump_datapoints',
];

export type Integration = {
  externalId: string;
  name?: string;
  description?: string;
  lastSeen?: number;
  lastConfigRevision?: number;
  allowedNotSeenMinutes?: number;
  extractor?: { externalId: string; version?: string };
  tasks?: { name: string; type?: string; archived?: boolean }[];
};

export type IntegrationError = {
  externalId: string;
  level: 'warning' | 'error' | 'fatal' | string;
  type: string;
  description: string;
  startTime: number;
  endTime?: number;
  task?: string;
};

export type TaskRun = {
  externalId?: string;
  taskName?: string;
  type?: string;
  message?: string;
  startTime?: number;
  endTime?: number;
};

export type TransformationJob = {
  id: number;
  transformationExternalId: string;
  status: string;
  error?: string;
  startedTime?: number;
  finishedTime?: number;
};

export type WorkflowExecution = {
  id: string;
  workflowExternalId: string;
  status: string;
  startTime?: number;
  endTime?: number;
  reasonForIncompletion?: string;
};

function base(client: CogniteClient): string {
  return `/api/v1/projects/${client.project}`;
}

export async function fetchIntegration(client: CogniteClient): Promise<Integration | null> {
  const response = await client.get<{ items: Integration[] }>(`${base(client)}/integrations`, {
    headers: BETA_HEADERS,
  });
  return response.data.items.find((item) => item.externalId === INTEGRATION_EXTERNAL_ID) ?? null;
}

export async function fetchErrors(client: CogniteClient): Promise<IntegrationError[]> {
  const response = await client.get<{ items: IntegrationError[] }>(`${base(client)}/integrations/errors`, {
    headers: BETA_HEADERS,
    params: { integration: INTEGRATION_EXTERNAL_ID, limit: 100 },
  });
  return response.data.items ?? [];
}

export async function fetchTaskRuns(client: CogniteClient): Promise<TaskRun[]> {
  const response = await client.get<{ items: TaskRun[] }>(`${base(client)}/integrations/history`, {
    headers: BETA_HEADERS,
    params: { integration: INTEGRATION_EXTERNAL_ID, limit: 100 },
  });
  return response.data.items ?? [];
}

export async function fetchTransformationJobs(client: CogniteClient): Promise<TransformationJob[]> {
  const perTransformation = await Promise.all(
    TRANSFORMATION_EXTERNAL_IDS.map(async (externalId) => {
      const response = await client.get<{ items: TransformationJob[] }>(
        `${base(client)}/transformations/jobs`,
        { params: { transformationExternalId: externalId, limit: 10 } }
      );
      return response.data.items ?? [];
    })
  );
  return perTransformation
    .flat()
    .sort((a, b) => (b.startedTime ?? 0) - (a.startedTime ?? 0));
}

export async function fetchWorkflowExecutions(client: CogniteClient): Promise<WorkflowExecution[]> {
  const response = await client.post<{ items: WorkflowExecution[] }>(
    `${base(client)}/workflows/executions/list`,
    {
      data: {
        filter: { workflowFilters: [{ externalId: WORKFLOW_EXTERNAL_ID }] },
        limit: 10,
      },
    }
  );
  return response.data.items ?? [];
}

type RawRow = { key: string; columns: Record<string, unknown> };

export type StagedReading = { readingId: string; timestamp: number; pumpId: string };

/**
 * Rows the extractor has staged in RAW. Bucketed by minute these show the feed's
 * pace, which is the whole point of changing it in the notebook.
 */
export async function fetchStagedReadings(client: CogniteClient): Promise<StagedReading[]> {
  const response = await client.get<{ items: RawRow[] }>(
    `${base(client)}/raw/dbs/psp_integrations/tables/pump_readings/rows`,
    { params: { limit: 10000 } }
  );
  return (response.data.items ?? [])
    .map((row) => ({
      readingId: row.key,
      timestamp: Date.parse(String(row.columns.timestamp ?? '')),
      pumpId: String(row.columns.pump_id ?? ''),
    }))
    .filter((reading) => Number.isFinite(reading.timestamp));
}

export type MinuteBucket = { minute: string; readings: number };

/** Group readings into per-minute counts, newest `windowMinutes` first. */
export function bucketByMinute(readings: StagedReading[], windowMinutes = 20): MinuteBucket[] {
  if (readings.length === 0) return [];
  const counts = new Map<number, number>();
  for (const reading of readings) {
    const minute = Math.floor(reading.timestamp / 60_000) * 60_000;
    counts.set(minute, (counts.get(minute) ?? 0) + 1);
  }
  const latest = Math.max(...counts.keys());
  const buckets: MinuteBucket[] = [];
  for (let index = windowMinutes - 1; index >= 0; index -= 1) {
    const minute = latest - index * 60_000;
    buckets.push({
      minute: new Date(minute).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      readings: counts.get(minute) ?? 0,
    });
  }
  return buckets;
}
