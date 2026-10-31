# Live MCP calls and file exports

The 46 registered tools are not 46 live scientific integrations. `npm run test:all-tools` checks discovery, schemas, and fixture example calls. Use `LIVE_ONLY` and inspect `sourceStatus` or `provenance.status` to establish a live result. Fixture and synthetic output must not be presented as a live prediction.

`npm run test:semantics` also calls all 46 documented examples through a standard MCP client. It checks each tool's intended output fields and behavior, verifies inline artifact lengths and SHA-256 hashes, and inspects the research ZIP's entries. These examples cover contract behavior; many deliberately use fixtures. The live verifier scripts below provide separate evidence for real provider and computation paths.

A separate Codex LLM MCP client also called all 46 documented examples once each: 46 unique calls and 46 successful `ok` envelopes. Its first attempt exposed missing read-only annotations on five constraint calculations; those annotations are now present and asserted by `test:semantics`. The LLM example run used fixture and synthetic inputs where documented, so it does not replace live provider verification.

## Verified live path

The MCP server has been exercised through a standard MCP client with these real operations:

| Tool | Inputs | Returned data |
| --- | --- | --- |
| `fetch_structure` | RCSB accession and `LIVE_ONLY` | Downloaded PDB coordinate artifact with SHA-256 |
| `fetch_structure`, `calculate_structure_confidence` | AlphaFold DB accession, then returned PDB bytes with `modelSource: "ALPHAFOLD_DB"` | Per-residue pLDDT, mean confidence, and JSON artifact |
| `fetch_compound` | PubChem CID and `LIVE_ONLY` | PubChem title and SMILES |
| `calculate_molecular_descriptors` | SMILES and `method: "rdkit"` | RDKit descriptor values |
| `prepare_receptor` | PDB bytes, chain IDs, `preparationMethod: "meeko"` | Meeko PDBQT artifact with coordinates |
| `prepare_ligand` | SMILES, `preparationMethod: "meeko"` | RDKit 3D SDF and Meeko PDBQT artifacts |
| `predict_mhci`, `predict_mhcii` | Sequence, allele, `LIVE_ONLY` | IEDB observations with `LIVE` provenance |
| `run_docking` | Actual receptor/ligand PDBQT, box, `mode: "VINA"`, `LIVE_ONLY` | Vina poses, PDBQT, 3D viewer HTML, ZIP |
| `validate_structure` | PDB bytes, actual protein residue count, chain IDs | Coordinate-backed checks |
| `map_epitopes_to_structure` | Reference sequence, PDB bytes, candidate positions | BioPython aligned PDB residue mapping |
| `calculate_surface_accessibility` | PDB bytes and mapped intervals, `method: "freesasa"` | Relative solvent accessibility and per-residue JSON |
| `detect_binding_pockets` | PDB bytes, `method: "fpocket"` | Pocket scores, druggability, alpha-sphere centroids, report |
| `create_molstar_view` | Protein PDB and optional ligand PDB bytes | Mol* HTML with embedded 3D coordinates |
| `cluster_docking_poses` | Vina poses PDBQT and matching pose records | Coordinate RMSD clusters or DBSCAN noise |
| `extract_interactions` | Single-ligand complex PDB, `method: "plip"` | PLIP contacts and original XML report |
| `predict_bcell` | Protein sequence, `methods: ["parker"]` | Local Parker hydrophilicity scale, raw and normalized scores |
| `predict_bcell` | Protein sequence, `methods: ["bepipred-3.0"]`, `LIVE_ONLY` | IEDB BepiPred-3.0 residue probabilities and linear regions |
| `validate_compound`, `deduplicate_compounds` | Actual SMILES, `sourceStatus: "LIVE"` | RDKit molecular parsing and InChIKey identity |
| `calibrate_confidence` | Separate labeled calibration and evaluation samples | Fitted Platt/isotonic probabilities and held-out Brier/ECE |
| `run_agentic_workflow` | Approved `toolCalls` with typed arguments | LangGraph invokes actual registered handlers and returns their envelopes |
| `calculate_population_coverage` | Epitope/HLA restrictions, `populationIds: ["world"]`, `LIVE_ONLY` | Official IEDB next-generation AFND population coverage |

Within `toolCalls`, a later argument can consume a prior result with `{ "$result": "validate_sequence.data.normalizedSequence" }`. Calls execute in workflow stage order and return the actual tool envelopes in `toolResults`. The caller must provide each tool's remaining typed arguments. `requireHumanApproval: true` pauses before a gated stage; it does not approve a stage automatically.

Each exported artifact contains `contentBase64`, `sha256`, and `byteLength`. Decode the bytes and verify SHA-256 before saving. An `mcp://` reference by itself is not a downloadable file; the inline bytes are the file. `run_docking` includes a ZIP with `receptor.pdbqt`, `ligand.pdbqt`, `poses.pdbqt`, receptor and top-pose PDB files, `complex.pdb`, `vina.log`, `box.json`, and `viewer.html`. The complex PDB is also an inline artifact for PLIP. The 3Dmol and Mol* viewers load versioned libraries from CDNs; their coordinates are embedded or exported in files.

The structured PLIP contact list normalizes hydrophobic contacts, hydrogen bonds, salt bridges, and pi stacking. The original XML artifact retains PLIP's full interaction report, including other contact classes that are not yet normalized into the MCP list. For the live 1IEP example, the current adapter returns 10 structured contacts (6 hydrophobic, 3 hydrogen bonds, and 1 pi stack).

