"""Run PLIP with an RDKit InChIKey fallback for Open Babel builds without InChI."""

import sys

from openbabel import openbabel, pybel
from rdkit import Chem


def main() -> None:
    if openbabel.OBConversion().FindFormat("inchikey") is None:
        original_write = pybel.Molecule.write

        def write_with_inchikey(self, format="smi", filename=None, overwrite=False, opt=None):
            if format.lower() != "inchikey":
                return original_write(self, format, filename, overwrite, opt)
            smiles = original_write(self, "can").strip().split()[0]
            molecule = Chem.MolFromSmiles(smiles)
            if molecule is None:
                raise ValueError("Cannot derive ligand InChIKey from Open Babel SMILES")
            return Chem.MolToInchiKey(molecule)

        pybel.Molecule.write = write_with_inchikey

    from plip.plipcmd import main as plip_main

    sys.argv[0] = "plip"
    plip_main()


if __name__ == "__main__":
    main()
