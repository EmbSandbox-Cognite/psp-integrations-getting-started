import { connectToHostApp as connectToHostAppImpl } from '@cognite/app-sdk';
import { CogniteSdkProvider, useCogniteSdk } from '@cognite/app-sdk/react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@cognite/aura/chart';
import { Alert, AlertDescription } from '@cognite/aura/components/alert';
// Import per-component, not from the `@cognite/aura/components` barrel: the barrel
// pulls in Aura's whole dependency graph, which slows the build.
import { Badge } from '@cognite/aura/components/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@cognite/aura/components/card';
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from '@cognite/aura/components/empty-state';
import { Loader } from '@cognite/aura/components/loader';
import { Separator } from '@cognite/aura/components/separator';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import appConfig from '../app.json';

import {
  bucketByMinute,
  fetchErrors,
  fetchIntegration,
  fetchStagedReadings,
  fetchTaskRuns,
  fetchTransformationJobs,
  fetchWorkflowExecutions,
  INTEGRATION_EXTERNAL_ID,
} from './lib/integrations';

const REFRESH_MS = 15_000;
const ERRORS_COLLAPSED = 5;
const ERRORS_EXPANDED = 50;

const loadingFallback = (
  <main className="min-h-screen bg-muted/50 p-8">
    <div className="mx-auto inline-flex items-center gap-3 text-muted-foreground">
      <Loader size={20} />
      <span>Connecting to Cognite Data Fusion...</span>
    </div>
  </main>
);

const errorFallback = (
  <main className="min-h-screen bg-muted/50 p-8">
    <Alert>
      <AlertDescription>Failed to connect to Fusion host</AlertDescription>
    </Alert>
  </main>
);

function formatTime(value?: number) {
  return value ? new Date(value).toLocaleString() : '-';
}

/** Status colours are reserved for state and always ship with a label, never colour alone. */
function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  if (['completed', 'success', 'succeeded', 'ok'].includes(normalized)) {
    return <Badge variant="success">{status}</Badge>;
  }
  if (['failed', 'failure', 'fatal', 'error'].includes(normalized)) {
    return <Badge variant="error">{status}</Badge>;
  }
  if (['running', 'in_progress', 'created'].includes(normalized)) {
    return <Badge variant="inProgress">{status}</Badge>;
  }
  if (normalized === 'warning') return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="gray">{status}</Badge>;
}

function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

const chartConfig = {
  readings: {
    label: 'Readings staged',
    // An Aura chart token, so the series re-themes with light/dark automatically.
    color: 'var(--color-chart-aurora-color-1)',
  },
} satisfies ChartConfig;

