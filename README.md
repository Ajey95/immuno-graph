# 🧬 ImmunoGraph MCP

<p align="center">
  <strong>Typed research tools for computational epitope prioritization</strong><br />
  One MCP server · Explicit provenance · Reproducible offline demonstrations
</p>

<p align="center">
  <img alt="MCP server" src="https://img.shields.io/badge/MCP-single%20server-6144b1?style=flat-square" />
  <img alt="46 registered tools" src="https://img.shields.io/badge/tools-46-216e8a?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square" />
  <img alt="NitroStack" src="https://img.shields.io/badge/runtime-NitroStack-243b53?style=flat-square" />
</p>

ImmunoGraph exposes sequence validation, prediction adapters, evidence processing, structure and chemistry utilities, docking adapters, and research-package export through **one NitroStack MCP application**. An MCP host can discover and call the tools individually. The server contains 46 registered tools across seven modules; the modules are **not** separate MCP servers.

> [!IMPORTANT]
> ImmunoGraph is computational research support. Its synthetic and fixture outputs are demonstrations, not experimental evidence. A candidate shortlist, docking pose, or generated report does not establish vaccine efficacy, safety, or clinical utility. Independent scientific review and experimental validation are required.

**Jump to:** [Capabilities](#capabilities) · [Architecture](#architecture) · [Quick start](#quick-start) · [MCP usage](#mcp-usage) · [Execution modes](#execution-modes-and-provenance) · [Current limits](#current-limits)

## What is in this repository?

| Item | Current implementation |
| --- | --- |
| Deployable application | One MCP server, `immunograph-mcp`, built with NitroStack |
| Interface | 46 typed MCP tools; no React workspace or Fastify API in this public branch |
| Local computation | FASTA validation, peptide generation, normalization, consensus, constraints, ranking, and report assembly |
| External capabilities | Optional IEDB, MHCflurry, RCSB PDB, AlphaFold DB, PubChem, and local scientific binaries |
| Offline data | Versioned profiles, reference data, synthetic values, and exact-match fixtures under `data/` |
| Workflow | A LangGraph-based trace of named agent stages; see [Agent workflow](#agent-workflow) for its execution boundary |

The previous, broader product README is preserved in [oldreadme.md](oldreadme.md). It describes a larger UI/API workspace that is not present in this branch.

## Capabilities

| Module | Tools | Examples | Current execution boundary |
| --- | ---: | --- | --- |
| Prediction | 6 | `validate_sequence`, `generate_candidate_peptides`, `predict_mhci`, `predict_mhcii`, `predict_bcell` | IEDB and MHCflurry are optional; GraphBepi is fixture-only. A separate synthetic predictor is available for demonstrations. |
| Evidence | 9 | `normalize_scores`, `compute_consensus`, `rank_candidates`, `calculate_population_coverage` | Deterministic calculations use supplied evidence; live population coverage requires explicit configuration. |
| Constraints | 5 | `validate_thresholds`, `detect_overlapping_epitopes`, `apply_constraint_rules` | Local rule and overlap calculations. |
| Structure | 7 | `fetch_structure`, `map_epitopes_to_structure`, `detect_binding_pockets` | RCSB/AlphaFold lookups and FreeSASA/fpocket paths require enabled connectors or local binaries; fixture paths exist. |
| Chemistry | 5 | `fetch_compound`, `calculate_molecular_descriptors`, `prepare_ligand` | PubChem, RDKit, and Open Babel paths require explicit setup; fixture paths exist. |
| Docking | 5 | `prepare_receptor`, `run_docking`, `extract_interactions` | AutoDock Vina and PLIP paths require local binaries; the offline path returns labelled fixture results. |
| Reports & workflow | 9 | `generate_report`, `export_research_package`, `run_agentic_workflow` | Reports and ZIPs are assembled from supplied data; the agent workflow currently emits a trace rather than executing the listed scientific tools. |

Tool inputs are validated with Zod. Tool responses include structured success or failure data and metadata such as the tool name, run ID, timestamps, and input/output hashes. The complete schemas live in [`src/modules/tool-contracts.ts`](src/modules/tool-contracts.ts) and the individual controllers in [`src/modules/`](src/modules/).

## Architecture

```mermaid
flowchart LR
    Host["MCP host / research client"] --> Server["immunograph-mcp<br/>one NitroStack server"]
    Server --> Tools["46 typed tools<br/>7 modules"]
    Tools --> Algorithms["Local algorithms<br/>and profiles"]
    Tools --> Live["Optional live services<br/>and local binaries"]
    Tools --> Fixtures["Synthetic data<br/>and exact-match fixtures"]
    Tools --> Export["Reports, traces<br/>and research ZIP"]
    Server -.-> Graph["LangGraph agent-stage trace"]
```

The MCP server is registered in [`src/app.module.ts`](src/app.module.ts). Algorithms and data loaders are under `src/lib/`; tool handlers and connector adapters are under `src/modules/`. `data/` contains the reference manifests, profiles, schemas, and offline fixtures needed by the server. Run the application from the repository root so those files resolve correctly.

## Quick start

**Requirements:** Node.js 20.19.x and npm 10.x are the documented project target. Live scientific features additionally need their respective services, model downloads, or local binaries.

```bash
git clone https://github.com/Ajey95/immuno-graph.git
cd immuno-graph
npm ci
npm run build
npm start
```

The build compiles the MCP package. On startup, NitroStack registers the 46 tools. `npm run dev` is also available for NitroStack's development workflow. To customize runtime settings, copy [`.env.example`](.env.example) to `.env` and set only the capabilities you intend to use. Keep `data/` alongside the application when deploying; the reference and fixture loaders read from the repository root.

**Connecting an MCP host:** launch the built `dist/index.js` with the repository root as its working directory and choose a transport supported by your NitroStack/host setup. `.env.example` documents the transport settings. This repository does not ship a host-specific client configuration.

## MCP usage

Tools are independently callable. For example, an MCP client can call `validate_sequence` with:

```json
{
  "fasta": ">protein\nACDEFGHIK",
  "profileVersion": "mvp-v1.0"
}
```

The response contains a normalized sequence, its length and SHA-256 hash, or a structured validation error. `generate_candidate_peptides` can then create peptide windows. A research client must explicitly call the prediction, evidence, ranking, and export tools it needs and pass the resulting evidence between them.

For a standalone offline demonstration, the repository includes exact-match fixtures in `data/fixtures/` and a separate `predict_synthetic_binding` tool. Fixture-backed prediction only succeeds when the protein reference **and** method, allele, peptide-length, and parameter selectors match an approved fixture. An arbitrary new sequence is not automatically given a fixture prediction.

## Execution modes and provenance

Most live connectors are **disabled by default**. These switches are defined in [`src/modules/config/environment.ts`](src/modules/config/environment.ts):

| Capability | Enablement | Additional dependency |
| --- | --- | --- |
| IEDB MHC binding | `IEDB_LIVE_ENABLED=true` | Network access to a compatible IEDB endpoint |
| IEDB population coverage | `IEDB_POPULATION_COVERAGE_ENABLED=true` | Configured endpoint or standalone script |
| MHCflurry | `MHCFLURRY_ENABLED=true` | Installed CLI and downloaded models |
| RCSB PDB / AlphaFold DB | `RCSB_PDB_ENABLED=true` / `ALPHAFOLD_DB_ENABLED=true` | Network access |
| PubChem | `PUBCHEM_ENABLED=true` | Network access |
| AutoDock Vina and other local tools | Individual flags such as `VINA_ENABLED=true` | Installed binaries and valid inputs |
| Optional LLM text | `LLM_ENABLED=true` | `OPENAI_API_KEY` and configured model |

Results carry provenance labels. `LIVE` means a configured connector ran during the request; `FIXTURE` means approved data was replayed; `SYNTHETIC` means demonstration-only values were computed. Failures are returned as structured tool errors. Some contracts also represent `CACHED` values, but this standalone branch does not include the SQLite persistence layer described in the archived README. Do not interpret synthetic or fixture results as live scientific measurements.

## Agent workflow

`describe_agentic_workflow` returns a manifest of named roles, permitted tool groups, and proposed approval gates. `run_agentic_workflow` runs a **fixed sequence** of LangGraph nodes and records selected tool names and trace steps. Its nodes do not currently call the prediction, structure, docking, or export tools themselves. When enabled, the LLM can produce bounded planning text; it does not dynamically rewire or execute the graph. Without LLM configuration, the mode is deterministic.

This distinction matters for integration: use the individual MCP tools to perform scientific operations, and treat the agent workflow output as planning/trace metadata. The workflow trace alone is not evidence that its listed scientific operations ran.

## Current limits

- This public branch contains the MCP application and data assets, but not the web UI, REST API, or SQLite-backed project lifecycle described in the archived README.
- Most scientific connectors need external services, downloaded models, or local binaries. Their presence in code does not verify a live deployment.
- GraphBepi is fixture-only. Synthetic and fixture outputs are demonstration data with restricted scientific use.
- The Vina adapter and docking fixtures are implementation paths, not validation of a docking protocol or biological conclusion.
- `package.json` has a build script but no automated test script. A successful build and tool registration do not establish scientific accuracy or end-to-end reproducibility.

## Repository map

```text
src/app.module.ts          NitroStack MCP application and module registration
src/modules/               Tool controllers, connector adapters, orchestration
src/lib/algorithms/         Local deterministic algorithms
src/lib/database/           Data/fixture/profile loaders and validation
src/widgets/                Widget scaffold (no bundled widgets currently)
data/reference/             Reference manifests and versioned records
data/profiles/              Ranking and biological-constraint profiles
data/fixtures/              Exact-match offline demonstration cases
oldreadme.md                Archived previous README
```

## Verification

For the MCP-only branch reviewed on 6 October 2026: `npm ci` and `npm run build` completed, and `npm start` initialized the server with **46 tools and 0 widgets** after the full `data/` directory was present. Live connectors, full research workflows, and scientific results were **not** verified by that check.

---

**Research carefully.** Keep inputs, configuration, provenance, and reviewer decisions with every exported result.
