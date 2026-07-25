import json
import sys
from pathlib import Path

import freesasa


def clamp_unit(value: float) -> float:
    return max(0.0, min(1.0, value))


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in {"-h", "--help"}:
        print("usage: freesasa.cmd <structure.pdb> [--mappings JSON]")
        return 0

    structure_path = Path(sys.argv[1])
    mappings = []
    if "--mappings" in sys.argv:
        mapping_index = sys.argv.index("--mappings")
        if mapping_index + 1 < len(sys.argv):
            mappings = json.loads(sys.argv[mapping_index + 1])

    structure = freesasa.Structure(str(structure_path))
    result = freesasa.calc(structure)
    total_area = float(result.totalArea())

    # FreeSASA gives absolute SASA. ImmunoGraph stores a unit interval for UI
    # comparison, so normalize conservatively by a large protein-scale area.
    normalized_total = clamp_unit(total_area / 20_000.0)

    payload = {
        "totalArea": total_area,
        "normalizedSurfaceAccessibility": normalized_total,
        "mappings": [
            {
                "candidateId": item.get("candidateId"),
                "surfaceAccessibility": normalized_total,
            }
            for item in mappings
        ],
    }
    print(json.dumps(payload, sort_keys=True))
    print(normalized_total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
