import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const devStopScript = readFileSync(join(process.cwd(), 'scripts/dev-stop.mjs'), 'utf8');
const devStatusScript = readFileSync(join(process.cwd(), 'scripts/dev-status.mjs'), 'utf8');
const mcpPackageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'apps/mcp/package.json'), 'utf8'),
) as {
  scripts: Record<string, string>;
};
const mcpDevScript = readFileSync(join(process.cwd(), 'scripts/dev-mcp.mjs'), 'utf8');

describe('local dev orchestration scripts', () => {
  it('provides explicit status and stop commands for stale dev processes', () => {
    expect(packageJson.scripts['dev:status']).toBe('node scripts/dev-status.mjs');
    expect(packageJson.scripts['dev:stop']).toBe('node scripts/dev-stop.mjs');
  });

  it('keeps MCP independently startable for NitroStack transport checks', () => {
    expect(packageJson.scripts['mcp:dev']).toBe('npm run dev --workspace @immunograph/mcp');
    expect(packageJson.scripts['mcp:start']).toBe('npm run start --workspace @immunograph/mcp');
    expect(mcpPackageJson.scripts.dev).toBe('node ../../scripts/dev-mcp.mjs');
  });

  it('starts MCP dev with explicit local HTTP transport defaults', () => {
    expect(mcpDevScript).toContain("['run', 'build', '--workspace', '@immunograph/mcp']");
    expect(mcpDevScript).toContain("shell: process.platform === 'win32'");
    expect(mcpDevScript).toContain("const mcpEntryPoint = join(mcpRoot, 'dist', 'index.js')");
    expect(mcpDevScript).toContain("MCP_TRANSPORT_TYPE: process.env.MCP_TRANSPORT_TYPE ?? 'http'");
    expect(mcpDevScript).toContain(
      "MCP_HOST: process.env.MCP_HOST ?? process.env.HOST ?? '127.0.0.1'",
    );
    expect(mcpDevScript).toContain("MCP_PORT: process.env.MCP_PORT ?? process.env.PORT ?? '3001'");
  });

  it('does not target its own PowerShell helper process when stopping stale services', () => {
    expect(devStopScript).toContain('$_.ProcessId -ne $PID');
    expect(devStopScript).toContain('$_.Name -match "^(node|cmd|esbuild)"');
  });

  it('uses PowerShell-safe single-quote escaping without changing path separators', () => {
    expect(devStopScript).toContain('replaceAll("\'", "\'\'")');
    expect(devStatusScript).toContain('replaceAll("\'", "\'\'")');
    expect(devStopScript).toContain('apps(\\\\\\\\|/)mcp(\\\\\\\\|/)dist(\\\\\\\\|/)index\\\\.js');
    expect(devStopScript).not.toContain("replaceAll('\\\\', '\\\\\\\\')");
    expect(devStatusScript).not.toContain("replaceAll('\\\\', '\\\\\\\\')");
  });
});
