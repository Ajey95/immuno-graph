import {
  canonicalJsonSha256,
  generatePeptides,
  predictSyntheticBinding,
  SYNTHETIC_BINDING_ALGORITHM,
  SYNTHETIC_BINDING_ALGORITHM_VERSION,
  validateFasta,
} from '../../lib/algorithms/index.js';
import { loadReferenceBundle } from '../../lib/database/mcp.js';
import { ControllerDecorator, ToolDecorator } from '../common/mcp-compat.js';
import type { ExecutionContext } from '../common/mcp-compat.js';
import { createHash } from 'node:crypto';
import type { z } from 'zod';

import type { CapabilityPort } from '../common/capability-port.js';
import { buildDefaultCapabilityPort } from '../common/default-capability-port.js';
import { executeTool, ToolExecutionError } from '../common/executor.js';
import {
  generatePeptidesContract,
  predictBcellContract,
  predictMhciContract,
  predictMhciiContract,
  predictSyntheticBindingContract,
  toolOptions,
  validateSequenceContract,
} from '../tool-contracts.js';

const CATEGORY = 'Prediction Tools';
const referenceBundle = loadReferenceBundle();

// otherwise — providing seamless offline/backup mode without code changes.
@ControllerDecorator()
export class PredictionController {
  private capabilities: CapabilityPort;

  constructor(capabilities: CapabilityPort = buildDefaultCapabilityPort()) {
    this.capabilities = capabilities;
  }

  useCapabilityPort(capabilities: CapabilityPort): this {
    this.capabilities = capabilities;
    return this;
  }

  @ToolDecorator(toolOptions(validateSequenceContract, CATEGORY))
  validateSequence(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: validateSequenceContract.name,
      input,
      inputSchema: validateSequenceContract.inputSchema,
      dataSchema: validateSequenceContract.dataSchema,
      context,
      operation: async (validated) => {
        if (validated.fasta.trim().length === 0) {
          throw new ToolExecutionError('FASTA_EMPTY', 'VALIDATION', 'A FASTA record is required.');
        }
        const { aminoAcids, fastaRules } = await referenceBundle;
        const result = validateFasta(validated.fasta, {
          alphabet: aminoAcids.residues
            .filter(({ allowedInStrictProfile }) => allowedInStrictProfile)
            .map(({ oneLetter }) => oneLetter),
          maxBytes: fastaRules.maxBytes,
          maxResidues: fastaRules.maxResidues,
        });
        if (!result.ok) {
          const first = result.errors[0];
          const code =
            first?.code === 'FASTA_SEQUENCE_REQUIRED'
              ? 'FASTA_EMPTY'
              : first?.code === 'FASTA_INVALID_RESIDUE'
                ? 'INVALID_RESIDUE'
                : first?.code === 'FASTA_SEQUENCE_TOO_LONG'
                  ? 'SEQUENCE_TOO_LONG'
                  : (first?.code ?? 'FASTA_INVALID');
          throw new ToolExecutionError(
            code,
            'VALIDATION',
            first?.message ?? 'The FASTA record is invalid.',
            false,
            { errors: result.errors },
          );
        }
        return { ...result.value, warnings: [] };
      },
    });
  }

  @ToolDecorator(toolOptions(generatePeptidesContract, CATEGORY))
  generateCandidatePeptides(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: generatePeptidesContract.name,
      input,
      inputSchema: generatePeptidesContract.inputSchema,
      dataSchema: generatePeptidesContract.dataSchema,
      context,
      operation: (validated) => ({
        candidates: generatePeptides(
          validated.sequence,
          validated.candidateType,
          validated.peptideLengths,
        ),
      }),
    });
  }

  @ToolDecorator(toolOptions(predictMhciContract, CATEGORY))
  predictMhci(input: unknown, context: ExecutionContext) {
    return this.invokeCapability(predictMhciContract, input, context);
  }

  @ToolDecorator(toolOptions(predictMhciiContract, CATEGORY))
  predictMhcii(input: unknown, context: ExecutionContext) {
    return this.invokeCapability(predictMhciiContract, input, context);
  }

  @ToolDecorator(toolOptions(predictBcellContract, CATEGORY))
  predictBcell(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: predictBcellContract.name,
      input,
      inputSchema: predictBcellContract.inputSchema,
      dataSchema: predictBcellContract.dataSchema,
      context,
      operation: async (validated) => {
        if (validated.methods.length === 1 && validated.methods[0]?.toLowerCase() === 'parker') {
          if (validated.fallbackPolicy === 'FIXTURE_ONLY') {
            throw new ToolExecutionError('PARKER_LIVE_POLICY_REQUIRED', 'VALIDATION', 'Parker computation requires a live-permitting fallback policy.');
          }
          if (!validated.sequence) {
            throw new ToolExecutionError('PARKER_SEQUENCE_REQUIRED', 'VALIDATION', 'Parker hydrophilicity requires an actual protein sequence.');
          }
          return parkerHydrophilicity(validated.sequence);
        }
        const requestsGraphBepi = validated.methods.some(
          (method) => method.toLowerCase() === 'graphbepi',
        );
        const permitsFixtures = [
          'CACHE_THEN_LIVE_THEN_FIXTURE',
          'LIVE_THEN_CACHE_THEN_FIXTURE',
          'FIXTURE_ONLY',
        ].includes(validated.fallbackPolicy);
        if (requestsGraphBepi && !permitsFixtures) {
          throw new ToolExecutionError(
            'GRAPHBEPI_FIXTURE_REQUIRED',
            'SCIENTIFIC',
            'GraphBepi is fixture-only in MVP v1 and requires a fixture-permitting fallback policy.',
          );
        }
        const capability = requestsGraphBepi ? 'predict_bcell_fixture' : predictBcellContract.name;
        const result = (await this.capabilities.invoke(capability, validated)) as z.infer<
          typeof predictBcellContract.dataSchema
        >;
        if (
          requestsGraphBepi &&
          result.provenance.some((entry) => entry.status === 'LIVE' || entry.status === 'CACHED')
        ) {
          throw new ToolExecutionError(
            'GRAPHBEPI_PROVENANCE_INVALID',
            'CONNECTOR',
            'GraphBepi cannot return LIVE or CACHED provenance in MVP v1.',
          );
        }
        return result;
      },
    });
  }

  @ToolDecorator(toolOptions(predictSyntheticBindingContract, CATEGORY))
  predictSyntheticBindingTool(input: unknown, context: ExecutionContext) {
    return executeTool({
      toolName: predictSyntheticBindingContract.name,
      input,
      inputSchema: predictSyntheticBindingContract.inputSchema,
      dataSchema: predictSyntheticBindingContract.dataSchema,
      context,
      operation: (validated) => ({
        observations: predictSyntheticBinding(validated).map((observation) => ({
          ...observation,
          rawFields: {
            predictionSource: 'SYNTHETIC',
            scientificUse: false,
            validationStatus: 'DEMONSTRATION_ONLY',
            algorithm: SYNTHETIC_BINDING_ALGORITHM,
            algorithmVersion: SYNTHETIC_BINDING_ALGORITHM_VERSION,
          },
        })),
        provenance: {
          connectorId: 'immunograph-synthetic-predictor',
          connectorVersion: '1.0.0',
          method: validated.method,
          methodVersion: validated.methodVersion,
          status: 'SYNTHETIC' as const,
          sourceUri: 'https://immunograph.local/synthetic-predictor',
          parameters: { candidateType: validated.candidateType },
          predictionSource: 'SYNTHETIC' as const,
          scientificUse: false,
          validationStatus: 'DEMONSTRATION_ONLY' as const,
          algorithm: SYNTHETIC_BINDING_ALGORITHM,
          algorithmVersion: SYNTHETIC_BINDING_ALGORITHM_VERSION,
          datasetVersion: validated.datasetVersion,
          datasetHash: canonicalJsonSha256({
            datasetVersion: validated.datasetVersion,
            algorithm: SYNTHETIC_BINDING_ALGORITHM,
            algorithmVersion: SYNTHETIC_BINDING_ALGORITHM_VERSION,
          }),
        },
      }),
    });
  }

  private invokeCapability<TInput extends z.ZodTypeAny, TData extends z.ZodTypeAny>(
    contract: { name: string; inputSchema: TInput; dataSchema: TData },
    input: unknown,
    context: ExecutionContext,
  ) {
    return executeTool({
      toolName: contract.name,
      input,
      inputSchema: contract.inputSchema,
      dataSchema: contract.dataSchema,
      context,
      operation: async (validated) =>
        this.capabilities.invoke(contract.name, withDerivedProteinRef(validated)) as Promise<
          z.infer<TData>
        >,
    });
  }
}

