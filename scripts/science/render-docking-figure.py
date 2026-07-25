from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


@dataclass(frozen=True)
class Atom:
    name: str
    residue: str
    chain: str
    residue_id: str
    x: float
    y: float
    z: float
    element: str


RADIUS = {
    "H": 0.25,
    "C": 0.55,
    "N": 0.55,
    "O": 0.55,
    "S": 0.65,
    "P": 0.65,
    "CL": 0.75,
}
COLORS = {
    "H": (190, 190, 190),
    "C": (246, 210, 34),
    "N": (54, 108, 210),
    "O": (222, 67, 67),
    "S": (235, 188, 50),
    "P": (246, 140, 30),
    "CL": (46, 170, 80),
}


def parse_atoms(path: Path, only_protein: bool = False) -> list[Atom]:
    atoms: list[Atom] = []
    for line in path.read_text(errors="ignore").splitlines():
        record = line[:6].strip()
        if record not in {"ATOM", "HETATM"}:
            continue
        if only_protein and record != "ATOM":
            continue
        try:
            name = line[12:16].strip()
            residue = line[17:20].strip() or "UNK"
            chain = line[21].strip() or "A"
            residue_id = line[22:26].strip() or "0"
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            element = (line[76:78].strip() or "".join(ch for ch in name if ch.isalpha())[:1]).upper()
            if element == "CL":
                element = "CL"
            elif len(element) > 1:
                element = element[0]
            atoms.append(Atom(name, residue, chain, residue_id, x, y, z, element))
        except ValueError:
            continue
    return atoms


def rotate(atom: Atom) -> tuple[float, float, float]:
    rz = math.radians(-35)
    rx = math.radians(18)
    x1 = atom.x * math.cos(rz) - atom.y * math.sin(rz)
    y1 = atom.x * math.sin(rz) + atom.y * math.cos(rz)
    z1 = atom.z
    y2 = y1 * math.cos(rx) - z1 * math.sin(rx)
    z2 = y1 * math.sin(rx) + z1 * math.cos(rx)
    return x1, y2, z2


def project(atoms: list[Atom], box: tuple[int, int, int, int], pad: int = 24):
    rotated = [rotate(atom) for atom in atoms]
    xs = [item[0] for item in rotated]
    ys = [item[1] for item in rotated]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    width = max_x - min_x or 1
    height = max_y - min_y or 1
    left, top, right, bottom = box
    scale = min((right - left - pad * 2) / width, (bottom - top - pad * 2) / height)

    def mapper(atom: Atom) -> tuple[float, float, float]:
        x, y, z = rotate(atom)
        px = left + pad + (x - min_x) * scale
        py = bottom - pad - (y - min_y) * scale
        return px, py, z

    return mapper


def distance(a: Atom, b: Atom) -> float:
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)


def residue_key(atom: Atom) -> tuple[str, str, str]:
    return atom.chain, atom.residue, atom.residue_id


def nearby_residues(receptor: list[Atom], ligand: list[Atom], cutoff: float = 4.2) -> list[tuple[tuple[str, str, str], float]]:
    best: dict[tuple[str, str, str], float] = {}
    for atom in receptor:
        min_distance = min(distance(atom, ligand_atom) for ligand_atom in ligand)
        if min_distance <= cutoff:
            key = residue_key(atom)
            best[key] = min(best.get(key, min_distance), min_distance)
    return sorted(best.items(), key=lambda item: item[1])[:10]


def infer_bonds(atoms: list[Atom]) -> list[tuple[Atom, Atom]]:
    bonds: list[tuple[Atom, Atom]] = []
    heavy = [atom for atom in atoms if atom.element != "H"]
    for index, a in enumerate(heavy):
        for b in heavy[index + 1 :]:
            cutoff = RADIUS.get(a.element, 0.6) + RADIUS.get(b.element, 0.6) + 0.75
            if 0.45 <= distance(a, b) <= min(cutoff, 2.1):
                bonds.append((a, b))
    return bonds


def dashed_line(draw: ImageDraw.ImageDraw, a: tuple[float, float], b: tuple[float, float], fill, width=2):
    segments = 18
    for i in range(segments):
        if i % 2 == 0:
            x1 = a[0] + (b[0] - a[0]) * i / segments
            y1 = a[1] + (b[1] - a[1]) * i / segments
            x2 = a[0] + (b[0] - a[0]) * (i + 1) / segments
            y2 = a[1] + (b[1] - a[1]) * (i + 1) / segments
            draw.line((x1, y1, x2, y2), fill=fill, width=width)


def draw_atom(draw: ImageDraw.ImageDraw, pos: tuple[float, float], element: str, scale: float = 1.0):
    color = COLORS.get(element, (80, 80, 80))
    radius = max(3, int(5 * scale))
    x, y = pos
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color, outline=(30, 30, 30), width=1)


def draw_bonds(draw: ImageDraw.ImageDraw, atoms: list[Atom], mapper, color=(245, 208, 35), width=4):
    for a, b in infer_bonds(atoms):
        ax, ay, _ = mapper(a)
        bx, by, _ = mapper(b)
        draw.line((ax, ay, bx, by), fill=color, width=width)
    for atom in atoms:
        x, y, _ = mapper(atom)
        draw_atom(draw, (x, y), atom.element, scale=0.9)


