const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

function toWslInputPath(inputPath) {
  return inputPath.replaceAll('\\', '/');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (!options.capture && result.stdout) process.stdout.write(result.stdout);
  if (!options.capture && result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

const wslRepo = run(
  'wsl.exe',
  ['-d', 'Ubuntu-24.04', '--', 'wslpath', '-a', toWslInputPath(repoRoot)],
  {
    capture: true,
  },
);
const args = process.argv.slice(2);
const translatedArgs = [];
let translatedInputPath;

for (let index = 0; index < args.length; index += 1) {
  const current = args[index];
  if ((current === '-f' || current === '--file') && args[index + 1]) {
    translatedArgs.push(current);
    const inputPath = args[index + 1];
    const translatedPath =
      /^[A-Za-z]:[\\/]/.test(inputPath) || inputPath.includes('\\')
        ? run(
            'wsl.exe',
            ['-d', 'Ubuntu-24.04', '--', 'wslpath', '-a', toWslInputPath(path.resolve(inputPath))],
            { capture: true },
          )
        : inputPath;
    translatedArgs.push(translatedPath);
    translatedInputPath = translatedPath;
    index += 1;
    continue;
  }
  translatedArgs.push(current);
}

run('wsl.exe', [
  '-d',
  'Ubuntu-24.04',
  '--',
  `${wslRepo}/tools/bin/linux/fpocket`,
  ...translatedArgs,
]);

if (translatedInputPath) {
  const parsed = path.posix.parse(translatedInputPath);
  const infoPath = `${parsed.dir}/${parsed.name}_out/${parsed.name}_info.txt`;
  run('wsl.exe', [
    '-d',
    'Ubuntu-24.04',
    '--',
    'bash',
    '-lc',
    `test -f '${infoPath}' && cat '${infoPath}' || true`,
  ]);
}
