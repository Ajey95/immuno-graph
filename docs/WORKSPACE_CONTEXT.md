# ImmunoGraph MCP workspace context

Updated 2026-10-29. Active development branch: `feat/standard-mcp-runtime`; draft PR: [#13](https://github.com/Ajey95/immuno-graph/pull/13). This repository runs one standard MCP server with 46 registered tools over stdio or guarded Streamable HTTP. The tool list is not a count of independent scientific providers.

## Working live paths

- IEDB MHC-I/II, IEDB BepiPred-3.0, and IEDB population coverage use remote provider APIs when their opt-in flags are enabled and a live-permitting fallback policy is selected.
- RCSB and AlphaFold DB return coordinate artifacts. `calculate_structure_confidence` extracts per-residue pLDDT only from AlphaFold DB PDB bytes; it rejects experimental PDB B-factors.
- PubChem, RDKit, Meeko, Vina, FreeSASA, fpocket, and PLIP have live computation paths. Vina exports actual poses, PDB/PDBQT coordinates, a 3D viewer, and a ZIP. Mol* exports a viewer with actual coordinate data.
- Ranking, constraints, calibration, and reporting tools calculate from caller-supplied evidence. Their scientific validity depends on that evidence. Two tools are deliberately named synthetic demonstrations.

## Reproduce and inspect

Run `npm ci`, `npm run check`, then set the required live connector variables in the MCP host's server environment, using `.env.example` as a reference. The check includes a 46-tool semantic audit and artifact hash verification. A separate Codex LLM client has exercised sequence validation, candidate generation, and live BepiPred through MCP; host-level environment configuration was required for the IEDB flag. `node --import tsx scripts/verify-live-bcell.mts` saves BepiPred JSON/CSV; `node --import tsx scripts/verify-live-alphafold.mts` saves an AlphaFold PDB and per-residue pLDDT JSON. Set `IMMUNOGRAPH_LIVE_OUTPUT_DIR` to choose an export directory. The two scripts accept `IMMUNOGRAPH_BCELL_SEQUENCE` and `IMMUNOGRAPH_ALPHAFOLD_ACCESSION` respectively. See [LIVE_WORKFLOWS.md](LIVE_WORKFLOWS.md) for the docking file chain and [TOOL_REALITY_MATRIX.md](TOOL_REALITY_MATRIX.md) for each tool's verification status.

## Remaining limits

GraphBepi remains exact-fixture-only: its upstream runtime and model are not installed or validated here. BepiPred-3.0 is the supported live B-cell alternative; Parker is a hydrophilicity proxy. The PR remains a draft. No npm or MCP Registry release or remote production deployment has been claimed.
