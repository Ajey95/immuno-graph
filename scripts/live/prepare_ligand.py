"""Prepare one real 3D ligand with RDKit and Meeko; no synthetic fallback."""

import subprocess
import sys

from rdkit import Chem
from rdkit.Chem import AllChem


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("usage: prepare_ligand.py SMILES OUTPUT.sdf OUTPUT.pdbqt")
    smiles, sdf_path, pdbqt_path = sys.argv[1:]
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError("RDKit could not parse the supplied SMILES")
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = 42
    if AllChem.EmbedMolecule(mol, params) != 0:
        raise ValueError("RDKit failed to generate 3D ligand coordinates")
    if AllChem.MMFFHasAllMoleculeParams(mol):
        if AllChem.MMFFOptimizeMolecule(mol, maxIters=300) < 0:
            raise ValueError("RDKit MMFF optimization failed")
    elif AllChem.UFFHasAllMoleculeParams(mol):
        if AllChem.UFFOptimizeMolecule(mol, maxIters=300) < 0:
            raise ValueError("RDKit UFF optimization failed")
    with Chem.SDWriter(sdf_path) as writer:
        writer.write(mol)
    subprocess.run(
        [sys.executable, "-m", "meeko.cli.mk_prepare_ligand", "-i", sdf_path, "-o", pdbqt_path],
        check=True,
        capture_output=True,
        text=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
