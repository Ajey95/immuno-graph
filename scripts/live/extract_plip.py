"""Run PLIP on a real complex PDB and export its contacts and XML report."""

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree


CONTACTS = {
    "hydrophobic_interaction": ("HYDROPHOBIC", "dist"),
    "hydrogen_bond": ("HYDROGEN_BOND", "dist_d-a"),
    "salt_bridge": ("IONIC", "dist"),
    "pi_stack": ("PI_STACKING", "centdist"),
}


def main() -> None:
    source, destination = map(Path, sys.argv[1:3])
    with tempfile.TemporaryDirectory(prefix="immunograph-plip-output-") as output_dir:
        runner = Path(__file__).with_name("run_plip.py")
        subprocess.run(
            [sys.executable, str(runner), "-f", str(source), "-x", "-o", output_dir, "--maxthreads", "1"],
            check=True,
            capture_output=True,
            text=True,
            timeout=110,
        )
        reports = list(Path(output_dir).glob("*_report.xml"))
        if len(reports) != 1:
            raise ValueError("PLIP did not create exactly one XML report")
        xml = reports[0].read_text(encoding="utf-8")
        root = ElementTree.fromstring(xml)
        interactions = parse_contacts(root)
        destination.write_text(json.dumps({"interactions": interactions, "xml": xml}), encoding="utf-8")


def parse_contacts(root: ElementTree.Element) -> list[dict[str, str | float]]:
    interactions = []
    sites = root.findall(".//bindingsite")
    if len(sites) != 1:
        raise ValueError(f"Expected one protein-ligand binding site, got {len(sites)}")
    for site in sites:
        for element_name, (contact_type, distance_field) in CONTACTS.items():
            for contact in site.findall(f".//{element_name}"):
                distance = contact.findtext(distance_field)
                chain = contact.findtext("reschain")
                residue = contact.findtext("resnr")
                if not distance or not chain or not residue:
                    continue
                interactions.append(
                    {
                        "interactionType": contact_type,
                        "residueRef": f"{chain}:{residue}",
                        "distanceAngstrom": float(distance),
                    }
                )
    return interactions


if __name__ == "__main__":
    main()
