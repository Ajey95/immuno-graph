import { loadFixtureRegistry } from '@immunograph/database/mcp';
import { describe, expect, it } from 'vitest';

import { LocalFixtureCapabilityPort } from './local-fixture-capability-port.js';

describe('LocalFixtureCapabilityPort', () => {
  it('returns non-empty exact-match MHC-I observations with fixture provenance', async () => {
    const registry = await loadFixtureRegistry();
    const fixture = registry.cases.find(({ fixtureId }) => fixtureId === 'covid-spike');
    expect(fixture).toBeDefined();
    const selector = fixture?.selectors.find(({ track }) => track === 'MHCI');
    expect(selector).toBeDefined();
    const port = new LocalFixtureCapabilityPort(Promise.resolve(registry));

    const result = (await port.invoke('predict_mhci', {
      runId: 'run-1',
      proteinRef: fixture?.proteinSha256,
      alleles: selector?.alleles,
      peptideLengths: selector?.peptideLengths,
      methods: selector?.methods.map(({ method }) => method),
      fallbackPolicy: 'FIXTURE_ONLY',
    })) as {
      observations: Array<{ sourceStatus?: string }>;
      provenance: Array<{ status: string; fixtureId?: string }>;
    };

    expect(result.observations.length).toBeGreaterThan(0);
    expect(result.provenance).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'FIXTURE', fixtureId: fixture?.fixtureId }),
      ]),
    );
    expect(result.provenance.every(({ status }) => status === 'FIXTURE')).toBe(true);
  });

  it('serves GraphBepi only from the fixture path', async () => {
    const registry = await loadFixtureRegistry();
    const fixture = registry.cases.find(({ fixtureId }) => fixtureId === 'covid-spike');
    const port = new LocalFixtureCapabilityPort(Promise.resolve(registry));

    const result = (await port.invoke('predict_bcell_fixture', {
      runId: 'run-1',
      proteinRef: fixture?.proteinSha256,
      methods: ['graphbepi'],
      parameters: {},
      fallbackPolicy: 'FIXTURE_ONLY',
    })) as {
      regions: unknown[];
      provenance: Array<{ status: string }>;
    };

    expect(result.regions.length).toBeGreaterThan(0);
    expect(result.provenance.every(({ status }) => status === 'FIXTURE')).toBe(true);
    expect(result.provenance.some(({ status }) => status === 'LIVE' || status === 'CACHED')).toBe(
      false,
    );
  });

  it('fails closed when the protein reference does not exactly match a fixture', async () => {
    const port = new LocalFixtureCapabilityPort(loadFixtureRegistry());

    await expect(
      port.invoke('predict_mhci', {
        runId: 'run-1',
        proteinRef: 'f'.repeat(64),
        alleles: ['HLA-A*02:01'],
        peptideLengths: [9],
        methods: ['iedb-recommended'],
        fallbackPolicy: 'FIXTURE_ONLY',
      }),
    ).rejects.toMatchObject({ code: 'FIXTURE_NOT_FOUND' });
  });

  it('returns only a matching synthetic population-coverage fixture', async () => {
    const registry = await loadFixtureRegistry();
    const fixture = registry.cases.find(({ fixtureId }) => fixtureId === 'covid-spike');
    const observation = fixture?.expectedCandidates.observations[0];
    const port = new LocalFixtureCapabilityPort(Promise.resolve(registry));

    const result = (await port.invoke('calculate_population_coverage', {
      runId: 'run-1',
      associations: [{ candidateId: observation?.candidateRef, allele: observation?.allele }],
      populationIds: fixture?.expectedCandidates.coverage.populationIds,
      classMode: fixture?.expectedCandidates.coverage.classMode,
      fallbackPolicy: 'FIXTURE_ONLY',
    })) as { projectedCoverage: number; provenance: { status: string; fixtureId?: string } };

    expect(result.projectedCoverage).toBeGreaterThan(0);
    expect(result.provenance).toMatchObject({
      status: 'FIXTURE',
      fixtureId: fixture?.fixtureId,
    });
  });
});
