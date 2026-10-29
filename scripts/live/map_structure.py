"""Align a reference protein to observed PDB chain residues and map positions."""

import json
import sys
from pathlib import Path

from Bio.Align import PairwiseAligner
from Bio.PDB import PDBParser
from Bio.Data.PDBData import protein_letters_3to1_extended


def chain_residues(chain):
    residues = []
    for residue in chain:
        code = protein_letters_3to1_extended.get(residue.resname.upper())
        if code and residue.id[0] == " " and residue.has_id("CA"):
            residues.append((code, residue.id[1], residue.id[2]))
    return residues


def align(reference, residues):
    aligner = PairwiseAligner(mode="global", match_score=2, mismatch_score=-1,
                              open_gap_score=-5, extend_gap_score=-0.5)
    alignment = aligner.align(reference, "".join(row[0] for row in residues))[0]
    positions = {}
    matches = 0
    aligned = 0
    for ref_index, chain_index in zip(*alignment.indices):
        if ref_index < 0 or chain_index < 0:
            continue
        aligned += 1
        if reference[ref_index] == residues[chain_index][0]:
            matches += 1
            positions[ref_index + 1] = residues[chain_index][1:]
    return positions, matches / max(1, aligned), matches / len(reference)


def main():
    pdb_path, request_path, output_path = map(Path, sys.argv[1:4])
    request = json.loads(request_path.read_text(encoding="utf-8"))
    reference = request["referenceSequence"].upper()
    model = next(PDBParser(QUIET=True).get_structure("target", str(pdb_path)).get_models())
    chains = {}
    for chain in model:
        residues = chain_residues(chain)
        if residues:
            chains[chain.id] = align(reference, residues)
    if not chains:
        raise ValueError("PDB has no protein chains with observed CA atoms")
    mapped = []
    for candidate in request["candidates"]:
        chosen = candidate.get("chainId")
        if not chosen:
            chosen = max(chains, key=lambda chain_id: chains[chain_id][2])
        result = chains.get(chosen)
        start, end = candidate["start"], candidate["end"]
        if result and 1 <= start <= end <= len(reference):
            positions, identity, _ = result
            region = [positions.get(index) for index in range(start, end + 1)]
            if all(item is not None for item in region):
                numbers = [item[0] for item in region]
                insertions = [item[1] for item in region]
                if all(code == " " for code in insertions) and numbers == list(range(numbers[0], numbers[0] + len(numbers))):
                    mapped.append({"candidateId": candidate["candidateId"], "chainId": chosen,
                                   "start": numbers[0], "end": numbers[-1],
                                   "status": "MAPPED", "confidence": identity})
                    continue
        mapped.append({"candidateId": candidate["candidateId"], "chainId": chosen,
                       "start": start, "end": end, "status": "UNMAPPED", "confidence": 0})
    output_path.write_text(json.dumps({"mappings": mapped}), encoding="utf-8")


if __name__ == "__main__":
    main()
