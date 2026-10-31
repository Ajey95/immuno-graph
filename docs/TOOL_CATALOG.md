# Tool catalog

ImmunoGraph registers 46 MCP tools across seven modules. This table describes the operation each tool performs; live connector availability depends on configuration and external providers. Inspect the returned provenance before scientific interpretation. See [tool reality matrix](TOOL_REALITY_MATRIX.md) for verification status and [src/modules/tool-contracts.ts](../src/modules/tool-contracts.ts) for input contracts.

### Prediction · 6 tools

| Tool | What it does |
| --- | --- |
| `validate_sequence` | Validates one protein FASTA record and returns the normalized sequence, length, and SHA-256 hash. |
| `generate_candidate_peptides` | Creates stable, one-based MHC-I or MHC-II peptide windows for requested lengths. |
| `predict_mhci` | Resolves MHC-I binding observations through configured IEDB/MHCflurry paths or an exact fixture. |
| `predict_mhcii` | Resolves MHC-II binding observations through configured IEDB or an exact fixture. |
| `predict_bcell` | Runs live IEDB BepiPred-3.0 from a supplied sequence when enabled, computes the Parker hydrophilicity scale locally, or replays an exact GraphBepi fixture. |
| `predict_synthetic_binding` | Computes deterministic offline demonstration binding values, labelled `SYNTHETIC` and unsuitable as scientific predictions. |

### Evidence and prioritization · 9 tools

| Tool | What it does |
| --- | --- |
| `normalize_scores` | Applies versioned transformations to raw predictor scores so later comparisons use a defined scale. |
| `compute_consensus` | Combines method observations into weighted consensus, agreement, and completeness for one candidate group. |
| `compute_consensus_batch` | Performs the same deterministic consensus calculation across multiple independent groups. |
| `calculate_population_coverage` | Calculates HLA population coverage through the official IEDB next-generation API when enabled, an optional standalone/script, or an exact-match fixture. |
| `calculate_synthetic_population_coverage` | Calculates demonstration coverage from explicitly synthetic HLA frequencies. |
| `rank_candidates` | Computes profile-based preliminary scores or stable final ranks; final mode requires completed constraint results. |
| `optimize_shortlist_coverage` | Selects a T-cell shortlist using supplied candidates and coverage targets; local optimization output is marked demonstration-only. |
| `optimize_construct_genetic` | Runs seeded, deterministic construct optimization with coverage and redundancy constraints; output is demonstration-only. |
| `calibrate_confidence` | Fits Platt/isotonic calibration with labeled training samples and evaluates on separate labeled outcomes; rule-based mode reports no measured reliability. |

### Constraints · 5 tools

| Tool | What it does |
| --- | --- |
| `detect_overlapping_epitopes` | Finds positional overlaps and connected components without deciding which candidate wins. |
| `remove_duplicate_candidates` | Collapses exact positional duplicates while preserving matching peptides at different coordinates. |
| `validate_thresholds` | Evaluates configured hard biological thresholds and returns rule outcomes. |
| `categorize_candidates` | Assigns deterministic candidate categories and blocking conditions from completed scores and rules. |
| `apply_constraint_rules` | Applies base, duplicate, and overlap rules to an immutable candidate snapshot. |

### Structure · 7 tools

| Tool | What it does |
| --- | --- |
| `fetch_structure` | Retrieves RCSB PDB/AlphaFold coordinates when enabled and returns the actual PDB bytes as an inline artifact, or a labelled fixture record. |
| `validate_structure` | Checks actual PDB chain and residue records for live input, or checks labelled fixture metadata. |
| `map_epitopes_to_structure` | Aligns a reference sequence to actual PDB protein chains with BioPython and maps candidate positions. |
| `calculate_surface_accessibility` | Runs FreeSASA on supplied PDB coordinates and mapped residues, exporting per-residue areas. |
| `calculate_structure_confidence` | Extracts per-residue AlphaFold pLDDT from supplied AlphaFold DB PDB bytes and exports JSON, or summarizes explicitly supplied normalized metrics. |
| `detect_binding_pockets` | Runs fpocket on supplied PDB coordinates and returns scored pockets with measured alpha sphere centers. |
| `create_molstar_view` | Exports a Mol* HTML viewer embedding supplied protein and optional ligand PDB coordinates. |

### Chemistry · 5 tools

| Tool | What it does |
| --- | --- |
| `fetch_compound` | Retrieves PubChem metadata when enabled or replays a labelled compound fixture. |
| `validate_compound` | Parses non-fixture SMILES with RDKit and reports canonical molecular identity. |
| `deduplicate_compounds` | Groups non-fixture compounds by RDKit InChIKey. |
| `calculate_molecular_descriptors` | Uses RDKit when configured and requested; otherwise returns lightweight labelled estimates. |
| `prepare_ligand` | Uses configured RDKit and Meeko to export real 3D SDF and PDBQT bytes, or returns a fixture-labelled reference. |

### Docking · 5 tools

| Tool | What it does |
| --- | --- |
| `prepare_receptor` | Uses configured Meeko with supplied PDB bytes and chain selection to export real PDBQT bytes, or returns a fixture-labelled reference. |
| `validate_docking_box` | Checks docking-box dimensions before an attempted docking run. |
| `run_docking` | Runs AutoDock Vina on supplied receptor and ligand PDBQT bytes plus a real box. Exports pose PDBQT, a protein-ligand complex PDB, 3D viewer HTML, and a ZIP. |
| `cluster_docking_poses` | Clusters actual Vina ligand coordinates by RMSD with hierarchical or DBSCAN-style grouping. |
| `extract_interactions` | Runs PLIP on a supplied complex PDB and exports parsed contacts and the original XML report. |

#### Molecular docking result

The [live workflow guide](LIVE_WORKFLOWS.md) describes a fresh Vina MCP call against the official 1IEP example, including the exported pose coordinates, 3D viewer, and reproducibility settings. The viewer is generated from the returned coordinates.

### Reports and utilities · 9 tools

| Tool | What it does |
| --- | --- |
| `generate_report` | Creates report data from the supplied run and evidence snapshot. |
| `export_candidates` | Exports candidate records with raw and normalized score fields kept distinct. |
| `visualize_results` | Builds a validated visualization **view model** for a client to render. |
| `explain_candidate` | Explains a fixed candidate decision without changing its underlying scientific values. |
| `export_workflow_trace` | Exports an ordered, redacted trace of supplied events. |
| `describe_agentic_workflow` | Returns metadata about available stages, tool permissions, and approval gates. |
| `run_agentic_workflow` | Invokes supplied approved `toolCalls` through LangGraph and returns actual handler results; without calls, returns a plan. |
| `chat_with_research_agent` | Responds from a caller-supplied evidence summary and abstains when evidence is absent. |
| `export_research_package` | Returns a checksummed research ZIP as base64 content with artifact metadata, assembled from the supplied snapshot. |

The workflow/chat utility names are part of the MCP API. The client still makes each scientific tool call explicitly.

