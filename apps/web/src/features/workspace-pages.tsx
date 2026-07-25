import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState } from '@/components/page-state';
import { SourceStatusBadge } from '@/components/source-status-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import {
  useArtifacts,
  useApproveConfiguration,
  useApproveShortlist,
  useCandidate,
  useCandidates,
  useCancelRun,
  useCompareCandidates,
  useCoverageVisualization,
  useCreateProject,
  useCreateReport,
  useCreateRun,
  useDiagnostics,
  useEvidence,
  useProject,
  useRun,
  useSequenceMap,
  useShortlistOptimization,
  useStartRun,
  useWorkflow,
} from './data-hooks';
import { candidateListParams } from './candidate-query';
import { createRunConfigurationInput, createShortlistApprovalInput } from './workflow-actions';
import { GraphCanvas } from './graph-canvas';
import { sequenceSegmentGeometry } from './sequence-geometry';

const id = (value: string | undefined) => value ?? '';
const heading = (title: string, description: string) => (
  <div>
    <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
  </div>
);

const projectNameSuggestions = ['Dengue demo run', 'Influenza demo run', 'COVID spike demo'];

const organismSuggestions = ['Dengue virus', 'Influenza A virus', 'SARS-CoV-2'];

const proteinNameSuggestions = ['Envelope protein', 'Hemagglutinin', 'Spike glycoprotein'];

const mhciAlleleSuggestions = ['HLA-A*02:01', 'HLA-A*24:02', 'HLA-B*07:02'];
const mhciiAlleleSuggestions = ['HLA-DRB1*04:01', 'HLA-DRB1*07:01', 'HLA-DQB1*03:01'];
const peptideLengthSuggestions = ['8, 9, 10, 11', '9, 10', '15'];
const populationSuggestions = [
  'synthetic-population-alpha, synthetic-population-beta',
  'synthetic-population-gamma',
  'global-population-demo',
];
const versionSuggestions = ['mvp-v1.0'];

const approvedFixturePresets = {
  custom: null,
  'covid-spike': {
    name: 'COVID spike demo',
    organism: 'Synthetic demonstration',
    proteinName: 'Synthetic spike-style demo protein',
    description:
      'Approved synthetic demonstration fixture. Use fixture-only execution for a passing offline revision.',
    fasta:
      '>SYNTHETIC_DEMO covid-spike UI scenario; not a pathogen reference sequence\nACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWYACDEFGHIKLMNPQRSTVWY',
  },
  influenza: {
    name: 'Influenza demo',
    organism: 'Synthetic demonstration',
    proteinName: 'Synthetic HA-style demo protein',
    description:
      'Approved synthetic demonstration fixture. Use fixture-only execution for a passing offline revision.',
    fasta:
      '>SYNTHETIC_DEMO influenza UI scenario; not a pathogen reference sequence\nYWVTSRQPNMLKIHGFEDCAYWVTSRQPNMLKIHGFEDCAYWVTSRQPNMLKIHGFEDCA',
  },
  dengue: {
    name: 'Dengue demo',
    organism: 'Synthetic demonstration',
    proteinName: 'Synthetic envelope-style demo protein',
    description:
      'Approved synthetic demonstration fixture. Use fixture-only execution for a passing offline revision.',
    fasta:
      '>SYNTHETIC_DEMO dengue UI scenario; not a pathogen reference sequence\nMKTAYIAKQRQISFVKSHFSMKTAYIAKQRQISFVKSHFSMKTAYIAKQRQISFVKSHFS',
  },
} as const;

function SuggestedTextField({
  id,
  label,
  name,
  suggestions,
  defaultValue,
  value,
  onChange,
  required = true,
  placeholder,
  helper,
}: {
  id: string;
  label: string;
  name: string;
  suggestions: readonly string[];
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  helper?: string;
}) {
  const listId = `${id}-suggestions`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        defaultValue={defaultValue}
        id={id}
        list={listId}
        name={name}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
      {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
    </Field>
  );
}

