"""Render the documented 1IEP/imatinib Vina pose from its exported complex PDB.

Requires numpy and matplotlib. This is a coordinate plot, not a molecular
surface or an experimental binding claim.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/examples/1iep-imatinib-vina-complex.pdb"
OUTPUT = ROOT / "docs/assets/1iep-imatinib-docked-pose.png"


def read_atoms(path):
    protein, ligand = [], []
    for line in path.read_text().splitlines():
        kind = line[:6].strip()
        if kind not in {"ATOM", "HETATM"}:
            continue
        atom = {
            "name": line[12:16].strip(),
            "residue": line[17:20].strip(),
            "residue_key": (line[21:22], line[22:27].strip()),
            "element": line[76:78].strip() or line[12:16].strip()[0],
            "xyz": np.array([float(line[i : i + 8]) for i in (30, 38, 46)]),
        }
        (protein if kind == "ATOM" else ligand).append(atom)
    if not protein or not ligand:
        raise ValueError("Expected protein ATOM and ligand HETATM coordinates")
    return protein, ligand


def set_bounds(ax, points, pad=0.08):
    lo, hi = points.min(axis=0), points.max(axis=0)
    center = (lo + hi) / 2
    radius = max(hi - lo) * (0.5 + pad)
    for setter, value in zip((ax.set_xlim, ax.set_ylim, ax.set_zlim), center):
        setter(value - radius, value + radius)
    ax.set_box_aspect((1, 1, 1), zoom=1.45)
    ax.set_axis_off()
    ax.view_init(elev=22, azim=-64)
    ax.set_proj_type("ortho")


def ligand_sticks(ax, atoms, width=2.4, size=44):
    heavy = [atom for atom in atoms if atom["element"] != "H"]
    # Bonds are inferred only for display from covalent-distance thresholds.
    radii = {"C": 0.76, "N": 0.71, "O": 0.66, "S": 1.05, "P": 1.07}
    for i, first in enumerate(heavy):
        for second in heavy[i + 1 :]:
            limit = radii.get(first["element"], 0.75) + radii.get(second["element"], 0.75) + 0.5
            if np.linalg.norm(first["xyz"] - second["xyz"]) <= limit:
                pair = np.array([first["xyz"], second["xyz"]])
                ax.plot(*pair.T, color="#f5b66d", linewidth=width, alpha=0.95)
    palette = {"C": "#ffc47d", "N": "#8cb9ff", "O": "#ff7089", "S": "#ffe27d"}
    for atom in heavy:
        ax.scatter(*atom["xyz"], color=palette.get(atom["element"], "#f2eee9"), s=size, depthshade=True)


def main():
    protein, ligand = read_atoms(SOURCE)
    ligand_xyz = np.array([atom["xyz"] for atom in ligand if atom["element"] != "H"])
    ca = [atom for atom in protein if atom["name"] == "CA"]
    residues = {}
    for atom in protein:
        if atom["element"] != "H":
            residues.setdefault(atom["residue_key"], []).append(atom)

    distances = {
        key: min(np.linalg.norm(atom["xyz"] - ligand_xyz, axis=1).min() for atom in atoms)
        for key, atoms in residues.items()
    }
    near_keys = {key for key, distance in distances.items() if distance <= 5.0}
    near_atoms = [atom for atom in protein if atom["residue_key"] in near_keys and atom["element"] != "H"]

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 12})
    fig = plt.figure(figsize=(16, 8), dpi=160, facecolor="#0b1422")
    ax1 = fig.add_axes([0.025, 0.13, 0.48, 0.72], projection="3d", facecolor="#0b1422")
    ax2 = fig.add_axes([0.50, 0.13, 0.48, 0.72], projection="3d", facecolor="#0b1422")

    # Connect only consecutive, spatially adjacent C-alpha records.
    for first, second in zip(ca, ca[1:]):
        if first["residue_key"][0] == second["residue_key"][0] and np.linalg.norm(first["xyz"] - second["xyz"]) < 4.5:
            pair = np.array([first["xyz"], second["xyz"]])
            ax1.plot(*pair.T, color="#6ad6dc", linewidth=2.5, alpha=0.76)
    pocket_ca = np.array([atom["xyz"] for atom in ca if atom["residue_key"] in near_keys])
    ax1.scatter(*pocket_ca.T, color="#88ebd9", s=13, alpha=0.9, depthshade=True)
    ligand_sticks(ax1, ligand, width=2.2, size=32)
    set_bounds(ax1, np.array([atom["xyz"] for atom in ca]))

    protein_xyz = np.array([atom["xyz"] for atom in near_atoms])
    ax2.scatter(*protein_xyz.T, color="#4cc3c2", s=11, alpha=0.35, depthshade=True)
    for atom in near_atoms:
        if atom["element"] in {"N", "O"}:
            ax2.scatter(*atom["xyz"], color="#77a9b7", s=16, alpha=0.65, depthshade=True)
    ligand_sticks(ax2, ligand, width=3.5, size=65)
    set_bounds(ax2, ligand_xyz, pad=0.25)

    fig.text(0.04, 0.94, "REAL COORDINATES  /  COMPUTED DOCKING", color="#87e6dd", fontsize=12, weight="bold")
    fig.text(0.04, 0.88, "1IEP + imatinib", color="white", fontsize=31, weight="bold")
    fig.text(0.04, 0.085, "A   Protein Cα trace + top Vina pose", color="#d9e9ec", fontsize=14, weight="bold")
    fig.text(0.53, 0.085, "B   Ligand + protein atoms within 5 Å", color="#d9e9ec", fontsize=14, weight="bold")
    fig.text(0.04, 0.032, "Vina score −13.201 kcal/mol  •  exported complex: 2,702 protein atoms + 40 ligand atoms  •  spatial proximity is not a measured interaction", color="#96aab6", fontsize=11)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUTPUT, facecolor=fig.get_facecolor(), dpi=160)
    plt.close(fig)
    print(f"{OUTPUT} ({len(ca)} C-alpha atoms, {len(near_keys)} nearby residues)")


if __name__ == "__main__":
    main()
