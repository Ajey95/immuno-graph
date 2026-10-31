# Release checklist

Release status for v0.2.0. Checkmarks reflect verified outcomes, not merely prepared files.

- [x] Review the MIT license and package name.
- [x] Review every public tool contract and the scientific provenance language against the 46-tool semantic audit and [tool reality matrix](docs/TOOL_REALITY_MATRIX.md).
- [x] Run CI on Windows/Linux with Node 20 and 22 and resolve every failure.
- [x] Build and run the published Docker image; verify health, bearer auth, 46-tool discovery, and a live MCP call in [the container smoke run](https://github.com/Ajey95/immuno-graph/actions/runs/41223646880).
- [x] Verify authenticated MCP calls through a test TLS ingress in [the container release run](https://github.com/Ajey95/immuno-graph/actions/runs/41223884868). A managed remote deployment is separate.
- [x] Confirm `npm pack --dry-run` contains the compiled server, `data/`, license, and docs.
- [x] Install the generated npm tarball in a clean directory and confirm a standard MCP client discovers 46 tools and calls `validate_sequence` successfully.
- [x] Confirm `package.json` `mcpName` matches `server.json` and validate the registry manifest against the official schema.
- [ ] Publish the first `immunograph-mcp` npm package and verify installation from npm.
- [x] Create a matching [GitHub release](https://github.com/Ajey95/immuno-graph/releases/tag/v0.2.0) and publish a [traceable container image](https://github.com/Ajey95/immuno-graph/pkgs/container/immuno-graph).
- [ ] Register the published package in the official MCP Registry, then verify the listing.
- [ ] Replace source-only installation instructions with exact published versions and URLs.

No live connector or experimental scientific validation is implied by a software release.