export function CreateProjectPage() {
  const create = useCreateProject();
  const navigate = useNavigate();
  const [preset, setPreset] = useState<keyof typeof approvedFixturePresets>('custom');
  const [name, setName] = useState('');
  const [organism, setOrganism] = useState('');
  const [proteinName, setProteinName] = useState('');
  const [description, setDescription] = useState('');
  const [fasta, setFasta] = useState('');

  const applyPreset = (value: keyof typeof approvedFixturePresets) => {
    setPreset(value);
    const selected = approvedFixturePresets[value];
    if (selected === null) return;
    setName(selected.name);
    setOrganism(selected.organism);
    setProteinName(selected.proteinName);
    setDescription(selected.description);
    setFasta(selected.fasta);
  };

  return (
    <>
      {heading('Create Project', 'Register one protein FASTA record for a reproducible analysis.')}
      <Card>
        <CardHeader>
          <CardTitle>Project and protein</CardTitle>
          <CardDescription>The API performs authoritative FASTA validation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(
                {
                  name,
                  organism,
                  proteinName,
                  description,
                  fasta,
                },
                { onSuccess: (result) => navigate(`/projects/${result.project.id}`) },
              );
            }}
          >
            <Field>
              <FieldLabel htmlFor="fixture-preset">Demo fixture preset</FieldLabel>
              <Select
                value={preset}
                onValueChange={(value) => applyPreset(value as keyof typeof approvedFixturePresets)}
              >
                <SelectTrigger id="fixture-preset">
                  <SelectValue placeholder="Choose a preset or keep custom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="custom">Custom input</SelectItem>
                    <SelectItem value="covid-spike">Approved COVID spike demo</SelectItem>
                    <SelectItem value="influenza">Approved influenza demo</SelectItem>
                    <SelectItem value="dengue">Approved dengue demo</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose an approved demo fixture if you want a path to a passing offline revision.
                You can still edit any field after selecting it.
              </p>
            </Field>
            <FieldGroup>
              <SuggestedTextField
                id="name"
                label="Project name"
                name="name"
                suggestions={projectNameSuggestions}
                placeholder="e.g. Dengue demo run"
                value={name}
                onChange={(value) => {
                  setPreset('custom');
                  setName(value);
                }}
              />
              <SuggestedTextField
                id="organism"
                label="Organism"
                name="organism"
                suggestions={organismSuggestions}
                placeholder="e.g. Dengue virus"
                value={organism}
                onChange={(value) => {
                  setPreset('custom');
                  setOrganism(value);
                }}
              />
              <SuggestedTextField
                id="proteinName"
                label="Protein name"
                name="proteinName"
                suggestions={proteinNameSuggestions}
                placeholder="e.g. Envelope protein"
                value={proteinName}
                onChange={(value) => {
                  setPreset('custom');
                  setProteinName(value);
                }}
              />
              <Field>
                <FieldLabel htmlFor="description">Description</FieldLabel>
                <Textarea
                  id="description"
                  name="description"
                  value={description}
                  onChange={(event) => {
                    setPreset('custom');
                    setDescription(event.currentTarget.value);
                  }}
                />
              </Field>
              <Field id="fasta">
                <FieldLabel htmlFor="fasta-file">Import FASTA file (optional)</FieldLabel>
                <Input
                  accept=".fasta,.fa,.faa,text/plain"
                  aria-describedby="fasta-file-help"
                  id="fasta-file"
                  type="file"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) {
                      setPreset('custom');
                      void file.text().then(setFasta);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground" id="fasta-file-help">
                  Choose a local FASTA file or paste the exact record below. The browser does not
                  alter sequence text.
                </p>
                <FieldLabel htmlFor="fasta-input">Protein FASTA</FieldLabel>
                <Textarea
                  className="min-h-48 font-mono"
                  id="fasta-input"
                  name="fasta"
                  required
                  value={fasta}
                  onChange={(event) => {
                    setPreset('custom');
                    setFasta(event.currentTarget.value);
                  }}
                />
              </Field>
            </FieldGroup>
            {create.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Project could not be created</AlertTitle>
                <AlertDescription>{create.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button disabled={create.isPending} type="submit">
              {create.isPending ? 'Validating…' : 'Create project'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

export function ProjectPage() {
  const projectId = id(useParams().projectId);
  const query = useProject(projectId);
  if (query.isLoading) return <LoadingState label="Loading project" />;
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const { project, protein, runs } = query.data;
  return (
    <>
      {heading(project.name, 'Project overview and immutable protein input.')}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Protein input</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <strong>Organism:</strong> {project.organism ?? 'Not specified'}
            </p>
            <p>
              <strong>Protein:</strong> {project.proteinName ?? 'Not specified'}
            </p>
            <p>
              <strong>Header:</strong> {protein.header}
            </p>
            <p>
              <strong>Length:</strong> {protein.length} aa
            </p>
            <code className="break-all rounded bg-muted p-2">{protein.sha256}</code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to={`/projects/${projectId}/settings`}>
                <Play aria-hidden="true" />
                New analysis
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Run revisions</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <EmptyState
              title="No runs"
              message="Configure and approve the first analysis revision."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quality</TableHead>
                  <TableHead>Sources</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <Link className="text-primary hover:underline" to={`/runs/${run.id}`}>
                        Revision {run.revision}
                      </Link>
                    </TableCell>
                    <TableCell>{run.status}</TableCell>
                    <TableCell>{run.quality ?? 'Pending'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {run.sourceMix.map((source) => (
                          <SourceStatusBadge key={source} status={source} />
                        ))}
                      </div>
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

export function ProjectSettingsPage() {
  const projectId = id(useParams().projectId);
  const createRun = useCreateRun(projectId);
  const approve = useApproveConfiguration(createRun.data?.id ?? '');
  const [approvalNote, setApprovalNote] = useState('');
  const navigate = useNavigate();
  return (
    <>
      {heading('Project Settings', 'Configure a new immutable run revision for this project.')}
      <Alert>
        <FlaskConical aria-hidden="true" />
        <AlertTitle>GraphBepi fixture only in MVP</AlertTitle>
        <AlertDescription>
          B-cell analysis uses an approved deterministic fixture and always displays its provenance.
        </AlertDescription>
      </Alert>
      <form
        className="grid gap-4 lg:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const values = new FormData(event.currentTarget);
          createRun.mutate(
            createRunConfigurationInput({
              mhciAlleles: String(values.get('mhciAlleles')),
              mhciLengths: String(values.get('mhciLengths')),
              mhciiAlleles: String(values.get('mhciiAlleles')),
              mhciiLengths: String(values.get('mhciiLengths')),
              populations: String(values.get('populations')),
              enableMhcflurry: values.get('enableMhcflurry') === 'on',
              enableBcell: values.get('enableBcell') === 'on',
              fallbackPolicy: String(values.get('fallbackPolicy')),
              requestedExecutionMode: String(values.get('requestedExecutionMode')) as
                'AUTO' | 'LIVE' | 'SYNTHETIC' | 'FIXTURE',
              ruleProfileVersion: String(values.get('ruleProfileVersion')),
              rankingProfileVersion: String(values.get('rankingProfileVersion')),
            }),
          );
        }}
      >
        <ConfigurationCard title="MHC-I" description="Comma-separated alleles and lengths.">
          <SuggestedTextField
            id="mhci-alleles"
            label="Alleles"
            name="mhciAlleles"
            suggestions={mhciAlleleSuggestions}
            defaultValue="HLA-A*02:01"
            helper="Pick a common allele or type another comma-separated set."
          />
          <SuggestedTextField
            id="mhci-lengths"
            label="Peptide lengths"
            name="mhciLengths"
            suggestions={peptideLengthSuggestions}
            defaultValue="9, 10"
            helper="You can type your own comma-separated lengths too."
          />
          <label className="flex items-start gap-2 text-sm">
            <input name="enableMhcflurry" type="checkbox" />
            <span>
              Enable local MHCflurry MHC-I live predictor
              <span className="block text-xs text-muted-foreground">
                Requires `MHCFLURRY_ENABLED=true` and an installed `mhcflurry-predict-scan`
                executable.
              </span>
            </span>
          </label>
        </ConfigurationCard>
        <ConfigurationCard title="MHC-II" description="Comma-separated alleles and lengths.">
          <SuggestedTextField
            id="mhcii-alleles"
            label="Alleles"
            name="mhciiAlleles"
            suggestions={mhciiAlleleSuggestions}
            defaultValue="HLA-DRB1*04:01"
            helper="Choose a known allele or type a custom comma-separated list."
          />
          <SuggestedTextField
            id="mhcii-lengths"
            label="Peptide lengths"
            name="mhciiLengths"
            suggestions={peptideLengthSuggestions}
            defaultValue="15"
            helper="MHC-II often uses longer peptides; custom values are allowed."
          />
        </ConfigurationCard>
        <ConfigurationCard title="Population coverage" description="Coverage populations.">
          <SuggestedTextField
            id="populations"
            label="Population IDs"
            name="populations"
            suggestions={populationSuggestions}
            defaultValue="synthetic-population-alpha, synthetic-population-beta"
            helper="Type one or more IDs separated by commas, or enter your own research population IDs."
          />
        </ConfigurationCard>
        <ConfigurationCard
          title="Profiles and constraints"
          description="Immutable file-backed profiles; definitions are not stored in SQLite."
        >
          <SuggestedTextField
            id="rule-profile"
            label="Rule profile version"
            name="ruleProfileVersion"
            suggestions={versionSuggestions}
            defaultValue="mvp-v1.0"
            helper="Use the approved profile version, or type another registered version."
          />
          <SuggestedTextField
            id="ranking-profile"
            label="Ranking profile version"
            name="rankingProfileVersion"
            suggestions={versionSuggestions}
            defaultValue="mvp-v1.0"
            helper="Use the default ranking profile or enter a different version string."
          />
        </ConfigurationCard>
        <ConfigurationCard title="Execution policy" description="Live, cache, and fixture order.">
          <Field>
            <FieldLabel htmlFor="execution-mode">Requested execution mode</FieldLabel>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              defaultValue="AUTO"
              id="execution-mode"
              name="requestedExecutionMode"
            >
              <option value="AUTO">Auto — live first, controlled fallback</option>
              <option value="LIVE">Live scientific predictors only</option>
              <option value="SYNTHETIC">Offline synthetic demonstration only</option>
              <option value="FIXTURE">Exact approved fixture replay only</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="fallback-policy">Fallback policy</FieldLabel>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              defaultValue="CACHE_THEN_LIVE_THEN_FIXTURE"
              id="fallback-policy"
              name="fallbackPolicy"
            >
              <option value="CACHE_THEN_LIVE_THEN_FIXTURE">Cache → live → fixture</option>
              <option value="LIVE_THEN_CACHE_THEN_FIXTURE">Live → cache → fixture</option>
              <option value="FIXTURE_ONLY">Fixture only</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input name="enableBcell" type="checkbox" />
            Enable B-cell GraphBepi fixture track
          </label>
        </ConfigurationCard>
        <ConfigurationCard
          title="Output preferences"
          description="Frozen reproducibility package for MVP v1.0."
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">JSON</Badge>
            <Badge variant="outline">CSV</Badge>
            <Badge variant="outline">Evidence graph</Badge>
            <Badge variant="outline">Workflow trace</Badge>
          </div>
        </ConfigurationCard>
        {createRun.isError ? (
          <Alert className="lg:col-span-2" variant="destructive">
            <AlertTitle>Draft could not be created</AlertTitle>
            <AlertDescription>{createRun.error.message}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-between gap-3 lg:col-span-2">
          <Button asChild variant="outline">
            <Link to={`/projects/${projectId}`}>Back to project</Link>
          </Button>
          <Button disabled={createRun.isPending} type="submit">
            {createRun.isPending ? 'Creating draft…' : 'Create configuration draft'}
          </Button>
        </div>
      </form>
      {createRun.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Approve configuration snapshot</CardTitle>
            <CardDescription>
              Review and approve hash {createRun.data.configurationHash.slice(0, 12)}… to make this
              revision immutable and queue it.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Input
              aria-label="Configuration approval note"
              placeholder="Optional review note"
              value={approvalNote}
              onChange={(event) => setApprovalNote(event.currentTarget.value)}
            />
            {approve.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Approval failed</AlertTitle>
                <AlertDescription>{approve.error.message}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              disabled={approve.isPending}
              onClick={() => {
                const note = approvalNote.trim();
                approve.mutate(
                  {
                    expectedConfigurationHash: createRun.data.configurationHash,
                    ...(note ? { note } : {}),
                  },
                  { onSuccess: (run) => navigate(`/runs/${run.id}`) },
                );
              }}
            >
              {approve.isPending ? 'Approving…' : 'Approve configuration and queue'}
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
function ConfigurationCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function RunPage() {
  const runId = id(useParams().runId);
  const query = useRun(runId);
  const start = useStartRun(runId);
  const cancel = useCancelRun(runId);
  if (query.isLoading) return <LoadingState label="Loading run" />;
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const run = query.data;
  const active = run.status === 'QUEUED' || run.status === 'RUNNING';
  const failed = run.status === 'FAILED';
  const executionMode = run.executionMode ?? (failed ? 'Failed before execution' : 'Pending');
  const runQuality = run.quality ?? (failed ? 'Failed before execution' : 'Pending');
  return (
    <>
      {heading(
        `Run revision ${run.revision}`,
        'Lifecycle, quality, approvals, and connector provenance.',
      )}{' '}
      {run.executionMode === 'SYNTHETIC' || run.executionMode === 'HYBRID' ? (
        <Alert className="border-fixture-border bg-fixture">
          <FlaskConical aria-hidden="true" />
          <AlertTitle>OFFLINE SYNTHETIC DEMONSTRATION — NOT SCIENTIFIC OUTPUT</AlertTitle>
          <AlertDescription>
            Binding or coverage values in this run were generated by deterministic offline
            demonstration tools. scientificUse = false. Do not interpret these values as validated
            biological predictions.
          </AlertDescription>
        </Alert>
      ) : run.quality === 'FIXTURE_ONLY' ||
        run.connectors.some((item) => item.sourceStatus === 'FIXTURE') ? (
        <Alert>
          <FlaskConical aria-hidden="true" />
          <AlertTitle>Fixture-backed evidence</AlertTitle>
          <AlertDescription>This run includes deterministic demo fixture results.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Status" value={run.status} loading={active} />
        <Stat label="Execution mode" value={executionMode} loading={active} />
        <Stat label="Run quality" value={runQuality} loading={active} />
        <Stat
          label="Stages"
          value={`${run.stageProgress.filter((stage) => stage.status === 'SUCCEEDED').length} / ${run.stageProgress.length}`}
          loading={active}
        />
      </div>
      {failed ? (
        <Alert variant="destructive">
          <FlaskConical aria-hidden="true" />
          <AlertTitle>Run failed before completion</AlertTitle>
          <AlertDescription>
            The workflow did not complete, so execution mode and run quality were never finalized.
            This is expected when the workflow backend is unavailable or the run cannot start.
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Connector status</CardTitle>
        </CardHeader>
        <CardContent>
          {run.connectors.length === 0 ? (
            <EmptyState
              title="No connector records yet"
              message={
                failed
                  ? 'The run failed before any predictor or fixture connector produced a record.'
                  : 'The run has not started yet, so no connector activity has been recorded.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Connector</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.connectors.map((connector) => (
                  <TableRow key={`${connector.connectorId}-${connector.method}`}>
                    <TableCell>{connector.connectorId}</TableCell>
                    <TableCell>{connector.method}</TableCell>
                    <TableCell>
                      <SourceStatusBadge status={connector.sourceStatus} />
                    </TableCell>
                    <TableCell>{connector.version}</TableCell>
                    <TableCell>{connector.durationMs} ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        {run.status === 'QUEUED' ? (
          <Button disabled={start.isPending} onClick={() => start.mutate()}>
            <Play aria-hidden="true" />
            {start.isPending ? 'Starting…' : 'Start approved run'}
          </Button>
        ) : null}
        {run.status === 'QUEUED' || run.status === 'RUNNING' ? (
          <Button disabled={cancel.isPending} variant="destructive" onClick={() => cancel.mutate()}>
            {cancel.isPending ? 'Cancelling…' : 'Cancel run'}
          </Button>
        ) : null}
        <Button asChild>
          <Link to={`/runs/${runId}/workflow`}>View workflow</Link>
        </Button>
        {run.status === 'COMPLETED' || run.status === 'AWAITING_SHORTLIST_APPROVAL' ? (
          <Button asChild variant="outline">
            <Link to={`/runs/${runId}/candidates`}>Review candidates</Link>
          </Button>
        ) : (
          <Button disabled variant="outline">
            Review candidates
          </Button>
        )}
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="flex items-center gap-2">
          <span>{value}</span>
          {loading ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

export function WorkflowPage() {
  const runId = id(useParams().runId);
  const run = useRun(runId);
  const active = run.data?.status === 'QUEUED' || run.data?.status === 'RUNNING';
  const query = useWorkflow(runId, { refetchInterval: active ? 2_000 : false });
  if (query.isLoading) return <LoadingState label="Loading workflow" />;
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  return (
    <>
      {heading('Workflow Visualization', 'Dependency edges and server-recorded stage state.')}
      {run.data ? (
        <Alert>
          <FlaskConical aria-hidden="true" />
          <AlertTitle>
            {active ? 'Run is still in progress' : `Run status: ${run.data.status}`}
          </AlertTitle>
          <AlertDescription>
            {active
              ? 'This view refreshes automatically while the run is queued or running.'
              : 'This workflow snapshot is recorded from the server for the current revision.'}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="h-[620px] p-0">
          <GraphCanvas graph={query.data} label="Workflow dependency graph" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Accessible stage list</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2">
            {query.data.nodes.map((node) => (
              <li className="rounded border p-3" key={node.id}>
                <strong>{node.data.label}</strong>
                <span className="ml-2 text-muted-foreground">{node.data.status}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}

export function CandidatesPage() {
  const runId = id(useParams().runId);
  const [search, setSearch] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const track = search.get('track') ?? 'MHCI';
  const params = candidateListParams(search, track);
  const runQuery = useRun(runId);
  const candidatesAvailable =
    runQuery.data?.status === 'COMPLETED' ||
    runQuery.data?.status === 'AWAITING_SHORTLIST_APPROVAL';
  const query = useCandidates(runId, params, { enabled: candidatesAvailable });
  const selectedCandidateId = search.get('candidate') ?? undefined;
  const detail = useCandidate(runId, selectedCandidateId, { enabled: candidatesAvailable });
  const compare = useCompareCandidates(runId);
  if (runQuery.isLoading || query.isLoading) return <LoadingState label="Loading candidates" />;
  if (runQuery.isError)
    return <ErrorState message={runQuery.error.message} onRetry={() => void runQuery.refetch()} />;
  if (!runQuery.data) return null;
  if (!candidatesAvailable)
    return (
      <EmptyState
        title="Run not complete"
        message="The run has not finished successfully. Candidates are not yet available."
      />
    );
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const run = runQuery.data;
  const visibleCandidateIds = new Set(query.data.items.map((candidate) => candidate.id));
  const activeSelectedIds = selectedIds.filter((candidateId) =>
    visibleCandidateIds.has(candidateId),
  );
  const shortlistSelectedCandidates = query.data.items.filter(
    (candidate) =>
      activeSelectedIds.includes(candidate.id) &&
      candidate.selectable &&
      candidate.category !== 'REJECTED',
  );
  return (
    <>
      {heading(
        'Candidate Rankings',
        'Track-specific deterministic ranking with visible provenance.',
      )}
      <Tabs
        value={track}
        onValueChange={(value) => {
          const next = new URLSearchParams(search);
          next.set('track', value);
          next.delete('cursor');
          setSelectedIds([]);
          setSearch(next);
        }}
      >
        <TabsList>
          <TabsTrigger value="MHCI">MHC-I</TabsTrigger>
          <TabsTrigger value="MHCII">MHC-II</TabsTrigger>
          <TabsTrigger value="BCELL">B-cell</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search peptide or candidate ID"
          className="max-w-sm"
          defaultValue={search.get('search') ?? ''}
          onBlur={(event) =>
            updateSearchParameter(search, setSearch, 'search', event.currentTarget.value)
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              updateSearchParameter(search, setSearch, 'search', event.currentTarget.value);
            }
          }}
          placeholder="Search peptide or candidate ID"
        />
        <Select
          value={search.get('hasWarnings') ?? 'ANY'}
          onValueChange={(value) =>
            updateSearchParameter(search, setSearch, 'hasWarnings', value === 'ANY' ? '' : value)
          }
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Warning status" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="ANY">Any warning status</SelectItem>
              <SelectItem value="true">Has warnings</SelectItem>
              <SelectItem value="false">No warnings</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <CandidateFilterSelect
          label="Category"
          parameter="category"
          options={['RECOMMENDED', 'REVIEW', 'REJECTED']}
          search={search}
          setSearch={setSearch}
        />
        <CandidateFilterSelect
          label="Source"
          parameter="sourceStatus"
          options={['LIVE', 'CACHED', 'SYNTHETIC', 'FIXTURE', 'FAILED']}
          search={search}
          setSearch={setSearch}
        />
        <Input
          aria-label="Filter by allele"
          className="max-w-48"
          defaultValue={search.get('allele') ?? ''}
          placeholder="Allele"
          onBlur={(event) =>
            updateSearchParameter(search, setSearch, 'allele', event.currentTarget.value)
          }
        />
        <Input
          aria-label="Minimum score"
          className="w-32"
          defaultValue={search.get('minScore') ?? ''}
          max="1"
          min="0"
          placeholder="Min score"
          step="0.01"
          type="number"
          onBlur={(event) =>
            updateSearchParameter(search, setSearch, 'minScore', event.currentTarget.value)
          }
        />
        <Input
          aria-label="Maximum score"
          className="w-32"
          defaultValue={search.get('maxScore') ?? ''}
          max="1"
          min="0"
          placeholder="Max score"
          step="0.01"
          type="number"
          onBlur={(event) =>
            updateSearchParameter(search, setSearch, 'maxScore', event.currentTarget.value)
          }
        />
        <Button
          disabled={
            activeSelectedIds.length < 2 || activeSelectedIds.length > 5 || compare.isPending
          }
          variant="outline"
          onClick={() => compare.mutate(activeSelectedIds)}
        >
          {compare.isPending ? 'Comparing…' : `Compare selected (${activeSelectedIds.length})`}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Select any 2–5 visible candidates to compare them. Only non-rejected candidates are eligible
        for shortlist approval.
      </p>
      {query.data.items.length === 0 ? (
        <EmptyState
          title="No candidates"
          message="No candidates match the selected server filters."
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead>Rank</TableHead>
                  <TableHead>Peptide / region</TableHead>
                  <TableHead>Coordinates</TableHead>
                  <TableHead>Allele</TableHead>
                  <TableHead>Final score</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Sources</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((candidate) => (
                  <TableRow aria-selected={selectedIds.includes(candidate.id)} key={candidate.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${candidate.peptide}`}
                        checked={selectedIds.includes(candidate.id)}
                        onCheckedChange={(checked) =>
                          setSelectedIds((current) =>
                            checked
                              ? [...new Set([...current, candidate.id])]
                              : current.filter((candidateId) => candidateId !== candidate.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>{candidate.rank}</TableCell>
                    <TableCell className="font-mono">
                      <Link
                        className="text-primary hover:underline"
                        to={candidateDetailHref(search, candidate.id)}
                      >
                        {candidate.peptide}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {candidate.start}–{candidate.end}
                    </TableCell>
                    <TableCell>{candidate.allele ?? '—'}</TableCell>
                    <TableCell>{candidate.finalScore.toFixed(3)}</TableCell>
                    <TableCell>{candidate.confidence}</TableCell>
                    <TableCell>{candidate.category}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {candidate.sourceMix.map((source) => (
                          <SourceStatusBadge key={source} status={source} />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {query.data.nextCursor ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() =>
              updateSearchParameter(search, setSearch, 'cursor', query.data.nextCursor ?? '')
            }
          >
            Next page
          </Button>
        </div>
      ) : search.has('cursor') ? (
        <Button
          variant="outline"
          onClick={() => updateSearchParameter(search, setSearch, 'cursor', '')}
        >
          Return to first page
        </Button>
      ) : null}
      {compare.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Comparison failed</AlertTitle>
          <AlertDescription>{compare.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {compare.data ? <CandidateComparison data={compare.data} /> : null}
      {detail.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Candidate detail failed</AlertTitle>
          <AlertDescription>{detail.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {detail.isLoading ? <LoadingState label="Loading candidate detail" /> : null}
      {detail.data ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Candidate detail: {detail.data.candidate.peptide}</CardTitle>
              <CardDescription>{detail.data.deterministicExplanation}</CardDescription>
            </div>
            <Button
              aria-label="Close candidate detail"
              size="sm"
              variant="outline"
              onClick={() => {
                const next = new URLSearchParams(search);
                next.delete('candidate');
                setSearch(next);
              }}
            >
              Close
            </Button>
          </CardHeader>
          <CardContent className="grid gap-6">
            <DetailSection title="Decision summary">
              <div className="grid gap-2 sm:grid-cols-3">
                <Stat label="Rank" value={String(detail.data.candidate.rank)} />
                <Stat label="Final score" value={detail.data.candidate.finalScore.toFixed(3)} />
                <Stat label="Category" value={detail.data.candidate.category} />
              </div>
            </DetailSection>
            <DetailSection title="Raw observations and normalization">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method / version</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Raw value</TableHead>
                    <TableHead>Normalized value</TableHead>
                    <TableHead>Transformation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.data.observations.map((observation) => (
                    <TableRow key={`${observation.method}-${observation.version}`}>
                      <TableCell>
                        {observation.method} · {observation.version}
                      </TableCell>
                      <TableCell>
                        <SourceStatusBadge status={observation.sourceStatus} />
                      </TableCell>
                      <TableCell>{observation.rawValue}</TableCell>
                      <TableCell>{observation.normalizedValue ?? 'Unavailable'}</TableCell>
                      <TableCell>{observation.transformation ?? 'Not applied'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DetailSection>
            <DetailSection title="Consensus and completeness">
              <p>Consensus: {displayValue(detail.data.consensus)}</p>
              <p>Completeness: {displayValue(detail.data.completeness)}</p>
            </DetailSection>
            <DetailSection title="Population coverage evidence">
              <p>Singleton: {displayValue(detail.data.singletonCoverage)}</p>
              <p>Approved shortlist: {displayValue(detail.data.shortlistCoverage)}</p>
            </DetailSection>
            <DetailSection title="Constraint outcomes">
              {detail.data.constraints.map((rule) => (
                <p key={rule.ruleId}>
                  <Badge variant={rule.outcome === 'FAIL' ? 'failed' : 'outline'}>
                    {rule.outcome}
                  </Badge>{' '}
                  {rule.label} — {rule.reason}
                </p>
              ))}
            </DetailSection>
            <DetailSection title="Ranking formula">
              {detail.data.ranking.components.map((component) => (
                <p key={component.name}>
                  {component.name}: {component.value.toFixed(3)} ×{' '}
                  {component.effectiveWeight.toFixed(3)}
                </p>
              ))}
              {detail.data.ranking.penalties.map((penalty) => (
                <p key={penalty.name}>
                  Penalty · {penalty.name}: {penalty.value.toFixed(3)}
                </p>
              ))}
              <strong>Final score: {detail.data.ranking.finalScore.toFixed(3)}</strong>
            </DetailSection>
            <DetailSection title="Evidence graph neighborhood">
              {detail.data.graphNeighborIds.length === 0 ? (
                <p className="text-muted-foreground">No stored neighbors.</p>
              ) : (
                <ul className="list-inside list-disc font-mono text-sm">
                  {detail.data.graphNeighborIds.map((neighborId) => (
                    <li key={neighborId}>{neighborId}</li>
                  ))}
                </ul>
              )}
            </DetailSection>
            <DetailSection title="Explanation">
              <p>{detail.data.deterministicExplanation}</p>
              {detail.data.llmExplanation ? (
                <Alert>
                  <AlertTitle>
                    {detail.data.llmExplanation.generationModeUsed} explanation
                  </AlertTitle>
                  <AlertDescription>{detail.data.llmExplanation.text}</AlertDescription>
                </Alert>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No optional LLM paraphrase requested.
                </p>
              )}
            </DetailSection>
          </CardContent>
        </Card>
      ) : null}
      <CandidateSubviews
        runId={runId}
        runStatus={run.status}
        track={track}
        search={search}
        setSearch={setSearch}
        setSelectedIds={setSelectedIds}
        rankingSnapshotHash={query.data.rankingSnapshotHash}
        candidateIds={query.data.items.filter((item) => item.selectable).map((item) => item.id)}
        selectedCandidates={shortlistSelectedCandidates}
        selectedIds={shortlistSelectedCandidates.map((candidate) => candidate.id)}
      />
    </>
  );
}
function updateSearchParameter(
  search: URLSearchParams,
  setSearch: ReturnType<typeof useSearchParams>[1],
  name: string,
  value: string,
) {
  const next = new URLSearchParams(search);
  if (value.trim() === '') next.delete(name);
  else next.set(name, value.trim());
  if (name !== 'cursor') next.delete('cursor');
  setSearch(next);
}

function candidateDetailHref(search: URLSearchParams, candidateId: string) {
  const next = new URLSearchParams(search);
  next.set('candidate', candidateId);
  return `?${next.toString()}`;
}

function CandidateFilterSelect({
  label,
  parameter,
  options,
  search,
  setSearch,
}: {
  label: string;
  parameter: string;
  options: string[];
  search: URLSearchParams;
  setSearch: ReturnType<typeof useSearchParams>[1];
}) {
  return (
    <Select
      value={search.get(parameter) ?? 'ANY'}
      onValueChange={(value) =>
        updateSearchParameter(search, setSearch, parameter, value === 'ANY' ? '' : value)
      }
    >
      <SelectTrigger className="w-40" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="ANY">Any {label.toLowerCase()}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function CandidateComparison({
  data,
}: {
  data: import('@immunograph/shared').CandidateComparison;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate comparison · {data.track}</CardTitle>
        <CardDescription>
          Aligned server-provided ranking components and rule outcomes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Measure</TableHead>
              {data.candidates.map((candidate) => (
                <TableHead key={candidate.id}>{candidate.peptide}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.components.map((component) => (
              <TableRow key={component.name}>
                <TableCell>{component.name}</TableCell>
                {data.candidates.map((candidate) => (
                  <TableCell key={candidate.id}>
                    {component.values[candidate.id]?.toFixed(3) ?? 'Unavailable'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {data.constraints.map((constraint) => (
              <TableRow key={constraint.ruleId}>
                <TableCell>{constraint.label}</TableCell>
                {data.candidates.map((candidate) => (
                  <TableCell key={candidate.id}>{constraint.outcomes[candidate.id]}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
const displayValue = (item: { value: number | null; unavailableReason: string | null }) =>
  item.value === null
    ? `Unavailable — ${item.unavailableReason ?? 'No evidence'}`
    : item.value.toFixed(3);

function CandidateSubviews({
  runId,
  runStatus,
  track,
  search,
  setSearch,
  setSelectedIds,
  rankingSnapshotHash,
  candidateIds,
  selectedCandidates,
  selectedIds,
}: {
  runId: string;
  runStatus: import('@immunograph/shared').RunStatus;
  track: string;
  search: URLSearchParams;
  setSearch: ReturnType<typeof useSearchParams>[1];
  setSelectedIds: (candidateIds: string[]) => void;
  rankingSnapshotHash: string;
  candidateIds: string[];
  selectedCandidates: import('@immunograph/shared').CandidateCard[];
  selectedIds: string[];
}) {
  const view = search.get('view') ?? 'rankings';
  const sequence = useSequenceMap(runId);
  const coverage = useCoverageVisualization(runId);
  const optimizableTrack = track === 'MHCI' || track === 'MHCII' ? track : null;
  const shortlistOptimization = useShortlistOptimization(runId, optimizableTrack ?? 'MHCI', {
    enabled: view === 'shortlist' && optimizableTrack !== null,
  });
  const approve = useApproveShortlist(runId);
  const [acknowledged, setAcknowledged] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');
  const shortlistApproved = runStatus === 'COMPLETED';
  const visibleOptimizedIds =
    shortlistOptimization.data?.selectedCandidateIds.filter((candidateId) =>
      candidateIds.includes(candidateId),
    ) ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate review tools</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {['rankings', 'sequence', 'coverage', 'shortlist'].map((item) => (
            <Button
              key={item}
              size="sm"
              variant={view === item ? 'default' : 'outline'}
              onClick={() => {
                const next = new URLSearchParams(search);
                next.set('view', item);
                setSearch(next);
              }}
            >
              {item === 'sequence'
                ? 'Sequence map'
                : item === 'coverage'
                  ? 'Population coverage'
                  : item === 'shortlist'
                    ? 'Shortlist approval'
                    : 'Rankings'}
            </Button>
          ))}
        </div>
        {view === 'sequence' ? (
          sequence.isError ? (
            <ErrorState message={sequence.error.message} onRetry={() => void sequence.refetch()} />
          ) : (
            <SequenceMap data={sequence.data} loading={sequence.isLoading} />
          )
        ) : null}
        {view === 'coverage' ? (
          coverage.isLoading ? (
            <LoadingState label="Loading population coverage" />
          ) : coverage.isError ? (
            <ErrorState message={coverage.error.message} onRetry={() => void coverage.refetch()} />
          ) : !coverage.data || coverage.data.populations.length === 0 ? (
            <EmptyState
              title="No population coverage"
              message="This run did not request population coverage, so there is no coverage review view."
            />
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart
                    data={coverage.data.populations.map((item) => ({
                      name: item.label,
                      coverage: item.coverage.value,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Bar dataKey="coverage" fill="var(--chart-1)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Population</TableHead>
                    <TableHead>Estimated coverage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.data.populations.map((item) => (
                    <TableRow key={item.populationId}>
                      <TableCell>{item.label}</TableCell>
                      <TableCell>{displayValue(item.coverage)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )
        ) : null}
        {view === 'shortlist' ? (
          <div className="grid gap-3">
            <Alert>
              <AlertTriangle aria-hidden="true" />
              <AlertTitle>Computational evidence only</AlertTitle>
              <AlertDescription>
                Shortlisted candidates require experimental validation.
              </AlertDescription>
            </Alert>
            {optimizableTrack === null ? (
              <Alert>
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>No construct optimizer for this track</AlertTitle>
                <AlertDescription>
                  Multi-epitope construct optimization is available for MHC-I and MHC-II tracks in
                  this MVP.
                </AlertDescription>
              </Alert>
            ) : shortlistOptimization.isLoading ? (
              <LoadingState label="Loading optimized shortlist" />
            ) : shortlistOptimization.data ? (
              <div className="grid gap-3 rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      Optimized {shortlistOptimization.data.track} construct
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {shortlistOptimization.data.algorithmId} v
                      {shortlistOptimization.data.algorithmVersion}
                    </p>
                  </div>
                  <Badge variant="outline">Deterministic software optimizer</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <Stat
                    label="Final coverage"
                    value={shortlistOptimization.data.finalCoverage.toFixed(3)}
                  />
                  <Stat
                    label="Objective"
                    value={shortlistOptimization.data.objectiveScore?.toFixed(3) ?? '—'}
                  />
                  <Stat
                    label="Redundancy penalty"
                    value={shortlistOptimization.data.redundancyPenalty?.toFixed(3) ?? '—'}
                  />
                  <Stat
                    label="Confidence"
                    value={shortlistOptimization.data.confidence?.label ?? '—'}
                  />
                </div>
                {shortlistOptimization.data.constructSequence ? (
                  <div>
                    <p className="mb-1 text-sm font-medium">Construct sequence</p>
                    <code className="block overflow-x-auto rounded bg-muted p-2 text-xs">
                      {shortlistOptimization.data.constructSequence}
                    </code>
                  </div>
                ) : null}
                {shortlistOptimization.data.manufacturability ? (
                  <div>
                    <p className="mb-1 text-sm font-medium">
                      Manufacturability: {shortlistOptimization.data.manufacturability.status}
                    </p>
                    <ul className="grid gap-1 text-sm text-muted-foreground">
                      {shortlistOptimization.data.manufacturability.checks.map((check) => (
                        <li key={check.ruleId}>
                          {check.status} · {check.ruleId} · {check.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {shortlistOptimization.data.steps.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Step</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Marginal gain</TableHead>
                        <TableHead>Cumulative coverage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shortlistOptimization.data.steps.map((step) => (
                        <TableRow key={`${step.step}-${step.candidateId}`}>
                          <TableCell>{step.step}</TableCell>
                          <TableCell className="font-mono text-xs">{step.candidateId}</TableCell>
                          <TableCell>{step.marginalCoverageGain.toFixed(3)}</TableCell>
                          <TableCell>{step.cumulativeCoverage.toFixed(3)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
                {!shortlistApproved ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={visibleOptimizedIds.length === 0}
                    onClick={() => setSelectedIds(visibleOptimizedIds)}
                  >
                    Use optimized shortlist
                  </Button>
                ) : null}
              </div>
            ) : (
              <Alert>
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>No optimized shortlist yet</AlertTitle>
                <AlertDescription>
                  Run execution did not persist an optimizer result for this track yet.
                </AlertDescription>
              </Alert>
            )}
            {shortlistApproved ? (
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertTitle>Shortlist already approved</AlertTitle>
                <AlertDescription>
                  This run is complete. Report generation is available from the Reports page.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <label className="flex items-center gap-2">
                  <Checkbox
                    aria-label="Acknowledge computational-only shortlist status"
                    checked={acknowledged}
                    onCheckedChange={(checked) => setAcknowledged(checked === true)}
                  />
                  I acknowledge the computational-only status.
                </label>
                <p className="text-sm text-muted-foreground">
                  {selectedIds.length} candidate{selectedIds.length === 1 ? '' : 's'} selected from
                  snapshot {rankingSnapshotHash.slice(0, 12)}…
                </p>
                {selectedCandidates.length === 0 ? (
                  <Alert>
                    <AlertTriangle aria-hidden="true" />
                    <AlertTitle>No candidates selected</AlertTitle>
                    <AlertDescription>
                      Select one or more non-rejected candidates from the Rankings table before
                      approving the shortlist.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-sm font-medium">Selected shortlist candidates</p>
                    <ul className="grid gap-1 text-sm">
                      {selectedCandidates.map((candidate) => (
                        <li key={candidate.id}>
                          #{candidate.rank} <span className="font-mono">{candidate.peptide}</span> ·{' '}
                          {candidate.category} · score {candidate.finalScore.toFixed(3)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Textarea
                  placeholder="Optional approval note"
                  value={approvalNote}
                  onChange={(event) => setApprovalNote(event.currentTarget.value)}
                />
                {approve.isError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Shortlist approval failed</AlertTitle>
                    <AlertDescription>{approve.error.message}</AlertDescription>
                  </Alert>
                ) : null}
                {approve.isSuccess ? (
                  <Alert>
                    <CheckCircle2 aria-hidden="true" />
                    <AlertTitle>Shortlist approved</AlertTitle>
                    <AlertDescription>Report generation is now available.</AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  disabled={!acknowledged || selectedIds.length === 0 || approve.isPending}
                  onClick={() =>
                    approve.mutate(
                      createShortlistApprovalInput(
                        rankingSnapshotHash,
                        candidateIds,
                        selectedIds,
                        approvalNote,
                      ),
                    )
                  }
                >
                  {approve.isPending ? 'Approving…' : 'Approve shortlist'}
                </Button>
              </>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SequenceMap({
  data,
  loading,
}: {
  data: import('@immunograph/shared').SequenceMapView | undefined;
  loading: boolean;
}) {
  if (loading) return <LoadingState label="Loading sequence map" />;
  if (!data)
    return <EmptyState title="No sequence map" message="No positional view is available." />;
  if (data.segments.length > 500) {
    return (
      <Alert>
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Sequence map requires aggregation</AlertTitle>
        <AlertDescription>
          The API returned {data.segments.length} segments; the interactive MVP limit is 500.
        </AlertDescription>
      </Alert>
    );
  }
  const maximumLane = Math.max(0, ...data.segments.map((segment) => segment.lane));
  const trackStride = (maximumLane + 2) * 28;
  const height = Math.max(100, data.tracks.length * trackStride + 30);
  return (
    <div className="grid gap-4">
      <p>Protein length: {data.proteinLength} aa</p>
      <div className="overflow-x-auto rounded-md border bg-card p-3">
        <svg
          aria-label={`Candidate sequence map for a ${data.proteinLength} amino-acid protein`}
          className="min-w-[720px]"
          role="img"
          viewBox={`0 0 1120 ${height}`}
        >
          {data.tracks.map((track, trackIndex) => (
            <g key={track.id}>
              <text className="fill-foreground text-xs" x="0" y={trackIndex * trackStride + 20}>
                {track.label}
              </text>
              <line
                className="stroke-border"
                x1="110"
                x2="1110"
                y1={trackIndex * trackStride + 16}
                y2={trackIndex * trackStride + 16}
              />
            </g>
          ))}
          {data.segments.map((segment) => {
            const trackIndex = Math.max(
              0,
              data.tracks.findIndex((track) => track.id === segment.trackId),
            );
            const geometry = sequenceSegmentGeometry(
              segment.start,
              segment.end,
              data.proteinLength,
            );
            const y = trackIndex * trackStride + 8 + segment.lane * 24;
            return (
              <Link
                aria-label={`${segment.label}, residues ${segment.start} to ${segment.end}, ${segment.category}`}
                key={segment.candidateId}
                to={`?track=${segment.trackId}&candidate=${segment.candidateId}&view=sequence`}
              >
                <rect
                  className={
                    segment.category === 'RECOMMENDED'
                      ? 'fill-primary'
                      : segment.category === 'REVIEW'
                        ? 'fill-amber-500'
                        : 'fill-muted-foreground'
                  }
                  height="16"
                  rx="3"
                  width={geometry.width}
                  x={110 + geometry.x}
                  y={y}
                />
              </Link>
            );
          })}
        </svg>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Track</TableHead>
            <TableHead>Candidate</TableHead>
            <TableHead>Coordinates</TableHead>
            <TableHead>Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.segments.map((segment) => (
            <TableRow key={segment.candidateId}>
              <TableCell>{segment.trackId}</TableCell>
              <TableCell>
                <Link
                  className="font-mono text-primary hover:underline"
                  to={`?track=${segment.trackId}&candidate=${segment.candidateId}&view=sequence`}
                >
                  {segment.label}
                </Link>
              </TableCell>
              <TableCell>
                {segment.start}–{segment.end}
              </TableCell>
              <TableCell>{segment.category}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EvidencePage() {
  const runId = id(useParams().runId);
  const [depth, setDepth] = useState(2);
  const query = useEvidence(runId, depth);
  if (query.isLoading) return <LoadingState label="Loading evidence" />;
  if (query.isError)
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;
  const nodeLabels = new Map(query.data.nodes.map((node) => [node.id, node.data.label]));
  return (
    <>
      {heading(
        'Evidence Explorer',
        'Stored scientific relations with a complete tabular alternative.',
      )}
      <div className="flex items-center gap-2">
        <label htmlFor="depth">Depth</label>
        <Select value={String(depth)} onValueChange={(value) => setDepth(Number(value))}>
          <SelectTrigger id="depth" className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {[1, 2, 3, 4].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="h-[640px] p-0">
          <GraphCanvas graph={query.data} label="Scientific evidence relationship graph" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Relationship table</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Relation</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Provenance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.edges.map((edge) => (
                <TableRow key={edge.id}>
                  <TableCell>{edge.relation}</TableCell>
                  <TableCell>{nodeLabels.get(edge.source) ?? edge.source}</TableCell>
                  <TableCell>{nodeLabels.get(edge.target) ?? edge.target}</TableCell>
                  <TableCell>{edge.provenance ?? 'Stored relation'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export function ReportsPage() {
  const runId = id(useParams().runId);
  const artifacts = useArtifacts(runId);
  const run = useRun(runId);
  const create = useCreateReport(runId);
  if (artifacts.isLoading || run.isLoading) return <LoadingState label="Loading reports" />;
  if (artifacts.isError || run.isError)
    return (
      <ErrorState
        message={(artifacts.error ?? run.error)?.message ?? 'Reports are unavailable.'}
        onRetry={() => {
          void artifacts.refetch();
          void run.refetch();
        }}
      />
    );
  const approvalRequired = run.data?.approvalRequirements.includes('SHORTLIST') ?? true;
  return (
    <>
      {heading('Reports', 'Generate and download reproducibility artifacts.')}
      <Alert
        className={
          run.data?.executionMode === 'SYNTHETIC' || run.data?.executionMode === 'HYBRID'
            ? 'border-fixture-border bg-fixture'
            : undefined
        }
      >
        <FileText aria-hidden="true" />
        <AlertTitle>
          {run.data?.executionMode === 'SYNTHETIC' || run.data?.executionMode === 'HYBRID'
            ? 'OFFLINE SYNTHETIC DEMONSTRATION REPORT'
            : 'Computational prioritization report'}
        </AlertTitle>
        <AlertDescription>
          {run.data?.executionMode === 'SYNTHETIC' || run.data?.executionMode === 'HYBRID'
            ? 'The exported report states scientificUse = false and identifies deterministic demonstration values that must not be interpreted as validated scientific predictions.'
            : 'Exports preserve run quality, profiles, provenance, and the experimental-validation disclaimer.'}
        </AlertDescription>
      </Alert>
      <Button
        disabled={create.isPending || approvalRequired}
        title={approvalRequired ? 'Approve a shortlist before generating reports.' : undefined}
        onClick={() => create.mutate()}
      >
        <RefreshCw aria-hidden="true" />
        {create.isPending ? 'Generating…' : 'Generate report'}
      </Button>
      {approvalRequired ? (
        <p className="text-sm text-muted-foreground">
          Report creation is locked until the current ranking snapshot has an approved shortlist.
        </p>
      ) : null}
      {create.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Report generation failed</AlertTitle>
          <AlertDescription>{create.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {artifacts.data?.items.length ? (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artifact</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>SHA-256</TableHead>
                  <TableHead>Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artifacts.data.items.map((artifact) => (
                  <TableRow key={artifact.id}>
                    <TableCell>{artifact.filename}</TableCell>
                    <TableCell>{artifact.sizeBytes.toLocaleString()} bytes</TableCell>
                    <TableCell className="max-w-48 truncate font-mono">{artifact.sha256}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <a href={`/api/v1/artifacts/${artifact.id}/download`}>
                          <Download aria-hidden="true" />
                          Download
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <EmptyState title="No artifacts" message="Approved shortlist artifacts will appear here." />
      )}
    </>
  );
}

export function DiagnosticsPage() {
  const data = useDiagnostics();
  const loading = Object.values(data).some((query) => query.isLoading);
  if (loading) return <LoadingState label="Loading diagnostics" />;
  const partial = Object.values(data).some((query) => query.isError);
  return (
    <>
      {heading(
        'System Diagnostics',
        'Read-only connector, runtime, fixture, profile, and build health.',
      )}
      {partial ? (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Partial diagnostics</AlertTitle>
          <AlertDescription>One or more operational endpoints are unavailable.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Connectors</CardTitle>
          </CardHeader>
          <CardContent>
            {data.health.data?.items.map((item) => (
              <div
                className="flex items-center justify-between border-b py-3 last:border-0"
                key={item.connectorId}
              >
                <span>{item.connectorId}</span>
                <Badge
                  variant={
                    item.health === 'AVAILABLE'
                      ? 'live'
                      : item.health === 'DEGRADED'
                        ? 'partial'
                        : 'failed'
                  }
                >
                  {item.health}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p>Database: {data.runtime.data?.databaseStatus ?? 'Unavailable'}</p>
            <p>Artifacts: {data.runtime.data?.artifactPathStatus ?? 'Unavailable'}</p>
            <p>LLM: {data.runtime.data?.llmEnabled ? 'Enabled' : 'Disabled'}</p>
            <p>Application: {data.runtime.data?.build.applicationVersion ?? 'Unavailable'}</p>
            <p>Specification: {data.runtime.data?.build.specificationVersion ?? 'Unavailable'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fixture manifest</CardTitle>
          </CardHeader>
          <CardContent>
            {data.runtime.data?.fixtureManifest.entries.map((entry) => (
              <p key={entry.fixtureId}>
                <CheckCircle2 aria-hidden="true" className="mr-2 inline text-primary" />
                {entry.organism} · {entry.proteinName}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Loaded profiles</CardTitle>
          </CardHeader>
          <CardContent>
            {data.profiles.data?.items.map((profile) => (
              <p key={`${profile.name}-${profile.version}`}>
                {profile.name} {profile.version} — {profile.approved ? 'Approved' : 'Unapproved'}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function AboutPage() {
  return (
    <>
      {heading(
        'About ImmunoGraph',
        'Transparent and reproducible computational epitope prioritization.',
      )}
      <Card>
        <CardHeader>
          <CardTitle>Responsible-use boundary</CardTitle>
        </CardHeader>
        <CardContent className="prose max-w-none">
          <p>
            ImmunoGraph combines authoritative predictors, deterministic constraints, visible
            provenance, and explicit researcher approval.
          </p>
          <p>
            Results are computationally prioritized candidates, not validated vaccine candidates,
            and require experimental validation.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
