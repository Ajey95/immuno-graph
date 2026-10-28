# ImmunoGraph MCP: 46-tool execution reality

Updated 2026-10-28. `npm run test:all-tools` calls all 46 examples through a standard MCP client. That proves registration and example execution, **not** 46 independent live scientific integrations. A real deterministic transform processes caller-supplied data; a live provider fetches or computes with the configured scientific runtime. Inspect each result's provenance and supplied input before drawing scientific conclusions.

| Tool | Actual operation | Current verification |
| --- | --- | --- |
| `validate_sequence` | Parse and hash supplied FASTA | MCP test, real input |
| `generate_candidate_peptides` | Enumerate actual sequence windows | MCP test, real input |
| `predict_mhci` | IEDB live MHC-I predictor | Live MCP call verified |
| `predict_mhcii` | IEDB live MHC-II predictor | Live MCP call verified |
| `predict_bcell` | Parker sequence hydrophilicity; GraphBepi branch is fixture only | Parker live computation verified; GraphBepi pending |
| `predict_synthetic_binding` | Deliberately synthetic binding example | Demo only by contract |
| `normalize_scores` | Apply supplied normalization profile | MCP example verified |
| `compute_consensus` | Weighted consensus over supplied observations | MCP example verified |
| `compute_consensus_batch` | Batch weighted consensus | MCP example verified |
| `calculate_population_coverage` | Official IEDB next-generation API, optional standalone or configured service | Live MCP call verified with World HLA data |
| `calculate_synthetic_population_coverage` | Deliberately synthetic frequency calculation | Demo only by contract |
| `rank_candidates` | Rank supplied candidate evidence | MCP example verified |
| `optimize_shortlist_coverage` | Optimize supplied coverage matrix | MCP example verified; dependent on input provenance |
| `optimize_construct_genetic` | Genetic optimization over supplied candidates | MCP example verified; dependent on input provenance |
| `calibrate_confidence` | Fit Platt/isotonic to labeled calibration data; score held-out labels | Live MCP labeled-data call verified; rule-based mode has no measured reliability |
| `detect_overlapping_epitopes` | Compare actual candidate intervals | MCP example verified |
| `remove_duplicate_candidates` | Deduplicate supplied candidates | MCP example verified |
| `validate_thresholds` | Check supplied threshold configuration | MCP example verified |
| `categorize_candidates` | Categorize supplied scores and rules | MCP example verified |
| `apply_constraint_rules` | Apply supplied hard constraints | MCP example verified |
| `fetch_structure` | Download RCSB PDB coordinates | Live MCP call verified |
| `validate_structure` | Parse actual PDB atoms/residues and chain | Live MCP call verified |
| `map_epitopes_to_structure` | Align sequence to PDB coordinates | Live MCP call verified |
| `calculate_surface_accessibility` | FreeSASA on actual PDB coordinates | Live MCP call verified |
| `calculate_structure_confidence` | Summarize supplied confidence metrics | MCP example verified; not an independent confidence predictor |
| `detect_binding_pockets` | fpocket on actual PDB coordinates | Live MCP call verified |
| `create_molstar_view` | Export HTML with actual coordinate data | Live MCP export verified |
| `fetch_compound` | Query PubChem | Live MCP call verified |
| `validate_compound` | RDKit parse and canonicalize supplied SMILES | Live MCP call verified |
| `deduplicate_compounds` | RDKit InChIKey identity | Live MCP call verified |
| `calculate_molecular_descriptors` | RDKit descriptors when selected and enabled | Live MCP call verified; explicit failure if RDKit requested but unavailable |
| `prepare_ligand` | RDKit 3D conformer and Meeko PDBQT | Live MCP exported SDF/PDBQT verified |
| `prepare_receptor` | Meeko receptor PDBQT from PDB coordinates | Live MCP exported PDBQT verified |
| `validate_docking_box` | Validate supplied box geometry | MCP example verified |
| `run_docking` | AutoDock Vina scoring and poses | Live MCP docking and file exports verified |
| `cluster_docking_poses` | Coordinate RMSD clustering | Live MCP call verified |
| `extract_interactions` | PLIP contacts on docked complex PDB | Live MCP call verified |
| `generate_report` | Render supplied snapshot to JSON/CSV bytes | MCP artifact bytes and hashes verified |
| `export_candidates` | Render supplied candidates to CSV/JSON bytes | MCP artifact bytes and hashes verified |
| `visualize_results` | Build a view model from supplied evidence | MCP example verified; returns data rather than a rendered image |
| `explain_candidate` | Deterministic explanation from supplied evidence | MCP example verified |
| `export_workflow_trace` | Serialize supplied events to JSON artifact | MCP artifact bytes and hash verified |
| `describe_agentic_workflow` | Return the bounded agent manifest | MCP example verified |
| `run_agentic_workflow` | LangGraph invokes approved typed handlers when `toolCalls` are supplied | Real nested MCP handler call and denial test verified; no-call mode is a plan only |
| `chat_with_research_agent` | Answer from supplied evidence, optional configured LLM | Deterministic evidence response verified; no independent retrieval |
| `export_research_package` | Build ZIP from supplied package snapshot | MCP artifact bytes and hash verified |

## What still breaks first

1. GraphBepi requires an independently installed model/runtime and a validated output adapter. Its public repository documents Linux, historical Python/Torch versions, pretrained model downloads, and PDB/FASTA prediction commands; it is not bundled here. The Parker path is a hydrophilicity proxy, not an equivalent B-cell model.
2. IEDB next-generation population coverage has a live MCP call with the World AFND dataset. The optional standalone and custom-service paths have not been live verified. Do not relabel the exact fixture or synthetic calculator as population evidence.
3. Most ranking, confidence, constraint, and export tools consume supplied data. Their code executes real calculations/serialization, but the scientific quality of results follows the provenance and quality of those inputs.
4. A docking pose, contact, epitope prediction, or population estimate is computational evidence and needs independent scientific review and experimental validation.

Run `scripts/verify-live-workflow.mts`, `scripts/verify-live-chemistry.mts`, and `scripts/verify-live-population.mts` for the newly added live call proofs. See [LIVE_WORKFLOWS.md](LIVE_WORKFLOWS.md) for the earlier PDB, PubChem, IEDB, Vina, PLIP, FreeSASA, fpocket, and Mol* proof chain.
