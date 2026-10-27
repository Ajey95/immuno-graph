# Live MCP calls and file exports

The 46 registered tools are not 46 live scientific integrations. `npm run test:all-tools` checks discovery, schemas, and fixture example calls. Use `LIVE_ONLY` and inspect `sourceStatus` or `provenance.status` to establish a live result. Fixture and synthetic output must not be presented as a live prediction.

## Verified live path

The MCP server has been exercised through a standard MCP client with these real operations:

| Tool | Inputs | Returned data |
| --- | --- | --- |
| `fetch_structure` | RCSB accession and `LIVE_ONLY` | Downloaded PDB coordinate artifact with SHA-256 |
| `fetch_compound` | PubChem CID and `LIVE_ONLY` | PubChem title and SMILES |
| `calculate_molecular_descriptors` | SMILES and `method: "rdkit"` | RDKit descriptor values |
| `prepare_receptor` | PDB bytes, chain IDs, `preparationMethod: "meeko"` | Meeko PDBQT artifact with coordinates |
| `prepare_ligand` | SMILES, `preparationMethod: "meeko"` | RDKit 3D SDF and Meeko PDBQT artifacts |
| `predict_mhci`, `predict_mhcii` | Sequence, allele, `LIVE_ONLY` | IEDB observations with `LIVE` provenance |
| `run_docking` | Actual receptor/ligand PDBQT, box, `mode: "VINA"`, `LIVE_ONLY` | Vina poses, PDBQT, 3D viewer HTML, ZIP |

Each exported artifact contains `contentBase64`, `sha256`, and `byteLength`. Decode the bytes and verify SHA-256 before saving. An `mcp://` reference by itself is not a downloadable file; the inline bytes are the file. `run_docking` includes a ZIP with `receptor.pdbqt`, `ligand.pdbqt`, `poses.pdbqt`, receptor and top-pose PDB files, `vina.log`, `box.json`, and `viewer.html`. The HTML uses 3Dmol.js from a CDN, so the viewer needs network access; the coordinates remain in the ZIP for offline use.

## Local setup

Install Node.js 20+ and run `npm ci && npm run build`. Install a Python environment with `python -m venv .venv-live` and `.venv-live\Scripts\python -m pip install -r scripts/live/requirements.txt` on Windows. Install the native AutoDock Vina executable separately and set its absolute path as `VINA_COMMAND`. On Linux/macOS, use that environment's `bin/python` path. The Vina executable and scientific Python packages are optional dependencies and are not bundled in the npm package.

Set `RCSB_PDB_ENABLED=true`, `PUBCHEM_ENABLED=true`, `IEDB_LIVE_ENABLED=true`, `RDKIT_ENABLED=true`, `MEEKO_ENABLED=true`, `VINA_ENABLED=true`, `RDKIT_PYTHON_COMMAND`, `MEEKO_PYTHON_COMMAND`, `VINA_COMMAND`, and `DOCKING_COMMAND_TIMEOUT_MS=600000` in the server environment. The connector flags default to false. No fixture fallback is used in the live verification scripts.

The reproducible MCP client probes are `scripts/verify-live-sources.mts` and `scripts/verify-live-docking.mts`. They require environment variables naming the input files and an output directory; see the `required()` calls at the top of each script. The docking verifier uses the [official AutoDock Vina 1IEP example files](https://github.com/ccsb-scripps/AutoDock-Vina/tree/develop/example/basic_docking/solution) and documented 1IEP box. The files are fetched separately; no scientific input files or executables are committed here.

For a full live file chain, `fetch_structure` can download RCSB 1IEP PDB, `prepare_receptor` can select chain A and export its PDBQT, `fetch_compound` can retrieve PubChem CID 5291 (imatinib), `prepare_ligand` can generate its 3D SDF and PDBQT, and `run_docking` can consume those two prepared PDBQT files with the documented 1IEP box. The [Vina basic docking guide](https://autodock-vina.readthedocs.io/en/stable/docking_basic.html) identifies 1IEP and imatinib as its example system.

## Current limits

`predict_bcell` has only exact fixtures. Live PLIP interactions, FreeSASA accessibility, fpocket coordinates, direct epitope-to-structure mapping, and Mol* export are incomplete and fail explicitly when their live modes are requested. Other deterministic tools transform caller-supplied values; they do not independently fetch experimental data. `run_agentic_workflow` returns a stage trace and does not execute the listed scientific tools. A Vina score or pose is computational evidence, not a validated binding or clinical result.