function Dashboard() {
  const client = useCogniteSdk();
  const [showAllErrors, setShowAllErrors] = useState(false);
  const options = { refetchInterval: REFRESH_MS };

  const integration = useQuery({
    queryKey: ['integration'],
    queryFn: () => fetchIntegration(client),
    ...options,
  });
  const errors = useQuery({ queryKey: ['errors'], queryFn: () => fetchErrors(client), ...options });
  const taskRuns = useQuery({ queryKey: ['taskRuns'], queryFn: () => fetchTaskRuns(client), ...options });
  const readings = useQuery({
    queryKey: ['readings'],
    queryFn: () => fetchStagedReadings(client),
    ...options,
  });
  const jobs = useQuery({
    queryKey: ['jobs'],
    queryFn: () => fetchTransformationJobs(client),
    ...options,
  });
  const executions = useQuery({
    queryKey: ['executions'],
    queryFn: () => fetchWorkflowExecutions(client),
    ...options,
  });

  if (integration.isLoading) return loadingFallback;

  if (integration.isError) {
    return (
      <main className="min-h-screen bg-muted/50 p-8">
        <Alert variant="error">
          <AlertDescription>
            Could not read integrations. Check that your user has the <code>integrations:read</code> capability
            and that Integrations is enabled on this project.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (!integration.data) {
    return (
      <main className="min-h-screen bg-muted/50 p-8">
        <EmptyState>
          <EmptyStateTitle>Integration not found</EmptyStateTitle>
          <EmptyStateDescription>
            No integration with external ID "{INTEGRATION_EXTERNAL_ID}". Run cdf deploy first.
          </EmptyStateDescription>
        </EmptyState>
      </main>
    );
  }

  const openErrors = (errors.data ?? []).filter((error) => !error.endTime);
  const sortedErrors = [...(errors.data ?? [])]
    .sort((a, b) => b.startTime - a.startTime)
    .slice(0, ERRORS_EXPANDED);
  const visibleErrors = showAllErrors ? sortedErrors : sortedErrors.slice(0, ERRORS_COLLAPSED);
  const buckets = bucketByMinute(readings.data ?? []);
  const failedJobs = (jobs.data ?? []).filter((job) => job.status.toLowerCase() === 'failed');
  // Archived tasks are ones that stopped checking in - e.g. a query renamed or
  // removed from the config. Hide them; an active task list should reflect what
  // the extractor is doing now, not its history.
  const tasks = (integration.data.tasks ?? []).filter((task) => !task.archived);

  return (
    <main className="min-h-screen bg-muted/50 text-foreground">
      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-3xl font-semibold">{integration.data.name ?? INTEGRATION_EXTERNAL_ID}</h1>
              <span className="text-sm text-muted-foreground">v{appConfig.versionTag}</span>
            </div>
            <p className="text-muted-foreground">{integration.data.description}</p>
          </div>
          {openErrors.length > 0 ? (
            <Badge variant="error">{openErrors.length} open error(s)</Badge>
          ) : (
            <Badge variant="success">Healthy</Badge>
          )}
        </header>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Readings staged" value={(readings.data ?? []).length} hint="rows in CDF RAW" />
          <StatTile label="Task runs" value={(taskRuns.data ?? []).length} hint="reported by the extractor" />
          <StatTile label="Open errors" value={openErrors.length} hint={`${(errors.data ?? []).length} total`} />
          <StatTile
            label="Failed runs"
            value={failedJobs.length}
            hint="downstream transformations"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Feed pace</CardTitle>
            <CardDescription>
              Readings staged per minute. Change the pace in integrations_tutorial.ipynb and the bars follow.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {buckets.length === 0 ? (
              <EmptyState>
                <EmptyStateTitle>Nothing staged yet</EmptyStateTitle>
                <EmptyStateDescription>
                  Start the feed in the notebook and make sure the DB extractor is running.
                </EmptyStateDescription>
              </EmptyState>
            ) : (
              <ChartContainer config={chartConfig} aria-label="Readings staged per minute" className="h-64 w-full">
                <BarChart data={buckets} margin={{ left: 4, right: 4, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="minute" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="readings" fill="var(--color-readings)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Connection</CardTitle>
            <CardDescription>What the extractor has reported to CDF.</CardDescription>
          </CardHeader>
          <CardContent className="flex w-full flex-col gap-2 text-sm">
            {/* CardContent is `items-start`, which shrink-wraps each child to its
                content width - `w-full` is required on every row or `justify-between`
                has no room to push the value to the right edge. */}
            <div className="flex w-full justify-between gap-4">
              <span className="text-muted-foreground">Extractor</span>
              <span>
                {integration.data.extractor?.externalId}
                {integration.data.extractor?.version ? ` ${integration.data.extractor.version}` : ''}
              </span>
            </div>
            <Separator />
            <div className="flex w-full justify-between gap-4">
              <span className="text-muted-foreground">Config revision</span>
              <span>{integration.data.lastConfigRevision ?? '-'}</span>
            </div>
            <Separator />
            <div className="flex w-full justify-between gap-4">
              <span className="text-muted-foreground">Tasks</span>
              <span className="text-right">
                {tasks.length > 0 ? tasks.map((task) => task.name).join(', ') : 'none reported yet'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Errors</CardTitle>
            <CardDescription>
              Structured errors from the integration, newest first. An error without an end time is still active.
            </CardDescription>
          </CardHeader>
          <CardContent className="w-full">
            {sortedErrors.length === 0 ? (
              <EmptyState>
                <EmptyStateTitle>No errors</EmptyStateTitle>
                <EmptyStateDescription>The integration has not reported any problems.</EmptyStateDescription>
              </EmptyState>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[72px]" />
                    <col className="w-[150px]" />
                    <col />
                    <col className="w-[160px]" />
                    <col className="w-[160px]" />
                    <col className="w-[88px]" />
                  </colgroup>
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Level</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Started</th>
                      <th className="px-3 py-2 font-medium">Ended</th>
                      <th className="px-3 py-2 font-medium">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleErrors.map((error) => (
                      <tr key={error.externalId} className="border-t border-border align-top">
                        <td className="px-3 py-3">
                          <StatusBadge status={error.level} />
                        </td>
                        <td className="px-3 py-3 break-words">
                          <code>{error.type}</code>
                        </td>
                        <td className="px-3 py-3 break-words">{error.description}</td>
                        <td className="px-3 py-3">{formatTime(error.startTime)}</td>
                        <td className="px-3 py-3">{formatTime(error.endTime)}</td>
                        <td className="px-3 py-3">
                          {error.endTime ? (
                            <Badge variant="gray">resolved</Badge>
                          ) : (
                            <Badge variant="error">active</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {sortedErrors.length > ERRORS_COLLAPSED ? (
              <button
                type="button"
                className="mt-3 text-sm font-medium text-primary hover:underline"
                onClick={() => setShowAllErrors((open) => !open)}
              >
                {showAllErrors ? 'Show fewer' : `See more (last ${sortedErrors.length})`}
              </button>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Downstream</CardTitle>
            <CardDescription>
              The workflow that turns staged rows into the data model. Bad data fails here, not in the extractor.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex w-full flex-col gap-6">
            <div className="w-full">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Recent workflow executions</h3>
              {(executions.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No executions yet.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {(executions.data ?? []).slice(0, 5).map((execution) => (
                    <li key={execution.id} className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={execution.status} />
                      <span className="text-muted-foreground">{formatTime(execution.startTime)}</span>
                      {execution.reasonForIncompletion ? (
                        <span className="text-muted-foreground">{execution.reasonForIncompletion}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            <div className="w-full">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Recent transformation runs</h3>
              {(jobs.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-sm">
                  {(jobs.data ?? []).slice(0, 8).map((job) => (
                    <li key={job.id} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <StatusBadge status={job.status} />
                        <code>{job.transformationExternalId}</code>
                        <span className="text-muted-foreground">{formatTime(job.startedTime)}</span>
                      </div>
                      {job.error ? (
                        <Alert variant="error">
                          <AlertDescription>{job.error}</AlertDescription>
                        </Alert>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

type AppProps = {
  deps?: ComponentProps<typeof CogniteSdkProvider>['deps'];
  connectToHostApp?: () => Promise<unknown>;
};

function App({ deps, connectToHostApp = deps?.connectToHostApp ?? connectToHostAppImpl }: AppProps) {
  const [, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void connectToHostApp().then(() => {
      if (!cancelled) setConnected(true);
    });
    return () => {
      cancelled = true;
    };
  }, [connectToHostApp]);

  return (
    <CogniteSdkProvider loadingFallback={loadingFallback} errorFallback={errorFallback} deps={deps}>
      <Dashboard />
    </CogniteSdkProvider>
  );
}

export default App;
