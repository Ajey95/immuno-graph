"""Prepare one real PDB receptor with Meeko; fail on unsupported residues."""

import subprocess
import sys


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: prepare_receptor.py INPUT.pdb OUTPUT.pdbqt")
    pdb_path, pdbqt_path = sys.argv[1:]
    subprocess.run(
        [sys.executable, "-m", "meeko.cli.mk_prepare_receptor", "--read_pdb", pdb_path,
         "--write_pdbqt", pdbqt_path],
        check=True,
        capture_output=True,
        text=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
