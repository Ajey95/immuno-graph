export const AGENT_MANIFEST_VERSION = 'mvp-v1.0';
export const AGENTIC_WORKFLOW_PLAN_VERSION = 'mvp-v1.0';

export type ToolGroupName =
  'Prediction Tools' | 'Evidence Tools' | 'Constraint Tools' | 'Report Tools';

export type InternalAgentStatus = 'ACTIVE' | 'INTERFACE_READY';

export interface InternalAgent {
  agentId: string;
  displayName: string;
  role: string;
  status: InternalAgentStatus;
  scope: string;
  responsibilities: readonly string[];
  allowedToolGroups: readonly ToolGroupName[];
  decisionPolicy: {
    mayGenerateScientificValues: boolean;
    mustUseMcpToolsForEvidence: boolean;
    mustExposeProvenance: boolean;
    abstainWhenEvidenceMissing: boolean;
  };
}

export interface WorkflowPlanNode {
  nodeId: string;
  label: string;
  agentId: string;
  toolNames: readonly string[];
  approvalRequired: boolean;
  output: string;
}

export interface WorkflowPlanEdge {
  from: string;
  to: string;
  condition: string;
}

export interface AgenticWorkflowDescription {
  deploymentBoundary: 'ONE_NITROSTACK_MCP_APP';
  manifestVersion: string;
  planVersion: string;
  runId: string;
  runIntent: 'MVP_EPITOPE_PRIORITIZATION';
  agents: readonly InternalAgent[];
  workflowPlan: {
    nodes: readonly WorkflowPlanNode[];
    edges: readonly WorkflowPlanEdge[];
    humanApprovalGates: readonly string[];
  };
  guardrails: {
    authRequired: false;
    conservationInMvp: false;
    toxicityInMvp: false;
    graphBepiMode: 'FIXTURE_ONLY';
    syntheticScientificUse: false;
  };
  finalResearchPackage: {
    requiredArtifact: 'research-package.zip';
    includesCsvExports: true;
    requiredSections: readonly string[];
  };
}

const ACTIVE_DECISION_POLICY = {
  mayGenerateScientificValues: false,
  mustUseMcpToolsForEvidence: true,
  mustExposeProvenance: true,
  abstainWhenEvidenceMissing: true,
} as const;

