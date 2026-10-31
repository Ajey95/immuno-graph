# ImmunoGraph MCP workspace context

Updated 2026-10-31. [PR #13](https://github.com/Ajey95/immuno-graph/pull/13) was merged into `main`. The [v0.2.0 source release](https://github.com/Ajey95/immuno-graph/releases/tag/v0.2.0) and `ghcr.io/ajey95/immuno-graph:0.2.0` container are public. The published container passed [a live MCP smoke run](https://github.com/Ajey95/immuno-graph/actions/runs/41223646880). This repository runs one standard MCP server with 46 registered tools over stdio or guarded Streamable HTTP. The tool list is not a count of independent scientific providers.

## Working live paths

- IEDB MHC-I/II, IEDB BepiPred-3.0, and IEDB population coverage use remote provider APIs when their opt-in flags are enabled and a live-permitting fallback policy is selected.
- RCSB and AlphaFold DB return coordinate artifacts. `calculate_structure_confidence` extracts per-residue pLDDT only from AlphaFold DB PDB bytes; it rejects experimental PDB B-factors.
- PubChem, RDKit, Meeko, Vina, FreeSASA, fpocket, and PLIP have live computation paths. Vina exports actual poses, PDB/PDBQT coordinates, a 3D viewer, and a ZIP. Mol* exports a viewer with actual coordinate data.
- The 1IEP/imatinib Vina example produced three coordinate poses. Its viewer's protein and ligand models matched the ZIP's PDB files byte-for-byte; the top pose was 0.900 Å from the supplied prepared ligand over 37 matching heavy atoms. A PLIP parser fix now preserves the example's pi-stack contact, yielding 10 structured contacts matching the raw XML count. These are computational checks, not experimental binding validation.
- Ranking, constraints, calibration, and reporting tools calculate from caller-supplied evidence. Their scientific validity depends on that evidence. Two tools are deliberately named synthetic demonstrations.

## Reproduce and inspect

Run `npm ci`, `npm run check`, then set the required live connector variables in the MCP host's server environment, using `.env.example` as a reference. The check includes a 46-tool semantic audit and artifact hash verification. A separate Codex LLM client has called all 46 documented examples with 46 successful MCP envelopes, plus a live BepiPred request; host-level environment configuration was required for the IEDB flag. `node --import tsx scripts/verify-live-bcell.mts` saves BepiPred JSON/CSV; `node --import tsx scripts/verify-live-alphafold.mts` saves an AlphaFold PDB and per-residue pLDDT JSON. Set `IMMUNOGRAPH_LIVE_OUTPUT_DIR` to choose an export directory. The two scripts accept `IMMUNOGRAPH_BCELL_SEQUENCE` and `IMMUNOGRAPH_ALPHAFOLD_ACCESSION` respectively. See [LIVE_WORKFLOWS.md](LIVE_WORKFLOWS.md) for the docking file chain and [TOOL_REALITY_MATRIX.md](TOOL_REALITY_MATRIX.md) for each tool's verification status.

## Remaining limits

GraphBepi remains exact-fixture-only: its upstream runtime and model are not installed or validated here. BepiPred-3.0 is the supported live B-cell alternative; Parker is a hydrophilicity proxy. npm and MCP Registry publication await npm authentication. No remote production deployment has been claimed; TLS ingress has not been verified.
