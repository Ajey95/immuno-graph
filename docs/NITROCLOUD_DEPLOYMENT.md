# NitroCloud deployment

## Deployment scope

NitroCloud is purpose-built for MCP servers. In this repository it deploys
`apps/mcp`, not the React web application or REST API. Deploy the complete
web/API/MCP product with `compose.yaml` on a container platform; deploy the MCP
service to NitroCloud when a public remote MCP endpoint is required.

## Verified project commands

Run all commands from the repository root:

```powershell
cd "C:\Users\BhaviChasvi\Downloads\immuno\immuno-graph"
npm install --engine-strict=false
npm run nitro:verify
```

NitroCloud build command:

```text
npm run nitro:build
```

NitroCloud start command:

```text
npm start
```

The service listens on the cloud-provided `PORT`, binds to `0.0.0.0`, and
exposes the MCP base path at `/mcp`.

## Current CLI limitation

As verified with `@nitrostack/cli` 1.0.15, the available commands include
`build`, `start`, and `pack`, but do not include `login` or `deploy`. Its `pack`
command also assumes a single-package project and rejects this npm workspace
layout. Use GitHub import for this monorepo. Do not use the older
`nitrostack login` or `nitrostack deploy` examples unless a future CLI version
actually exposes those commands.

## Dashboard deployment

1. Sign in to the NitroCloud dashboard linked from
   `https://nitrocloud.ai`.
2. Create a new MCP project or open the existing ImmunoGraph project.
3. Choose GitHub import and select `Ajey95/immuno-graph`.
4. Select branch `main` and repository root `/`.
5. Set Node.js 20.
6. Set the build command to `npm run nitro:build`.
7. Set the start command to `npm start`.
8. If the dashboard supports Docker deployments, select `Dockerfile.mcp`
   instead. This is required for bundled local IEDB population-coverage
   execution because that image installs Python and the IEDB runtime.
9. Add the environment variables below.
10. Deploy and wait for the assigned HTTPS URL.

## Environment variables

Set these non-secret values in NitroCloud:

```dotenv
NODE_ENV=production
LOG_LEVEL=info
HOST=0.0.0.0
MCP_TRANSPORT_TYPE=http
EXECUTION_MODE=HYBRID
DEMO_MODE=true
LLM_ENABLED=false
IEDB_LIVE_ENABLED=true
IEDB_TIMEOUT_MS=120000
IEDB_MAX_RESPONSE_BYTES=10485760
GRAPHBEPI_MODE=fixture
MHCFLURRY_ENABLED=false
APPLICATION_VERSION=0.1.0
SPECIFICATION_VERSION=0.8.0
```

Do not set a fixed `PORT` when NitroCloud provides one automatically.

## Access control

The current MCP application does not configure an OAuth issuer/JWKS verifier.
Unless the NitroCloud project supplies its own access control, the deployed MCP
tools are publicly callable. For a public demo, explicitly set:

```dotenv
OAUTH_REQUIRED=false
```

For a production or private scientific workspace, enable NitroCloud project
access controls or configure NitroStack OAuth (`OAUTH_REQUIRED=true` plus a
trusted `JWKS_URI`, `TOKEN_ISSUER`, and `TOKEN_AUDIENCE`) before sharing the
endpoint. Do not enable `OAUTH_REQUIRED` without a verifier: NitroStack fails
closed and rejects authenticated requests in that state.

For a normal Node build, disable the local Python population connector:

```dotenv
IEDB_POPULATION_COVERAGE_ENABLED=false
```

For a `Dockerfile.mcp` deployment, use:

```dotenv
IEDB_POPULATION_COVERAGE_ENABLED=true
IEDB_POPULATION_COVERAGE_SCRIPT_PATH=/opt/iedb/population_coverage/calculate_population_coverage.py
IEDB_POPULATION_COVERAGE_PYTHON_COMMAND=python3
IEDB_POPULATION_COVERAGE_TIMEOUT_MS=120000
IEDB_POPULATION_COVERAGE_MAX_RESPONSE_BYTES=10485760
```

## Post-deployment verification

Replace `<host>` with the hostname NitroCloud assigns:

```powershell
$base = "https://<host>/mcp"
Invoke-WebRequest -UseBasicParsing "$base/health"
Invoke-WebRequest -UseBasicParsing "$base/sse"
```

The health request must return a successful response. Configure MCP clients
with the assigned HTTPS host and base path `/mcp`.

After obtaining the URL, set the API deployment's `MCP_SERVER_URL` to the
NitroCloud MCP URL, for example:

```dotenv
MCP_SERVER_URL=https://<host>/mcp
MCP_REQUEST_TIMEOUT_MS=180000
```

Then redeploy the separate API/web stack.