def draw_panel(
    draw: ImageDraw.ImageDraw,
    panel: tuple[int, int, int, int],
    label: str,
    receptor: list[Atom],
    ligand: list[Atom],
    font,
    small_font,
):
    x0, y0, x1, y1 = panel
    main_box = (x0 + 40, y0 + 30, x0 + 500, y1 - 35)
    inset_box = (x0 + 540, y0 + 45, x1 - 30, y1 - 45)
    draw.text((x0 + 8, y0 + 8), label, fill=(20, 20, 20), font=font)
    draw.rectangle(inset_box, outline=(45, 45, 45), width=2)

    ca_atoms = [atom for atom in receptor if atom.name == "CA"]
    pocket_keys = {key for key, _ in nearby_residues(receptor, ligand)}
    pocket_atoms = [atom for atom in receptor if residue_key(atom) in pocket_keys]
    main_mapper = project(ca_atoms + ligand, main_box)
    ca_points = [(main_mapper(atom)[0], main_mapper(atom)[1]) for atom in ca_atoms]
    if len(ca_points) > 1:
        draw.line(ca_points, fill=(116, 201, 187), width=5, joint="curve")
        draw.line(ca_points, fill=(31, 116, 105), width=1, joint="curve")

    ligand_center = (
        sum(atom.x for atom in ligand) / len(ligand),
        sum(atom.y for atom in ligand) / len(ligand),
        sum(atom.z for atom in ligand) / len(ligand),
    )
    lx, ly, _ = main_mapper(Atom("C", "LIG", "L", "1", *ligand_center, "C"))
    draw.rectangle((lx - 80, ly - 70, lx + 85, ly + 75), outline=(45, 45, 45), width=2)
    draw.line((lx + 85, ly - 70, inset_box[0], inset_box[1]), fill=(70, 70, 70), width=1)
    draw.line((lx + 85, ly + 75, inset_box[0], inset_box[3]), fill=(70, 70, 70), width=1)
    draw_bonds(draw, ligand, main_mapper, width=3)

    zoom_atoms = pocket_atoms + ligand
    zoom_mapper = project(zoom_atoms, inset_box, pad=36)
    residue_groups: dict[tuple[str, str, str], list[Atom]] = {}
    for atom in pocket_atoms:
        residue_groups.setdefault(residue_key(atom), []).append(atom)
    for atoms in residue_groups.values():
        draw_bonds(draw, atoms, zoom_mapper, color=(42, 194, 85), width=3)
    draw_bonds(draw, ligand, zoom_mapper, color=(248, 211, 43), width=5)

    interactions = []
    receptor_hetero = [atom for atom in pocket_atoms if atom.element in {"N", "O", "S"}]
    ligand_hetero = [atom for atom in ligand if atom.element in {"N", "O", "S", "CL"}]
    for la in ligand_hetero:
        for ra in receptor_hetero:
            d = distance(la, ra)
            if 2.2 <= d <= 3.6:
                interactions.append((d, la, ra))
    for d, la, ra in sorted(interactions, key=lambda item: item[0])[:5]:
        ax, ay, _ = zoom_mapper(la)
        bx, by, _ = zoom_mapper(ra)
        dashed_line(draw, (ax, ay), (bx, by), fill=(217, 58, 58), width=2)
        mx, my = (ax + bx) / 2, (ay + by) / 2
        draw.text((mx + 3, my + 3), f"{d:.1f}Å", fill=(80, 30, 30), font=small_font)

    label_positions = [(inset_box[0] + 10, inset_box[1] + 8)]
    for idx, ((chain, residue, residue_id), min_distance) in enumerate(nearby_residues(receptor, ligand)[:8]):
        atoms = residue_groups.get((chain, residue, residue_id), [])
        if not atoms:
            continue
        atom = min(atoms, key=lambda candidate: min(distance(candidate, lig_atom) for lig_atom in ligand))
        px, py, _ = zoom_mapper(atom)
        text = f"{residue}{residue_id}"
        tx = inset_box[0] + 12 + (idx % 2) * 180
        ty = inset_box[1] + 12 + (idx // 2) * 24
        label_positions.append((tx, ty))
        draw.line((px, py, tx, ty + 8), fill=(75, 75, 75), width=1)
        draw.text((tx, ty), text, fill=(20, 85, 48), font=small_font)


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: render-docking-figure.py <research-package-dir> [output.png]")
        return 2
    package_root = Path(sys.argv[1])
    output = Path(sys.argv[2]) if len(sys.argv) > 2 else package_root / "docking" / "docking-view.png"
    receptor_path = package_root / "inputs" / "original-receptor.pdb"
    receptor = parse_atoms(receptor_path, only_protein=True)
    pose_paths = [package_root / "docking" / f"docked-ligand{i}.pdb" for i in range(1, 4)]
    ligands = [parse_atoms(path) for path in pose_paths if path.exists()]
    if not receptor or not ligands:
        raise SystemExit("Missing receptor or docked ligand atoms")

    image = Image.new("RGB", (1100, 1500), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("arial.ttf", 28)
        small_font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    draw.text((34, 18), "ImmunoGraph actual docking visualization", fill=(12, 56, 48), font=font)
    draw.text(
        (34, 52),
        "RCSB 1UYD receptor + PubChem CID 2244 ligand; poses from AutoDock Vina; contacts from actual coordinates",
        fill=(70, 92, 88),
        font=small_font,
    )
    panels = [(25, 90, 1075, 545), (25, 550, 1075, 1005), (25, 1010, 1075, 1465)]
    for label, panel, ligand in zip(["A", "B", "C"], panels, ligands):
        draw_panel(draw, panel, label, receptor, ligand, font, small_font)
    draw.text((34, 1468), "Yellow: docked ligand pose · Green: nearby residues · Red dashed: inferred polar contacts", fill=(60, 60, 60), font=small_font)

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    metadata = {
        "schemaVersion": "immunograph-docking-figure.v1",
        "renderer": "coordinate-projection-pillow",
        "receptorAtoms": len(receptor),
        "ligandPoseCountRendered": len(ligands),
        "output": str(output),
    }
    (output.parent / "docking-view-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
