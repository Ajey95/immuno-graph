import {
  artifactListSchema,
  candidateDetailSchema,
  candidateComparisonSchema,
  candidateListSchema,
  connectorHealthListSchema,
  connectorListSchema,
  coverageVisualizationSchema,
  createdProjectSchema,
  graphSchema,
  profileListSchema,
  projectDetailSchema,
  reportJobSchema,
  runDetailSchema,
  runtimeSettingsSchema,
  sequenceMapSchema,
  shortlistOptimizationSchema,
} from '@immunograph/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiJson, apiRequest } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export const useProject = (id: string) =>
  useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => apiRequest(`/projects/${id}`, projectDetailSchema),
    enabled: id !== '',
  });
export const useRun = (id: string) =>
  useQuery({
    queryKey: queryKeys.run(id),
    queryFn: () => apiRequest(`/runs/${id}`, runDetailSchema),
    enabled: id !== '',
  });
export const useWorkflow = (
  id: string,
  options?: { enabled?: boolean; refetchInterval?: number | false },
) =>
  useQuery({
    queryKey: ['workflow', id],
    queryFn: () => apiRequest(`/runs/${id}/workflow-graph`, graphSchema),
    enabled: id !== '',
    ...(options ?? {}),
  });
export const useEvidence = (id: string, depth: number) =>
  useQuery({
    queryKey: ['evidence', id, depth],
    queryFn: () => apiRequest(`/runs/${id}/evidence-graph?depth=${depth}`, graphSchema),
    enabled: id !== '',
  });
export const useCandidates = (
  id: string,
  params: URLSearchParams,
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: [...queryKeys.candidates(id), params.toString()],
    queryFn: () => apiRequest(`/runs/${id}/candidates?${params.toString()}`, candidateListSchema),
    enabled: id !== '' && (options?.enabled ?? true),
  });
export const useCandidate = (
  runId: string,
  candidateId?: string,
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: ['candidate', runId, candidateId],
    queryFn: () =>
      apiRequest(`/runs/${runId}/candidates/${candidateId ?? ''}`, candidateDetailSchema),
    enabled: runId !== '' && candidateId !== undefined && (options?.enabled ?? true),
  });
export const useSequenceMap = (id: string) =>
  useQuery({
    queryKey: ['sequence-map', id],
    queryFn: () => apiRequest(`/runs/${id}/visualizations/sequence-map`, sequenceMapSchema),
    enabled: id !== '',
  });
export const useCoverageVisualization = (id: string) =>
  useQuery({
    queryKey: ['coverage-view', id],
    queryFn: () =>
      apiRequest(`/runs/${id}/visualizations/population-coverage`, coverageVisualizationSchema),
    enabled: id !== '',
  });
export const useShortlistOptimization = (
  id: string,
  track: 'MHCI' | 'MHCII',
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: ['shortlist-optimization', id, track],
    queryFn: () =>
      apiRequest(`/runs/${id}/shortlist-optimization?track=${track}`, shortlistOptimizationSchema),
    enabled: id !== '' && (options?.enabled ?? true),
    retry: false,
  });
export const useArtifacts = (id: string) =>
  useQuery({
    queryKey: queryKeys.artifacts(id),
    queryFn: () => apiRequest(`/runs/${id}/artifacts`, artifactListSchema),
    enabled: id !== '',
  });

export function useDiagnostics() {
  const connectors = useQuery({
    queryKey: ['connectors'],
    queryFn: () => apiRequest('/connectors', connectorListSchema),
  });
  const health = useQuery({
    queryKey: ['connector-health'],
    queryFn: () => apiRequest('/connectors/health', connectorHealthListSchema),
  });
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: () => apiRequest('/settings/profiles', profileListSchema),
  });
  const runtime = useQuery({
    queryKey: ['runtime'],
    queryFn: () => apiRequest('/settings/runtime', runtimeSettingsSchema),
  });
  return { connectors, health, profiles, runtime };
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      organism: string;
      proteinName: string;
      description?: string;
      fasta: string;
    }) => apiRequest('/projects', createdProjectSchema, apiJson('POST', body)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useCreateReport(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest(
        `/runs/${runId}/reports`,
        reportJobSchema,
        apiJson('POST', {
          formats: ['JSON', 'CSV'],
          templateVersion: 'research-report-v1',
          includeWorkflowTrace: true,
          includeEvidenceGraph: true,
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.artifacts(runId) }),
  });
}

const idempotencyKey = (operation: string) => `${operation}-${globalThis.crypto.randomUUID()}`;

export function useCreateRun(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: import('@immunograph/shared').RunConfiguration) =>
      apiRequest(
        `/projects/${projectId}/runs`,
        runDetailSchema,
        apiJson('POST', body, idempotencyKey('run-create')),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) }),
  });
}

export function useApproveConfiguration(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { expectedConfigurationHash: string; note?: string }) =>
      apiRequest(
        `/runs/${runId}/approvals/configuration`,
        runDetailSchema,
        apiJson('POST', { decision: 'APPROVE', ...body }, idempotencyKey('configuration-approval')),
      ),
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates(run.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.artifacts(run.id) });
    },
  });
}

export function useStartRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest(
        `/runs/${runId}/start`,
        runDetailSchema,
        apiJson('POST', {}, idempotencyKey('run-start')),
      ),
    onSuccess: (run) => {
      queryClient.setQueryData(queryKeys.run(run.id), run);
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates(run.id) });
      void queryClient.invalidateQueries({ queryKey: ['coverage-view', run.id] });
      void queryClient.invalidateQueries({ queryKey: ['shortlist-optimization', run.id] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.artifacts(run.id) });
    },
  });
}

export function useCancelRun(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest(`/runs/${runId}/cancel`, runDetailSchema, apiJson('POST', {})),
    onSuccess: (run) => queryClient.setQueryData(queryKeys.run(run.id), run),
  });
}

export function useApproveShortlist(runId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      expectedRankingSnapshotHash: string;
      approvedCandidateIds: string[];
      excludedCandidateIds: string[];
      note?: string;
    }) =>
      apiRequest(
        `/runs/${runId}/approvals/shortlist`,
        runDetailSchema,
        apiJson('POST', { decision: 'APPROVE', ...body }, idempotencyKey('shortlist-approval')),
      ),
    onSuccess: (run) => queryClient.setQueryData(queryKeys.run(run.id), run),
  });
}

export function useCompareCandidates(runId: string) {
  return useMutation({
    mutationFn: (candidateIds: string[]) =>
      apiRequest(
        `/runs/${runId}/candidates/compare`,
        candidateComparisonSchema,
        apiJson('POST', { candidateIds }, idempotencyKey('candidate-compare')),
      ),
  });
}