function withDerivedProteinRef<T>(input: T): T {
  if (
    typeof input !== 'object' ||
    input === null ||
    !('sequence' in input) ||
    typeof input.sequence !== 'string' ||
    ('proteinRef' in input && typeof input.proteinRef === 'string' && input.proteinRef.length > 0)
  ) {
    return input;
  }
  return {
    ...input,
    proteinRef: createHash('sha256').update(input.sequence).digest('hex'),
  };
}

const parkerScale: Record<string, number> = {
  A: 2.1, C: 1.4, D: 10, E: 7.8, F: -9.2, G: 5.7, H: 2.1,
  I: -8, K: 5.7, L: -9.2, M: -4.2, N: 7, P: 2.1, Q: 6,
  R: 4.2, S: 6.5, T: 5.2, V: -3.7, W: -10, Y: -1.9,
};

function parkerHydrophilicity(sequence: string) {
  const residueScores: Array<{ position: number; score: number }> = [];
  const rawScores: Array<{ position: number; hydrophilicity: number }> = [];
  for (let start = 0; start <= sequence.length - 7; start += 1) {
    const window = sequence.slice(start, start + 7);
    const raw = [...window].reduce((sum, residue) => sum + parkerScale[residue]!, 0) / 7;
    const position = start + 4;
    residueScores.push({ position, score: (raw + 10) / 20 });
    rawScores.push({ position, hydrophilicity: raw });
  }
  const regions: Array<{ start: number; end: number; score: number }> = [];
  for (const residue of residueScores) {
    if (residue.score <= 0.5) continue;
    const last = regions.at(-1);
    if (last && last.end + 1 === residue.position) {
      last.end = residue.position;
      last.score = Math.max(last.score, residue.score);
    } else {
      regions.push({ start: residue.position, end: residue.position, score: residue.score });
    }
  }
  return {
    residueScores,
    regions,
    rawMethodFields: { rawScores, window: 7, thresholdRaw: 0, scoreNormalization: '(raw + 10) / 20', interpretation: 'hydrophilicity proxy, not validated epitope probability' },
    provenance: [{
      connectorId: 'parker-hydrophilicity', connectorVersion: '1.0.0',
      method: 'parker', methodVersion: '1986', status: 'LIVE' as const,
      sourceUri: 'https://nextgen-tools.iedb.org/docs/tools/bcell_sequence/',
      parameters: { sequenceSha256: createHash('sha256').update(sequence).digest('hex'), window: 7 },
      predictionSource: 'LIVE' as const, scientificUse: true,
      validationStatus: 'SCIENTIFIC' as const, algorithm: 'Parker hydrophilicity scale', algorithmVersion: '1986',
    }],
  };
}
