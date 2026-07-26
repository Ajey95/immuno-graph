# ImmunoGraph NitroStack MCP

Standalone NitroStack CLI project for deploying the ImmunoGraph MCP server to
NitroCloud.

## Structure

```text
src/
  index.ts
  app.module.ts
  modules/
    prediction/
    evidence/
    constraint/
    structure/
    chemistry/
    docking/
    report/
  widgets/
  lib/
    algorithms/
    database/
data/
nitrostack.config.ts
```

The layout follows the NitroStack CLI scaffold: root `package.json`,
`tsconfig.json`, `src/index.ts`, `src/app.module.ts`, and feature modules under
`src/modules`.

## Commands

```powershell
npm install
npm run dev
npm run build
npm start
```

These commands intentionally use the NitroStack CLI:

- `npm run dev` -> `nitrostack-cli dev`
- `npm run build` -> `nitrostack-cli build`
- `npm start` -> `npm run build && nitrostack-cli start`

## NitroCloud

Use this folder (`nitro-mcp`) as the NitroCloud deployment root.

Build command:

```text
npm run build
```

Start command:

```text
npm run start:prod
```

The NitroStack CLI injects `PORT` for `nitrostack-cli start`. For OAuth
metadata, set `RESOURCE_URI` to the public NitroCloud URL. Keep
`OAUTH_REQUIRED=false` unless `JWKS_URI` or `INTROSPECTION_ENDPOINT` is also
configured.