## Local setup

Install Node.js 20+ and run `npm ci && npm run build`. Install a Python environment with `python -m venv .venv-live` and `.venv-live\Scripts\python -m pip install -r scripts/live/requirements.txt` on Windows. Install the native AutoDock Vina executable separately and set its absolute path as `VINA_COMMAND`. On Linux/macOS, use that environment's `bin/python` path. The Vina executable and scientific Python packages are optional dependencies and are not bundled in the npm package.

Set `RCSB_PDB_ENABLED=true`, `PUBCHEM_ENABLED=true`, `IEDB_LIVE_ENABLED=true`, `IEDB_BCELL_ENABLED=true`, `RDKIT_ENABLED=true`, `MEEKO_ENABLED=true`, `VINA_ENABLED=true`, `RDKIT_PYTHON_COMMAND`, `MEEKO_PYTHON_COMMAND`, `VINA_COMMAND`, and `DOCKING_COMMAND_TIMEOUT_MS=600000` in the server environment. The connector flags default to false. No fixture fallback is used in the live verification scripts.

MCP hosts may sanitize the shell environment before starting a server. Put the required flags and command paths in that host's per-server environment configuration. For example, a separate Codex CLI client reached the server but initially received `IEDB_BCELL_NOT_CONFIGURED` until `mcp_servers.immunograph.env.IEDB_BCELL_ENABLED="true"` was set for that client; the same `LIVE_ONLY` BepiPred request then returned live residue scores. Set `tool_timeout_sec` high enough for remote jobs or docking.

For analysis, set `PLIP_ENABLED=true`, `FREESASA_ENABLED=true`, `FPOCKET_ENABLED=true`, `MOLSTAR_ENABLED=true`, and `SCIENTIFIC_PYTHON_COMMAND` to the interpreter with the pinned Python dependencies. fpocket needs a native executable. On Windows, fpocket can run in WSL with `FPOCKET_WSL_DISTRO` and a Linux `FPOCKET_COMMAND` path. Vina can likewise run in WSL with `VINA_WSL_DISTRO` and `VINA_COMMAND=vina`. See [`.env.example`](../.env.example).

The reproducible MCP client probes are `scripts/verify-live-sources.mts`, `scripts/verify-live-docking.mts`, `scripts/verify-live-analysis.mts`, `scripts/verify-live-chemistry.mts`, `scripts/verify-live-workflow.mts`, `scripts/verify-live-population.mts`, `scripts/verify-live-bcell.mts`, and `scripts/verify-live-alphafold.mts`. The first three require environment variables naming the input files and an output directory; see the `required()` calls at the top of each script. The BepiPred and AlphaFold probes write real JSON/CSV or PDB/JSON exports to `IMMUNOGRAPH_LIVE_OUTPUT_DIR` when set, or to their own `outputs/` folders. The docking verifier uses the [official AutoDock Vina 1IEP example files](https://github.com/ccsb-scripps/AutoDock-Vina/tree/develop/example/basic_docking/solution) and documented 1IEP box. The analysis verifier uses the actual 1IEP PDB, docked complex PDB, and Vina poses PDBQT. Input files and executables are not committed here.

For a different protein, set `IMMUNOGRAPH_BCELL_SEQUENCE` and optionally `IMMUNOGRAPH_BCELL_PROTEIN_REF` before running `node --import tsx scripts/verify-live-bcell.mts`. Set `IMMUNOGRAPH_ALPHAFOLD_ACCESSION` and optionally `IMMUNOGRAPH_ALPHAFOLD_TARGET_ID` before running `node --import tsx scripts/verify-live-alphafold.mts`. Run `npm run build` first. These scripts enable only their required live connector and use no fixture fallback.

For a full live file chain, `fetch_structure` can download RCSB 1IEP PDB, `prepare_receptor` can select chain A and export its PDBQT, `fetch_compound` can retrieve PubChem CID 5291 (imatinib), `prepare_ligand` can generate its 3D SDF and PDBQT, and `run_docking` can consume those two prepared PDBQT files with the documented 1IEP box. The [Vina basic docking guide](https://autodock-vina.readthedocs.io/en/stable/docking_basic.html) identifies 1IEP and imatinib as its example system.

## Current limits

Set `IEDB_POPULATION_COVERAGE_ENABLED=true` to use the official [IEDB next-generation API](https://nextgen-tools.iedb.org/docs/api/endpoints/) by default. `scripts/verify-live-population.mts` submitted a World AFND job and read a completed result through MCP. The endpoint is remote and its availability and population data can change.

GraphBepi remains exact-fixture-only because no validated, distributable live connector is configured. Parker hydrophilicity is a physicochemical proxy, not an epitope probability. The server does not screen-scrape the B-cell website. AlphaFold pLDDT is local model confidence, not epitope probability; the PDB parser rejects experimental B-factors as pLDDT. Other deterministic tools transform caller-supplied values; they do not independently fetch experimental data. `run_agentic_workflow` executes supplied approved `toolCalls`; without them it returns a plan. A Vina score or pose, PLIP contact, or pocket score is computational evidence, not validated binding or clinical evidence. See [TOOL_REALITY_MATRIX.md](TOOL_REALITY_MATRIX.md) for all 46 tool statuses.
