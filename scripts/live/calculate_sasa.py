"""Calculate observed PDB residue SASA with FreeSASA."""

import json
import sys
from pathlib import Path

import freesasa


def main():
    pdb_path, request_path, output_path = map(Path, sys.argv[1:4])
    request = json.loads(request_path.read_text(encoding="utf-8"))
    structure = freesasa.Structure(str(pdb_path))
    result = freesasa.calc(structure)
    areas = result.residueAreas()
    accessibility = []
    per_residue = {}
    for mapping in request["mappings"]:
        candidate_id = mapping["candidateId"]
        chain = areas.get(mapping["chainId"], {})
        residues = []
        for number in range(mapping["start"], mapping["end"] + 1):
            area = chain.get(str(number))
            if area is None:
                raise ValueError(f"Missing observed PDB residue {mapping['chainId']}:{number}")
            residues.append({"chainId": mapping["chainId"], "residueNumber": number,
                             "absoluteAreaAngstrom2": area.total,
                             "relativeArea": area.relativeTotal})
        per_residue[candidate_id] = residues
        accessibility.append({"candidateId": candidate_id,
                              "surfaceAccessibility": min(1.0, max(0.0, sum(row["relativeArea"] for row in residues) / len(residues))),
                              "method": "freesasa", "status": "CALCULATED"})
    output_path.write_text(json.dumps({"accessibility": accessibility, "perResidue": per_residue}), encoding="utf-8")


if __name__ == "__main__":
    main()
