import { existsSync, lstatSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const target = resolve(root, 'dist');
if (relative(root, target) !== 'dist') throw new Error('Invalid build output path');
if (existsSync(target)) {
  if (lstatSync(target).isSymbolicLink() || realpathSync(target) !== target) {
    throw new Error('Refusing to clean a redirected build output path');
  }
  rmSync(target, { recursive: true });
}

const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const result = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
  cwd: root,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
