import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { calculateConsensus } from './consensus.js';
import {
  optimizeMultiEpitopeConstruct,
  type ConstructCandidate,
} from './construct-optimization.js';
import { evaluateBaseHardConstraints } from './constraints.js';
import { detectDuplicates } from './duplicates.js';
import { validateFasta } from './fasta.js';
import { normalizeScore } from './normalization.js';
import { resolveOverlaps, type OverlapCandidate } from './overlap.js';
import { generatePeptides } from './peptides.js';
import { calculateConfidence, rankCandidates, type FinalRankingCandidate } from './ranking.js';
import { calculatePreliminaryScore } from './scoring.js';

function benchmark<T>(operation: () => T): { elapsedMilliseconds: number; result: T } {
  const startedAt = performance.now();
  const result = operation();
  return { elapsedMilliseconds: performance.now() - startedAt, result };
}

describe('deterministic algorithm benchmark cases', () => {
  it('validates and generates peptides for 10,000 residues under one second each', () => {
    const sequence = 'ACDEFGHIKLMNPQRSTVWY'.repeat(500);
    const fasta = benchmark(() => validateFasta(`>benchmark\n${sequence}`));
    const peptides = benchmark(() => generatePeptides(sequence, 'MHCI', [8, 9, 10, 11]));

    expect(fasta.result.ok).toBe(true);
    expect(fasta.elapsedMilliseconds).toBeLessThan(1_000);
    expect(peptides.result).toHaveLength(39_966);
    expect(peptides.elapsedMilliseconds).toBeLessThan(1_000);
  });

  it('normalizes 100,000 scores and aggregates 10,000 observations under two seconds', () => {
    const normalization = benchmark(() => {
      let total = 0;
      for (let index = 0; index < 100_000; index += 1) {
        total += normalizeScore(index % 101, {
          kind: 'FIXED_MIN_MAX',
          min: 0,
          max: 100,
          direction: 'HIGHER_BETTER',
        });
      }
      return total;
    });
    const consensus = benchmark(() =>
      calculateConsensus(
        Array.from({ length: 10_000 }, (_value, index) => ({
          observationId: index.toString().padStart(5, '0'),
          normalizedScore: (index % 101) / 100,
          reliabilityWeight: 1,
          required: true,
        })),
        10_000,
      ),
    );

    expect(normalization.result).toBeGreaterThan(0);
    expect(normalization.elapsedMilliseconds).toBeLessThan(2_000);
    expect(consensus.result.completeness).toBe(1);
    expect(consensus.elapsedMilliseconds).toBeLessThan(2_000);
  });

  it('deduplicates 10,000 records and resolves 400 overlap candidates under two seconds', () => {
    const duplicateDetection = benchmark(() =>
      detectDuplicates(
        Array.from({ length: 10_000 }, (_value, index) => ({
          id: `candidate-${index.toString().padStart(5, '0')}`,
          proteinHash: 'protein',
          candidateType: 'MHCI' as const,
          start: index + 1,
          end: index + 9,
          peptide: 'ACDEFGHIK',
          allele: 'HLA-A*02:01',
          observationRefs: [`observation-${index}`],
        })),
      ),
    );
    const overlapCandidates: OverlapCandidate[] = Array.from({ length: 400 }, (_value, index) => ({
      id: `overlap-${index}`,
      candidateKey: `overlap-${index.toString().padStart(4, '0')}`,
      proteinHash: 'protein',
      candidateType: 'MHCI',
      allele: 'HLA-A*02:01',
      peptide: 'ACDEFGHIKL',
      start: index * 20 + 1,
      end: index * 20 + 10,
      length: 10,
      passesHardConstraints: true,
      preliminaryScore: 0.8,
      completeness: 1,
      agreement: 0.9,
    }));
    const overlapResolution = benchmark(() => resolveOverlaps(overlapCandidates, 0.8));

    expect(duplicateDetection.result.canonicalCandidates).toHaveLength(10_000);
    expect(duplicateDetection.elapsedMilliseconds).toBeLessThan(2_000);
    expect(overlapResolution.result.retainedCandidateIds).toHaveLength(400);
    expect(overlapResolution.elapsedMilliseconds).toBeLessThan(2_000);
  });

  it('evaluates constraints, scoring, confidence, and final ranking at scale', () => {
    const constraintsAndScores = benchmark(() => {
      let highConfidenceCount = 0;
      for (let index = 0; index < 10_000; index += 1) {
        const constraints = evaluateBaseHardConstraints({
          candidateType: 'MHCI',
          peptideLength: 9,
          allele: 'HLA-A*02:01',
          allowedLengths: { MHCI: [9], MHCII: [15] },
          supportedAlleles: ['HLA-A*02:01'],
          requiredEvidenceRefs: ['binding'],
          presentEvidenceRefs: ['binding'],
          bindingObservations: [{ evidenceRef: 'binding', percentileRank: 1, required: true }],
          bindingPercentileRankMaximum: 2,
        });
        const score = calculatePreliminaryScore({
          track: 'TCELL',
          bindingQuality: 0.9,
          consensusQuality: 0.8,
          candidateCoverage: 0.7,
          completeness: 1,
          missingOptionalWeightFraction: 0,
          softWarningCount: 0,
        });
        if (
          constraints.passesAllHardConstraints &&
          score.score > 0 &&
          calculateConfidence({
            category: 'RECOMMENDED',
            completeness: 1,
            agreement: 0.9,
            ruleOutcomes: constraints.outcomes,
          }) === 'HIGH'
        ) {
          highConfidenceCount += 1;
        }
      }
      return highConfidenceCount;
    });
    const rankingCandidates: FinalRankingCandidate[] = Array.from(
      { length: 10_000 },
      (_value, index) => ({
        candidateId: `candidate-${index}`,
        candidateKey: `candidate-${index.toString().padStart(5, '0')}`,
        candidateType: 'MHCI',
        finalScore: (index % 101) / 100,
        agreement: 0.9,
        completeness: 1,
        start: index + 1,
        blockingReviewCondition: false,
        ruleOutcomes: [],
      }),
    );
    const ranking = benchmark(() => rankCandidates(rankingCandidates));

    expect(constraintsAndScores.result).toBe(10_000);
    expect(constraintsAndScores.elapsedMilliseconds).toBeLessThan(2_000);
    expect(ranking.result).toHaveLength(10_000);
    expect(ranking.elapsedMilliseconds).toBeLessThan(2_000);
  });

  it('optimizes a 150-candidate construct shortlist under two seconds', () => {
    const candidates: ConstructCandidate[] = Array.from({ length: 150 }, (_value, index) => ({
      candidateId: `candidate-${index}`,
      candidateType: 'MHCI',
      peptide: `ACDEFGHI${'KLMNPQRSTVWY'[index % 12]}`,
      start: index * 3 + 1,
      end: index * 3 + 9,
      rank: index + 1,
      finalScore: 0.5 + (index % 50) / 100,
      agreement: 0.7 + (index % 20) / 100,
      completeness: 1,
      category: index % 13 === 0 ? 'REVIEW' : 'RECOMMENDED',
      populationCoverage: {
        INDIA: ((index * 7) % 80) / 100,
        EUROPE: ((index * 11) % 80) / 100,
        AFRICA: ((index * 13) % 80) / 100,
      },
    }));

    const optimization = benchmark(() =>
      optimizeMultiEpitopeConstruct({
        track: 'MHCI',
        candidates,
        populationWeights: { INDIA: 0.5, EUROPE: 0.3, AFRICA: 0.2 },
        maximumShortlistSize: 8,
        targetCoverage: 0.9,
        generations: 24,
        populationSize: 20,
        seed: 'benchmark',
      }),
    );

    expect(optimization.result.selectedCandidateIds.length).toBeGreaterThan(0);
    expect(optimization.result.selectedCandidateIds.length).toBeLessThanOrEqual(8);
    expect(optimization.result.finalCoverage).toBeGreaterThan(0);
    expect(optimization.elapsedMilliseconds).toBeLessThan(2_000);
  });
});
