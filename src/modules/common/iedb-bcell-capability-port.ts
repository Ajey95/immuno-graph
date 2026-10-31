import { ToolExecutionError } from './executor.js';

const API_ROOT = 'https://api-nextgen-tools.iedb.org';
const PIPELINE_ENDPOINT = `${API_ROOT}/api/v1/pipeline`;

export interface IedbBcellInput {
  runId: string;
  proteinRef: string;
  sequence: string;
  parameters: Record<string, unknown>;
}

export interface IedbBcellOptions {
  timeoutMs: number;
  maximumResponseBytes: number;
  request?: typeof fetch;
}

export async function predictIedbBepipred(input: IedbBcellInput, options: IedbBcellOptions) {
  const supported = new Set(['windowSize', 'predictionScoring', 'includeSequenceLength']);
  for (const key of Object.keys(input.parameters)) {
    if (!supported.has(key)) {
      throw new ToolExecutionError('BCELL_PARAMETER_UNSUPPORTED', 'VALIDATION', `Unsupported BepiPred parameter: ${key}.`);
    }
  }
  const windowSize = input.parameters.windowSize ?? 9;
  const predictionScoring = input.parameters.predictionScoring ?? 'vt_pred';
  const includeSequenceLength = input.parameters.includeSequenceLength ?? false;
  if (!Number.isInteger(windowSize) || Number(windowSize) < 1 || Number(windowSize) > 50 || !['vt_pred', 'mjv_pred'].includes(String(predictionScoring)) || typeof includeSequenceLength !== 'boolean') {
    throw new ToolExecutionError('BCELL_PARAMETER_INVALID', 'VALIDATION', 'BepiPred requires windowSize 1-50, predictionScoring vt_pred or mjv_pred, and a boolean includeSequenceLength.');
  }
  const request = options.request ?? fetch;
  const deadline = Date.now() + options.timeoutMs;
  const submitted = await requestJson(request, PIPELINE_ENDPOINT, options.maximumResponseBytes, deadline, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      pipeline_title: `ImmunoGraph ${input.runId}`,
      run_stage_range: [1, 1],
      stages: [{
        stage_number: 1,
        stage_type: 'prediction',
        tool_group: 'bcell_sequence',
        input_sequence_text: `>${input.proteinRef.replace(/[\r\n]/gu, ' ').slice(0, 100)}\n${input.sequence}`,
        input_parameters: { predictors: [{ method: 'bepipred-3.0', pred: predictionScoring, window_size: windowSize, add_seq_len: includeSequenceLength }] },
      }],
    }),
  });
  const errors = submitted.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new ToolExecutionError('IEDB_BCELL_JOB_REJECTED', 'CONNECTOR', String(errors[0]));
  }
  const resultsUri = submitted.results_uri;
  if (typeof resultsUri !== 'string' || !resultsUri.startsWith(`${API_ROOT}/api/v1/results/`)) {
    throw new ToolExecutionError('IEDB_BCELL_RESPONSE_INVALID', 'CONNECTOR', 'IEDB returned an invalid result URI.');
  }
  let completed: Record<string, unknown> | undefined;
  while (Date.now() < deadline) {
    const result = await requestJson(request, resultsUri, options.maximumResponseBytes, deadline, { method: 'GET', headers: { accept: 'application/json' } });
    if (result.status === 'done') {
      completed = result;
      break;
    }
    if (result.status === 'failed' || result.status === 'error') {
      throw new ToolExecutionError('IEDB_BCELL_JOB_FAILED', 'CONNECTOR', 'IEDB BepiPred job failed.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (!completed) throw new ToolExecutionError('IEDB_BCELL_TIMEOUT', 'TIMEOUT', 'IEDB BepiPred job timed out.', true);
  const data = asRecord(completed.data);
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    throw new ToolExecutionError('IEDB_BCELL_JOB_FAILED', 'CONNECTOR', String(data.errors[0]));
  }
  const tables = data.results;
  if (!Array.isArray(tables)) invalidResponse();
  const residueTable = tables.find((table) => asRecord(table).type === 'residue_table');
  const epitopeTable = tables.find((table) => asRecord(table).type === 'linear_epitope_table');
  const residueScores = rows(residueTable, ['position', 'bepipred_score']).map((row) => ({
    position: positiveInteger(row[0]), score: unit(row[1]),
  }));
  if (residueScores.length === 0 || residueScores.length !== input.sequence.length) invalidResponse();
  const regions = rows(epitopeTable, ['start', 'end', 'bepipred3_score']).map((row) => ({
    start: positiveInteger(row[0]), end: positiveInteger(row[1]), score: unit(row[2]),
  }));
  return {
    residueScores,
    regions,
    rawMethodFields: { provider: 'IEDB Next-Generation B Cell Sequence', method: 'bepipred-3.0', resultUri: resultsUri, windowSize, predictionScoring, includeSequenceLength },
    provenance: [{
      connectorId: 'iedb-nextgen-bcell', connectorVersion: 'api-v1', method: 'bepipred-3.0', methodVersion: '3.0',
      status: 'LIVE' as const, sourceUri: PIPELINE_ENDPOINT,
      parameters: { proteinRef: input.proteinRef, sequenceLength: input.sequence.length, windowSize, predictionScoring, includeSequenceLength, resultUri: resultsUri },
      predictionSource: 'LIVE' as const, scientificUse: true, validationStatus: 'SCIENTIFIC' as const,
    }],
  };
}

async function requestJson(request: typeof fetch, url: string, maxBytes: number, deadline: number, init: RequestInit): Promise<Record<string, unknown>> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new ToolExecutionError('IEDB_BCELL_TIMEOUT', 'TIMEOUT', 'IEDB BepiPred job timed out.', true);
  let response: Response;
  try {
    response = await request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(remaining) });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new ToolExecutionError(timedOut ? 'IEDB_BCELL_TIMEOUT' : 'IEDB_BCELL_NETWORK_ERROR', timedOut ? 'TIMEOUT' : 'CONNECTOR', timedOut ? 'IEDB BepiPred request timed out.' : 'IEDB BepiPred request failed.', true);
  }
  if (response.status === 429) throw new ToolExecutionError('IEDB_BCELL_RATE_LIMITED', 'RATE_LIMIT', 'IEDB rate-limited the BepiPred request.', true);
  if (!response.ok) throw new ToolExecutionError('IEDB_BCELL_HTTP_ERROR', 'CONNECTOR', `IEDB BepiPred returned HTTP ${response.status}.`, response.status >= 500);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) invalidResponse();
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > maxBytes) invalidResponse();
  try { return asRecord(JSON.parse(body)); } catch { return invalidResponse(); }
}

function rows(table: unknown, columns: string[]): unknown[][] {
  const record = asRecord(table);
  if (!Array.isArray(record.table_columns) || !Array.isArray(record.table_data)) invalidResponse();
  const names = record.table_columns.map((column) => asRecord(column).name);
  const indexes = columns.map((name) => {
    const index = names.indexOf(name);
    if (index < 0) invalidResponse();
    return index;
  });
  return record.table_data.map((row) => {
    if (!Array.isArray(row)) invalidResponse();
    return indexes.map((index) => row[index]);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidResponse();
  return value as Record<string, unknown>;
}

function positiveInteger(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) invalidResponse();
  return parsed;
}

function unit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) invalidResponse();
  return parsed;
}

function invalidResponse(): never {
  throw new ToolExecutionError('IEDB_BCELL_RESPONSE_INVALID', 'CONNECTOR', 'IEDB returned an invalid BepiPred response.');
}
