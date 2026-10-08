import type { ConnectToHostAppResult, HostAppAPI } from '@cognite/app-sdk';
import { CogniteClient } from '@cognite/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appConfig from '../app.json';
import App from './App';

type AppDeps = NonNullable<ComponentProps<typeof App>['deps']>;

const INTEGRATION = {
  externalId: 'psp_pump_feed',
  name: 'Pump house feed',
  description: 'Reads pump sensor readings from a local CSV.',
  lastConfigRevision: 3,
  extractor: { externalId: 'cognite-db', version: '4.0.0-beta3' },
  tasks: [{ name: 'pump_readings' }],
};

const ACTIVE_ERROR = {
  externalId: 'err-1',
  level: 'error',
  type: 'seen_deadline_missed',
  description: 'Integration did not report checkin for more than 0:05:00.',
  startTime: 1_791_228_750_526,
};

const FAILED_JOB = {
  id: 42,
  transformationExternalId: 'tr_psp_pump_datapoints',
  status: 'Failed',
  error: "Column 'value' was expected to have type Double, but NULL was found.",
  startedTime: 1_791_228_750_526,
};

function stagedRow(key: string, timestamp: string) {
  return { key, columns: { timestamp, pump_id: 'PUMP-101' } };
}

/** Routes the handful of REST calls the dashboard makes. */
function makeDeps(overrides: { integrations?: unknown[]; errors?: unknown[] } = {}): AppDeps {
  const get = vi.fn((url: string) => {
    if (url.endsWith('/integrations')) {
      return Promise.resolve({ data: { items: overrides.integrations ?? [INTEGRATION] } });
    }
    if (url.endsWith('/integrations/errors')) {
      return Promise.resolve({ data: { items: overrides.errors ?? [ACTIVE_ERROR] } });
    }
    if (url.endsWith('/integrations/history')) {
      return Promise.resolve({ data: { items: [{ taskName: 'pump_readings' }] } });
    }
    if (url.includes('/raw/dbs/')) {
      return Promise.resolve({
        data: {
          items: [
            stagedRow('1', '2026-10-05T19:28:24.000+00:00'),
            stagedRow('2', '2026-10-05T19:28:54.000+00:00'),
          ],
        },
      });
    }
    if (url.endsWith('/transformations/jobs')) {
      return Promise.resolve({ data: { items: [FAILED_JOB] } });
    }
    return Promise.resolve({ data: { items: [] } });
  });

  const post = vi.fn(() => Promise.resolve({ data: { items: [] } }));

  return {
    connectToHostApp: vi.fn<AppDeps['connectToHostApp']>(() =>
      Promise.resolve({
        api: {
          getProject: vi.fn<HostAppAPI['getProject']>(() => Promise.resolve('toolkit-test9')),
          getBaseUrl: vi.fn<HostAppAPI['getBaseUrl']>(() => Promise.resolve('https://cognite.test')),
          getAccessToken: vi.fn<HostAppAPI['getAccessToken']>(() => Promise.resolve('test-token')),
          getAppId: vi.fn<HostAppAPI['getAppId']>(() => Promise.resolve('test-app-id')),
        } as Partial<HostAppAPI> as HostAppAPI,
      })
    ),
    createClient: vi.fn<AppDeps['createClient']>((config) => {
      const client = new CogniteClient(config);
      Object.assign(client, { get, post });
      return client;
    }),
  };
}

function makeLoadingDeps(): AppDeps {
  return {
    connectToHostApp: vi.fn<AppDeps['connectToHostApp']>(
      () => new Promise<ConnectToHostAppResult>(() => undefined)
    ),
    createClient: vi.fn<AppDeps['createClient']>((config) => new CogniteClient(config)),
  };
}

function renderApp(deps: AppDeps, connect: () => Promise<unknown> = () => Promise.resolve({})) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App deps={deps} connectToHostApp={connect} />
    </QueryClientProvider>
  );
}

describe('Integrations monitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a loading state while connecting to the host', () => {
    renderApp(makeLoadingDeps(), () => new Promise<never>(() => undefined));
    expect(screen.getByText(/Connecting to Cognite Data Fusion/)).toBeInTheDocument();
  });

  it('shows the integration, its connection details and staged row count', async () => {
    renderApp(makeDeps());

    await waitFor(() => expect(screen.getByText('Pump house feed')).toBeInTheDocument());
    expect(screen.getByText(`v${appConfig.versionTag}`)).toBeInTheDocument();
    expect(screen.getByText('cognite-db 4.0.0-beta3')).toBeInTheDocument();
    expect(screen.getByText('pump_readings')).toBeInTheDocument();
    // Two staged rows were returned by the stubbed RAW endpoint.
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('lists an unresolved integration error as active', async () => {
    renderApp(makeDeps());

    await waitFor(() => expect(screen.getByText('seen_deadline_missed')).toBeInTheDocument());
    expect(screen.getByText(ACTIVE_ERROR.description)).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('1 open error(s)')).toBeInTheDocument();
  });

  it('surfaces the failing downstream transformation and its message', async () => {
    renderApp(makeDeps());

    // The stub answers for each of the three transformations, so the row repeats.
    await waitFor(() => expect(screen.getAllByText('tr_psp_pump_datapoints').length).toBeGreaterThan(0));
    expect(screen.getAllByText(FAILED_JOB.error).length).toBeGreaterThan(0);
  });

  it('reports healthy when there are no open errors', async () => {
    renderApp(makeDeps({ errors: [] }));

    await waitFor(() => expect(screen.getByText('Healthy')).toBeInTheDocument());
    expect(screen.getByText('The integration has not reported any problems.')).toBeInTheDocument();
  });

  it('shows the last 5 errors and expands to more on See more', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...ACTIVE_ERROR,
      externalId: `err-${i}`,
      type: `type_${i}`,
      startTime: 1_791_228_750_526 + i * 1000,
      endTime: 1_791_228_760_526 + i * 1000,
    }));
    renderApp(makeDeps({ errors: many }));

    await waitFor(() => expect(screen.getByText('type_7')).toBeInTheDocument());
    expect(screen.queryByText('type_2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/See more/));
    expect(screen.getByText('type_0')).toBeInTheDocument();
    expect(screen.getByText('Ended')).toBeInTheDocument();
  });

  it('explains what to do when the integration has not been deployed', async () => {
    renderApp(makeDeps({ integrations: [] }));

    await waitFor(() => expect(screen.getByText('Integration not found')).toBeInTheDocument());
  });

  it('hides archived tasks from the Connection card', async () => {
    renderApp(
      makeDeps({
        integrations: [
          {
            ...INTEGRATION,
            tasks: [
              { name: 'probe_query', archived: true },
              { name: 'pump_readings', archived: false },
            ],
          },
        ],
      })
    );

    await waitFor(() => expect(screen.getByText('pump_readings')).toBeInTheDocument());
    expect(screen.queryByText(/probe_query/)).not.toBeInTheDocument();
  });
});
