# Release checklist

The migration branch prepares an open source MCP release. None of the steps below is completed by adding this file.

- [ ] Review the MIT license and package name with the maintainer.
- [ ] Review every public tool contract and the scientific provenance language.
- [ ] Run CI on Windows/Linux with Node 20 and 22 and resolve every failure.
- [ ] Build and run the Docker image, including authenticated HTTP through a TLS ingress.
- [x] Confirm `npm pack --dry-run` contains the compiled server, `data/`, license, and docs.
- [x] Install the generated npm tarball in a clean directory and confirm a standard MCP client discovers 46 tools and calls `validate_sequence` successfully.
- [x] Confirm `package.json` `mcpName` matches `server.json` and validate the registry manifest against the official schema.
- [ ] Publish the first `immunograph-mcp` npm package and verify installation from npm.
- [ ] Create a matching GitHub release and publish a signed or traceable container image.
- [ ] Register the published package in the official MCP Registry, then verify the listing.
- [ ] Replace source-only installation instructions with exact published versions and URLs.

No live connector or experimental scientific validation is implied by a software release.
