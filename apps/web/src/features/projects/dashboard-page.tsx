import { Activity, FilePlus2, FlaskConical, FolderOpen, Plus, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { SourceStatusBadge } from '@/components/source-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { useProjects } from './projects-api';

export function DashboardPage() {
  const projects = useProjects();
  return (
    <>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Research Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a project or begin a new epitope prioritization run.
          </p>
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus aria-hidden="true" />
            New Project
          </Link>
        </Button>
      </div>
      {projects.isLoading ? <LoadingState label="Loading research projects" /> : null}
      {projects.isError ? (
        <ErrorState
          message="The local API could not provide the project portfolio."
          onRetry={() => void projects.refetch()}
        />
      ) : null}
      {projects.data ? <DashboardData data={projects.data} /> : null}
    </>
  );
}

function DashboardData({ data }: { data: NonNullable<ReturnType<typeof useProjects>['data']> }) {
  const summary = data.portfolioSummary;
  return (
    <>
      <section aria-label="Portfolio summary" className="grid gap-3 md:grid-cols-3">
        <Metric
          title="Projects"
          value={String(summary.projectCount)}
          note="Research workspace"
          icon={FolderOpen}
        />
        <Metric
          title="Recent runs"
          value={String(summary.recentRunCount)}
          note={`${summary.runCounts.running} running · ${summary.runCounts.completed} complete`}
          icon={Activity}
        />
        <Metric
          title="Connector health"
          value="Healthy · 2 / 3"
          note="GraphBepi using fixture"
          icon={FlaskConical}
        />
      </section>
      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="mb-2 text-sm font-semibold">
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to="/projects/new">
              <Plus aria-hidden="true" />
              New Project
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/projects/new#fasta">
              <FilePlus2 aria-hidden="true" />
              Upload FASTA
            </Link>
          </Button>
          <Button size="sm" variant="outline" disabled={data.items.length === 0}>
            <FolderOpen aria-hidden="true" />
            Open Recent
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/system/diagnostics">
              <Wrench aria-hidden="true" />
              View Diagnostics
            </Link>
          </Button>
        </div>
      </section>
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Latest activity and prediction provenance.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.items.length === 0 ? (
            <EmptyState
              title="No projects yet"
              message="Create a project and upload one protein FASTA record to begin."
              action={
                <Button asChild>
                  <Link to="/projects/new">Create project</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Organism / protein</TableHead>
                  <TableHead>Latest run</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((project) => (
                  <TableRow key={project.id}>
                    <TableCell>
                      <Link
                        className="font-medium text-primary hover:underline"
                        to={`/projects/${project.id}`}
                      >
                        {project.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {[project.organism, project.proteinName].filter(Boolean).join(' · ') ||
                        'Not specified'}
                    </TableCell>
                    <TableCell>
                      <RunStatusIndicator status={project.latestRun?.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {project.sourceMix.map((source) => (
                          <SourceStatusBadge key={source} status={source} />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                        new Date(project.updatedAt),
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RunStatusIndicator({ status }: { status: string | null | undefined }) {
  if (!status) return <Badge variant="outline">No runs</Badge>;

  const normalized = status.toUpperCase();
  const isActive = normalized === 'QUEUED' || normalized === 'RUNNING';
  const label =
    normalized === 'QUEUED'
      ? 'Queued'
      : normalized === 'RUNNING'
        ? 'Running'
        : normalized === 'COMPLETED'
          ? 'Complete'
          : normalized === 'FAILED'
            ? 'Failed'
            : normalized === 'CANCELLED'
              ? 'Cancelled'
              : normalized
                  .toLowerCase()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (character) => character.toUpperCase());

  const variant =
    normalized === 'RUNNING'
      ? 'running'
      : normalized === 'QUEUED'
        ? 'partial'
        : normalized === 'COMPLETED'
          ? 'live'
          : normalized === 'FAILED'
            ? 'failed'
            : 'outline';

  return (
    <div className="grid gap-1">
      <Badge variant={variant}>
        <span
          aria-hidden="true"
          className={
            isActive
              ? 'size-2 rounded-full bg-current animate-pulse'
              : 'size-2 rounded-full bg-current'
          }
        />
        {label}
      </Badge>
      {isActive ? (
        <span className="text-xs text-muted-foreground">
          {normalized === 'QUEUED' ? 'Waiting to start' : 'Still running'}
        </span>
      ) : null}
    </div>
  );
}

function Metric({
  title,
  value,
  note,
  icon: Icon,
}: {
  title: string;
  value: string;
  note: string;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="mt-1 text-2xl">{value}</CardTitle>
        </div>
        <Icon aria-hidden="true" className="text-primary" />
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  );
}
