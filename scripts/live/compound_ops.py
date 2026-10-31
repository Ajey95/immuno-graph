"""Validate and canonicalize molecular structures with RDKit."""

import json
import sys
from pathlib import Path

from rdkit import Chem
from rdkit import RDLogger


RDLogger.DisableLog("rdApp.error")


def describe(smiles: str) -> dict:
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        return {"valid": False}
    return {
        "valid": True,
        "canonicalSmiles": Chem.MolToSmiles(molecule, canonical=True, isomericSmiles=True),
        "inchiKey": Chem.MolToInchiKey(molecule),
        "heavyAtomCount": molecule.GetNumHeavyAtoms(),
    }


def main() -> None:
    operation = sys.argv[1]
    if operation == "validate":
        print(json.dumps(describe(sys.argv[2])))
    elif operation == "canonicalize":
        compounds = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
        print(json.dumps([describe(compound["smiles"]) for compound in compounds]))
    else:
        raise ValueError("Unsupported compound operation")


if __name__ == "__main__":
    main()
