import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cwd, env, execPath, exit, platform } from 'node:process';
import { spawnSync } from 'node:child_process';

const root = cwd();

const requiredInstallMarkers = [
  join(root, 'node_modules', '@immunograph', 'database', 'package.json'),
  join(root, 'node_modules', '@nitrostack', 'core', 'package.json'),
  join(root, 'node_modules', 'prisma', 'build', 'index.js'),
];

const missingMarkers = requiredInstallMarkers.filter((marker) => !existsSync(marker));

if (missingMarkers.length === 0) {
  process.stdout.write('Workspace install already available.\n');
  exit(0);
}

process.stdout.write(
  [
    'Workspace install is incomplete; reinstalling after full repository copy.',
    ...missingMarkers.map((marker) => `Missing: ${marker}`),
    '',
  ].join('\n'),
);

const npmArguments = ['ci', '--ignore-scripts', '--include-workspace-root', '--workspaces'];
const npmExecPath = env.npm_execpath;
const result =
  npmExecPath === undefined || npmExecPath.length === 0
    ? spawnSync(platform === 'win32' ? 'npm.cmd' : 'npm', npmArguments, {
        cwd: root,
        env: {
          ...process.env,
          npm_config_fund: 'false',
          npm_config_audit: 'false',
        },
        shell: platform === 'win32',
        stdio: 'inherit',
      })
    : spawnSync(execPath, [npmExecPath, ...npmArguments], {
        cwd: root,
        env: {
          ...process.env,
          npm_config_fund: 'false',
          npm_config_audit: 'false',
        },
        stdio: 'inherit',
      });

if (result.error) {
  process.stderr.write(`Workspace install failed to start: ${result.error.message}\n`);
  exit(1);
}

exit(result.status ?? 1);