export const INTERNAL_AGENTS: readonly InternalAgent[] = [
  {
    agentId: 'supervisor-orchestrator',
    displayName: 'Supervisor / Orchestrator Agent',
    role: 'Owns the deterministic workflow graph and delegates each stage to bounded agents.',
    status: 'ACTIVE',
    scope: 'Coordinates the single-run MVP epitope prioritization workflow.',
    responsibilities: [
      'Build the stage order from documented policy.',
      'Select MCP tools by capability instead of embedding scientific calculations.',
      'Stop at human approval gates before shortlist and report finalization.',
    ],
    allowedToolGroups: ['Prediction Tools', 'Evidence Tools', 'Constraint Tools', 'Report Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'sequence-validation',
    displayName: 'Sequence Validation Agent',
    role: 'Validates FASTA input and prepares normalized sequence identity.',
    status: 'ACTIVE',
    scope: 'FASTA validation, amino-acid validation, checksums, and peptide-window preparation.',
    responsibilities: [
      'Reject invalid FASTA before prediction.',
      'Preserve original and normalized inputs for the research package.',
      'Generate deterministic candidate peptide windows.',
    ],
    allowedToolGroups: ['Prediction Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'immunology',
    displayName: 'Immunology Agent',
    role: 'Collects MHC, B-cell, and population coverage evidence through approved connectors.',
    status: 'ACTIVE',
    scope: 'MHC-I, MHC-II, B-cell fixture evidence, and population coverage evidence.',
    responsibilities: [
      'Use live IEDB and optional MHCflurry when available.',
      'Use synthetic and fixture fallback only with explicit provenance.',
      'Never label synthetic values as scientific predictions.',
    ],
    allowedToolGroups: ['Prediction Tools', 'Evidence Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'structure',
    displayName: 'Structure Agent',
    role: 'Reserved interface for future structure evidence.',
    status: 'INTERFACE_READY',
    scope: 'Phase 2 structure confidence and docking preparation; not executed in MVP v1.0.',
    responsibilities: [
      'Remain visible as an interface boundary.',
      'Return no MVP scientific claims.',
      'Avoid blocking the MVP workflow.',
    ],
    allowedToolGroups: ['Evidence Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'compound',
    displayName: 'Compound Agent',
    role: 'Reserved interface for future chemistry or docking work.',
    status: 'INTERFACE_READY',
    scope: 'Phase 2 chemistry and compound workflows; not executed in MVP v1.0.',
    responsibilities: [
      'Remain visible as an interface boundary.',
      'Return no MVP scientific claims.',
      'Avoid introducing undocumented chemistry scope.',
    ],
    allowedToolGroups: ['Evidence Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'ranking',
    displayName: 'Ranking Agent',
    role: 'Applies deterministic scoring, consensus, calibration, and construct optimization.',
    status: 'ACTIVE',
    scope:
      'Candidate prioritization, confidence calibration, redundancy minimization, and coverage optimization.',
    responsibilities: [
      'Apply frozen MVP weights and hard constraints.',
      'Use deterministic genetic-style shortlist optimization for construct assembly.',
      'Produce explainable ranking components.',
    ],
    allowedToolGroups: ['Evidence Tools', 'Constraint Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'verifier',
    displayName: 'Verifier Agent',
    role: 'Checks provenance, constraints, completeness, and approval readiness.',
    status: 'ACTIVE',
    scope: 'Governance review before shortlist approval and final report generation.',
    responsibilities: [
      'Confirm every candidate has documented provenance.',
      'Flag synthetic or fixture-only outputs clearly.',
      'Require researcher approval before report generation.',
    ],
    allowedToolGroups: ['Evidence Tools', 'Constraint Tools', 'Report Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
  {
    agentId: 'reporting',
    displayName: 'Reporting Agent',
    role: 'Creates final reports, exports, traces, and the mandatory research package.',
    status: 'ACTIVE',
    scope: 'Report generation, candidate exports, workflow trace export, and research-package.zip.',
    responsibilities: [
      'Generate JSON and CSV report artifacts.',
      'Export a redacted workflow trace.',
      'Assemble the PRD-mandated final research package.',
    ],
    allowedToolGroups: ['Report Tools'],
    decisionPolicy: ACTIVE_DECISION_POLICY,
  },
] as const;

const WORKFLOW_NODES: readonly WorkflowPlanNode[] = [
  {
    nodeId: 'validate-sequence',
    label: 'Validate sequence',
    agentId: 'sequence-validation',
    toolNames: ['validate_sequence'],
    approvalRequired: false,
    output: 'normalized sequence and input checksums',
  },
  {
    nodeId: 'generate-peptides',
    label: 'Generate candidate peptides',
    agentId: 'sequence-validation',
    toolNames: ['generate_candidate_peptides'],
    approvalRequired: false,
    output: 'positional candidate windows',
  },
  {
    nodeId: 'predict-immunology',
    label: 'Collect immunology evidence',
    agentId: 'immunology',
    toolNames: [
      'predict_mhci',
      'predict_mhcii',
      'predict_bcell',
      'predict_synthetic_binding',
      'calculate_population_coverage',
      'calculate_synthetic_population_coverage',
    ],
    approvalRequired: false,
    output: 'connector-provenance-labeled observations',
  },
  {
    nodeId: 'score-consensus',
    label: 'Normalize and calculate consensus',
    agentId: 'ranking',
    toolNames: ['normalize_scores', 'compute_consensus', 'compute_consensus_batch'],
    approvalRequired: false,
    output: 'normalized scores and consensus evidence',
  },
  {
    nodeId: 'apply-constraints',
    label: 'Apply constraints and resolve overlap',
    agentId: 'ranking',
    toolNames: [
      'validate_thresholds',
      'remove_duplicate_candidates',
      'detect_overlapping_epitopes',
      'apply_constraint_rules',
    ],
    approvalRequired: false,
    output: 'eligible candidates and rejected candidates',
  },
  {
    nodeId: 'rank-candidates',
    label: 'Rank candidates',
    agentId: 'ranking',
    toolNames: ['rank_candidates', 'categorize_candidates', 'optimize_shortlist_coverage'],
    approvalRequired: false,
    output: 'ranked candidates and optimized shortlist proposal',
  },
  {
    nodeId: 'verify-shortlist',
    label: 'Verify shortlist readiness',
    agentId: 'verifier',
    toolNames: ['visualize_results', 'explain_candidate'],
    approvalRequired: true,
    output: 'researcher shortlist approval request',
  },
  {
    nodeId: 'generate-research-package',
    label: 'Generate final research package',
    agentId: 'reporting',
    toolNames: ['generate_report', 'export_candidates', 'export_workflow_trace'],
    approvalRequired: true,
    output: 'reports, CSV exports, and research-package.zip',
  },
] as const;

const WORKFLOW_EDGES: readonly WorkflowPlanEdge[] = [
  { from: 'validate-sequence', to: 'generate-peptides', condition: 'valid FASTA' },
  { from: 'generate-peptides', to: 'predict-immunology', condition: 'candidate windows available' },
  {
    from: 'predict-immunology',
    to: 'score-consensus',
    condition: 'evidence collected or explicit fallback used',
  },
  { from: 'score-consensus', to: 'apply-constraints', condition: 'score snapshots complete' },
  { from: 'apply-constraints', to: 'rank-candidates', condition: 'hard constraints evaluated' },
  { from: 'rank-candidates', to: 'verify-shortlist', condition: 'ranked candidates available' },
  {
    from: 'verify-shortlist',
    to: 'generate-research-package',
    condition: 'researcher approval recorded',
  },
] as const;

const REQUIRED_RESEARCH_PACKAGE_SECTIONS = [
  'manifest.json',
  'project.json',
  'run.json',
  'configuration.json',
  'inputs/',
  'predictions/',
  'candidates/',
  'construct/',
  'evidence/',
  'reports/',
  'checksums.json',
] as const;

export function describeAgenticWorkflow(input: {
  runId: string;
  runIntent: 'MVP_EPITOPE_PRIORITIZATION';
  includeFutureInterfaces: boolean;
}): AgenticWorkflowDescription {
  const agents = input.includeFutureInterfaces
    ? INTERNAL_AGENTS
    : INTERNAL_AGENTS.filter((agent) => agent.status === 'ACTIVE');
  const agentIds = new Set(agents.map((agent) => agent.agentId));
  const nodes = WORKFLOW_NODES.filter((node) => agentIds.has(node.agentId));
  return {
    deploymentBoundary: 'ONE_NITROSTACK_MCP_APP',
    manifestVersion: AGENT_MANIFEST_VERSION,
    planVersion: AGENTIC_WORKFLOW_PLAN_VERSION,
    runId: input.runId,
    runIntent: input.runIntent,
    agents,
    workflowPlan: {
      nodes,
      edges: WORKFLOW_EDGES.filter(
        (edge) =>
          nodes.some((node) => node.nodeId === edge.from) &&
          nodes.some((node) => node.nodeId === edge.to),
      ),
      humanApprovalGates: ['verify-shortlist', 'generate-research-package'],
    },
    guardrails: {
      authRequired: false,
      conservationInMvp: false,
      toxicityInMvp: false,
      graphBepiMode: 'FIXTURE_ONLY',
      syntheticScientificUse: false,
    },
    finalResearchPackage: {
      requiredArtifact: 'research-package.zip',
      includesCsvExports: true,
      requiredSections: REQUIRED_RESEARCH_PACKAGE_SECTIONS,
    },
  };
}
