# Changelog

## 0.2.0 - 2026-10-31

- Replace the NitroStack runtime with the official MCP TypeScript SDK.
- Expose the existing 46 scientific tools over stdio and Streamable HTTP.
- Add standard client smoke tests, packaging, Docker, CI, and contributor guidance.
- Prepare npm and MCP Registry metadata and a manual container publication workflow.
- Return actual inline PDB, SDF, PDBQT, Vina pose, 3D viewer, and docking ZIP files from live MCP calls.
- Verify live RCSB, PubChem, RDKit, Meeko, IEDB MHC-I/MHC-II, and AutoDock Vina paths through a standard MCP client.
- Run PLIP, FreeSASA, fpocket, direct structure mapping, and Mol* with supplied coordinate data when their runtimes are configured; fail explicitly when a required live dependency is missing.
- Verify all 46 documented examples through an LLM MCP host and an independent semantic audit, including artifact hashes and fixture provenance.
- Include PLIP pi-stacking contacts in the structured interaction result; previously the raw XML contained them but the normalized list omitted them.

The source release and container image are published. npm and MCP Registry publication are pending npm account authentication.
