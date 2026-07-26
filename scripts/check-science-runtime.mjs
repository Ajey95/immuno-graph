import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();

const samplePdb = [
  'ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00 10.00           N',
  'ATOM      2  CA  GLY A   1       1.500   0.000   0.000  1.00 10.00           C',
  'ATOM      3  C   GLY A   1       2.000   1.400   0.000  1.00 10.00           C',
  'ATOM      4  O   GLY A   1       1.300   2.300   0.000  1.00 10.00           O',
  'END',
].join('\n');

function commandPath(...segments) {
  return path.join(root, ...segments);
}

function displayFirstLine(stdout, stderr) {
  return `${stdout}\n${stderr}`.split(/\r?\n/u).find((line) => line.trim().length > 0) ?? 'OK';
}

async function runCheck(name, command, args) {
  try {
    const isWindowsBatch = process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(command);
    const executable = isWindowsBatch ? 'cmd.exe' : command;
    const executableArgs = isWindowsBatch
      ? ['/d', '/s', '/c', command.replaceAll('/', '\\'), ...args]
      : args;
    const { stdout, stderr } = await execFileAsync(executable, executableArgs, {
      windowsHide: true,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log(`${name}: AVAILABLE — ${displayFirstLine(stdout, stderr)}`);
    return true;
  } catch (error) {
    console.log(`${name}: UNAVAILABLE — ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'immunograph-science-'));
  const pdbPath = path.join(tempRoot, 'sample.pdb');
  await writeFile(pdbPath, `${samplePdb}\n`, 'utf8');

  const checks = [
    runCheck('AutoDock Vina', commandPath('scripts', 'science', 'vina.cmd'), ['--help']),
    runCheck('Open Babel', commandPath('scripts', 'science', 'obabel.cmd'), ['-V']),
    runCheck('FreeSASA', commandPath('scripts', 'science', 'freesasa.cmd'), [
      pdbPath,
      '--mappings',
      JSON.stringify([
        { candidateId: 'sample', structureId: pdbPath, chainId: 'A', start: 1, end: 1 },
      ]),
    ]),
    runCheck('fpocket', commandPath('scripts', 'science', 'fpocket.cmd'), ['-f', pdbPath]),
    runCheck('PLIP local adapter', commandPath('scripts', 'science', 'plip.cmd'), ['-h']),
    runCheck('RDKit Python module', commandPath('.venv-science', 'Scripts', 'python.exe'), [
      '-c',
      'from rdkit import Chem; print("rdkit=OK")',
    ]),
  ];

  const results = await Promise.all(checks);
  const available = results.filter(Boolean).length;
  console.log(`Science runtime summary: ${available}/${results.length} local checks available`);
  process.exitCode = available === results.length ? 0 : 1;
}

await main();
