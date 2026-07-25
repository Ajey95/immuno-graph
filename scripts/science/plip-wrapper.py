import json
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] in {"-h", "--help"}:
        print("usage: plip.cmd -f <docking-complex.pdb>")
        return 0

    input_path = None
    if "-f" in sys.argv:
        file_index = sys.argv.index("-f")
        if file_index + 1 < len(sys.argv):
            input_path = Path(sys.argv[file_index + 1])

    if input_path is None:
        print(json.dumps({"interactions": [], "warning": "missing-input-file"}))
        return 0

    # This local Windows adapter is intentionally conservative: PLIP's official
    # command-line package is difficult to install on Windows because it builds
    # Open Babel bindings. The production Docker/NitroStack runtime uses the
    # real PLIP CLI. Locally, this adapter confirms the artifact exists and
    # returns a machine-readable placeholder for the MCP parser boundary.
    payload = {
        "input": str(input_path),
        "inputExists": input_path.exists(),
        "interactions": [],
        "adapter": "plip-local-windows-adapter",
    }
    print(json.dumps(payload, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
