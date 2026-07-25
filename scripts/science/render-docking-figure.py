from __future__ import annotations

import argparse
import json
import math
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
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


def load_inputs(package_root: Path) -> tuple[Path, list[Path], list[Atom], list[list[Atom]]]:
    receptor_path = package_root / "inputs" / "original-receptor.pdb"
    receptor = parse_atoms(receptor_path, only_protein=True)
    pose_paths = [package_root / "docking" / f"docked-ligand{i}.pdb" for i in range(1, 4)]
    existing_pose_paths = [path for path in pose_paths if path.exists()]
    ligands = [parse_atoms(path) for path in existing_pose_paths]
    if not receptor or not ligands:
        raise SystemExit("Missing receptor or docked ligand atoms")
    return receptor_path, existing_pose_paths, receptor, ligands


def render_with_pymol(
    package_root: Path,
    output: Path,
    receptor_path: Path,
    pose_paths: list[Path],
    receptor: list[Atom],
    ligands: list[list[Atom]],
) -> dict[str, object]:
    pymol_command = os.environ.get("PYMOL_COMMAND", "pymol")
    command_parts = shlex.split(pymol_command, posix=os.name != "nt")
    executable = command_parts[0]
    if shutil.which(executable) is None and not Path(executable).exists():
        raise RuntimeError(f"PyMOL command not found: {executable}")

    with tempfile.TemporaryDirectory(prefix="immunograph-pymol-") as temp_dir_name:
        temp_dir = Path(temp_dir_name)
        panel_manifest = temp_dir / "panels.json"
        pymol_script = temp_dir / "render_panels.py"
        panels = [
            {
                "label": label,
                "ligand": str(path.resolve()),
                "main": str((temp_dir / f"{label.lower()}_main.png").resolve()),
                "inset": str((temp_dir / f"{label.lower()}_inset.png").resolve()),
                "nearbyResidues": [
                    {"chain": chain, "residue": residue, "residueId": residue_id}
                    for (chain, residue, residue_id), _distance in nearby_residues(receptor, ligand)[:5]
                ],
            }
            for label, path, ligand in zip(["A", "B", "C"], pose_paths, ligands)
        ]
        panel_manifest.write_text(json.dumps(panels, indent=2), encoding="utf-8")
        pymol_script.write_text(
            f"""
from __future__ import annotations

import json
from pathlib import Path

from pymol import cmd

receptor_path = r'''{str(receptor_path.resolve())}'''
panels = json.loads(Path(r'''{str(panel_manifest.resolve())}''').read_text())

cmd.set('ray_opaque_background', 1)
cmd.set('antialias', 2)
cmd.set('orthoscopic', 1)
cmd.set('depth_cue', 0)
cmd.set('ambient', 0.45)
cmd.set('spec_reflect', 0.25)
cmd.set('cartoon_fancy_helices', 1)
cmd.set('cartoon_smooth_loops', 1)
cmd.set('stick_radius', 0.16)
cmd.set('dash_width', 2.5)
cmd.set('dash_gap', 0.22)
cmd.set('dash_color', 'red')
cmd.set('label_size', 24)
cmd.set('label_color', 'forest')
cmd.set('label_position', [1.5, 1.5, 1.5])


def style_ligand(selection: str) -> None:
    cmd.show('sticks', selection)
    cmd.color('yelloworange', f'{{selection}} and elem C')
    cmd.color('blue', f'{{selection}} and elem N')
    cmd.color('red', f'{{selection}} and elem O')
    cmd.color('tv_yellow', f'{{selection}} and elem S')
    cmd.color('green', f'{{selection}} and elem Cl')


def render_panel(panel: dict[str, str]) -> None:
    cmd.reinitialize()
    cmd.bg_color('white')
    cmd.load(receptor_path, 'receptor')
    cmd.load(panel['ligand'], 'ligand')
    cmd.remove('solvent')
    cmd.hide('everything')
    cmd.show('cartoon', 'receptor')
    cmd.color('aquamarine', 'receptor')
    cmd.set('cartoon_transparency', 0.08, 'receptor')
    style_ligand('ligand')
    cmd.select('pocket', 'byres (receptor within 4.2 of ligand)')
    cmd.show('sticks', 'pocket')
    cmd.color('forest', 'pocket and elem C')
    cmd.color('blue', 'pocket and elem N')
    cmd.color('red', 'pocket and elem O')
    cmd.color('tv_yellow', 'pocket and elem S')
    cmd.distance('polar_contacts', '(ligand and elem N+O+S)', '(pocket and elem N+O+S)', 3.6, mode=2)
    cmd.hide('labels', 'polar_contacts')
    cmd.color('red', 'polar_contacts')
    cmd.orient('receptor or ligand')
    cmd.zoom('receptor or ligand', 7)
    cmd.png(panel['main'], width=560, height=390, dpi=220, ray=1)

    cmd.hide('cartoon', 'receptor')
    for residue in panel.get('nearbyResidues', []):
        selection = f"pocket and chain {{residue['chain']}} and resi {{residue['residueId']}} and name CA"
        if cmd.count_atoms(selection) == 0:
            selection = f"pocket and chain {{residue['chain']}} and resi {{residue['residueId']}} and elem C"
        cmd.label(selection, 'resn + resi')
    cmd.zoom('ligand or pocket', 1.8)
    cmd.png(panel['inset'], width=560, height=390, dpi=220, ray=1)


for panel in panels:
    render_panel(panel)
cmd.quit()
""",
            encoding="utf-8",
        )

        completed = subprocess.run(
            [*command_parts, "-cq", str(pymol_script)],
            cwd=str(package_root),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=180,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                "PyMOL rendering failed\n"
                f"stdout:\n{completed.stdout[-2000:]}\n"
                f"stderr:\n{completed.stderr[-2000:]}"
            )

        compose_pymol_panels(
            panels=panels,
            receptor=receptor,
            ligands=ligands,
            output=output,
            title="ImmunoGraph actual docking visualization",
            subtitle="RCSB 1UYD receptor + PubChem CID 2244 ligand; poses from AutoDock Vina; contacts from PyMOL geometry",
        )
        return {
            "renderer": "pymol-headless",
            "pymolCommand": pymol_command,
            "renderedPanels": len(panels),
        }


def polar_contacts(receptor: list[Atom], ligand: list[Atom], cutoff: float = 3.6) -> list[tuple[float, Atom, Atom]]:
    pocket_keys = {key for key, _ in nearby_residues(receptor, ligand)}
    pocket_atoms = [atom for atom in receptor if residue_key(atom) in pocket_keys]
    receptor_hetero = [atom for atom in pocket_atoms if atom.element in {"N", "O", "S"}]
    ligand_hetero = [atom for atom in ligand if atom.element in {"N", "O", "S", "CL"}]
    contacts: list[tuple[float, Atom, Atom]] = []
    for ligand_atom in ligand_hetero:
        for receptor_atom in receptor_hetero:
            contact_distance = distance(ligand_atom, receptor_atom)
            if 2.2 <= contact_distance <= cutoff:
                contacts.append((contact_distance, ligand_atom, receptor_atom))
    return sorted(contacts, key=lambda item: item[0])[:5]


def residue_label(key: tuple[str, str, str]) -> str:
    chain, residue, residue_id = key
    return f"{residue}{residue_id}" if chain in {"", "A"} else f"{residue}{residue_id}:{chain}"


def draw_label_box(
    draw: ImageDraw.ImageDraw,
    origin: tuple[int, int],
    lines: list[str],
    font,
    title_fill=(12, 86, 63),
    body_fill=(42, 60, 56),
):
    x, y = origin
    line_height = 22
    width = max(210, max(len(line) for line in lines) * 9 + 22)
    height = 14 + line_height * len(lines)
    draw.rounded_rectangle((x, y, x + width, y + height), radius=10, fill=(255, 255, 255), outline=(166, 190, 183), width=1)
    for idx, line in enumerate(lines):
        fill = title_fill if idx == 0 else body_fill
        draw.text((x + 10, y + 8 + idx * line_height), line, fill=fill, font=font)


def compose_pymol_panels(
    panels: list[dict[str, str]],
    receptor: list[Atom],
    ligands: list[list[Atom]],
    output: Path,
    title: str,
    subtitle: str,
) -> None:
    image = Image.new("RGB", (1240, 1540), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    font, small_font = load_fonts()
    draw.text((34, 18), title, fill=(12, 56, 48), font=font)
    draw.text((34, 54), subtitle, fill=(70, 92, 88), font=small_font)
    y_positions = [100, 565, 1030]
    for pose_index, (panel, top, ligand) in enumerate(zip(panels, y_positions, ligands), start=1):
        main = Image.open(panel["main"]).convert("RGB")
        inset = Image.open(panel["inset"]).convert("RGB")
        image.paste(main, (60, top + 35))
        image.paste(inset, (640, top + 35))
        draw.text((34, top), panel["label"], fill=(20, 20, 20), font=font)
        draw.text((82, top + 402), f"Pose {pose_index}: receptor ribbon + docked ligand", fill=(52, 72, 68), font=small_font)
        draw.rectangle((630, top + 25, 1210, top + 435), outline=(45, 45, 45), width=2)
        draw.rectangle((365, top + 205, 535, top + 355), outline=(45, 45, 45), width=2)
        draw.line((535, top + 205, 630, top + 25), fill=(70, 70, 70), width=1)
        draw.line((535, top + 355, 630, top + 435), fill=(70, 70, 70), width=1)

        nearest = nearby_residues(receptor, ligand)[:5]
        contacts = polar_contacts(receptor, ligand)[:4]
        residue_lines = ["Nearby residues"] + [
            f"{residue_label(key)}  {min_distance:.1f} A" for key, min_distance in nearest
        ]
        contact_lines = ["Polar contacts"] + [
            f"{contact_distance:.1f} A  LIG-{receptor_atom.residue}{receptor_atom.residue_id}"
            for contact_distance, _ligand_atom, receptor_atom in contacts
        ]
        if len(contact_lines) == 1:
            contact_lines.append("none <= 3.6 A")
        draw_label_box(draw, (652, top + 44), residue_lines, small_font)
        draw_label_box(draw, (972, top + 320), contact_lines, small_font, title_fill=(116, 39, 39), body_fill=(83, 45, 45))
    draw.text(
        (34, 1482),
        "Cartoon: receptor ribbon | Yellow: docked ligand | Green: nearby residues | Red dashed: inferred polar contacts",
        fill=(60, 60, 60),
        font=small_font,
    )
    draw.text(
        (34, 1508),
        "Callouts list closest pocket residues, minimum residue distances, and inferred polar contact distances from actual coordinates.",
        fill=(60, 60, 60),
        font=small_font,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)


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


def load_fonts():
    candidates = [
        ("arial.ttf", "arial.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ),
    ]
    for title_path, body_path in candidates:
        try:
            return ImageFont.truetype(title_path, 28), ImageFont.truetype(body_path, 18)
        except OSError:
            continue
    try:
        return ImageFont.truetype("arial.ttf", 28), ImageFont.truetype("arial.ttf", 18)
    except OSError:
        return ImageFont.load_default(), ImageFont.load_default()


def draw_coordinate_panel(
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
        draw.text((mx + 3, my + 3), f"{d:.1f} A", fill=(80, 30, 30), font=small_font)

    for idx, ((chain, residue, residue_id), _min_distance) in enumerate(nearby_residues(receptor, ligand)[:8]):
        atoms = residue_groups.get((chain, residue, residue_id), [])
        if not atoms:
            continue
        atom = min(atoms, key=lambda candidate: min(distance(candidate, lig_atom) for lig_atom in ligand))
        px, py, _ = zoom_mapper(atom)
        text = f"{residue}{residue_id}"
        tx = inset_box[0] + 12 + (idx % 2) * 180
        ty = inset_box[1] + 12 + (idx // 2) * 24
        draw.line((px, py, tx, ty + 8), fill=(75, 75, 75), width=1)
        draw.text((tx, ty), text, fill=(20, 85, 48), font=small_font)


def render_coordinate_projection(output: Path, receptor: list[Atom], ligands: list[list[Atom]]) -> dict[str, object]:
    image = Image.new("RGB", (1100, 1500), (255, 255, 255))
    draw = ImageDraw.Draw(image)
    font, small_font = load_fonts()

    draw.text((34, 18), "ImmunoGraph actual docking visualization", fill=(12, 56, 48), font=font)
    draw.text(
        (34, 52),
        "RCSB 1UYD receptor + PubChem CID 2244 ligand; poses from AutoDock Vina; contacts from actual coordinates",
        fill=(70, 92, 88),
        font=small_font,
    )
    panels = [(25, 90, 1075, 545), (25, 550, 1075, 1005), (25, 1010, 1075, 1465)]
    for label, panel, ligand in zip(["A", "B", "C"], panels, ligands):
        draw_coordinate_panel(draw, panel, label, receptor, ligand, font, small_font)
    draw.text(
        (34, 1468),
        "Yellow: docked ligand pose | Green: nearby residues | Red dashed: inferred polar contacts",
        fill=(60, 60, 60),
        font=small_font,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output)
    return {
        "renderer": "coordinate-projection-pillow",
        "renderedPanels": min(3, len(ligands)),
    }


def write_metadata(output: Path, metadata: dict[str, object]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    (output.parent / "docking-view-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render an ImmunoGraph docking figure.")
    parser.add_argument("package_root", type=Path, help="Path to research-package directory")
    parser.add_argument("output", nargs="?", type=Path, help="Output PNG path")
    parser.add_argument(
        "--renderer",
        choices=["auto", "pymol", "coordinate"],
        default=os.environ.get("DOCKING_FIGURE_RENDERER", "auto"),
        help="Renderer to use. auto prefers PyMOL and falls back to coordinate projection.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    package_root: Path = args.package_root
    output: Path = args.output if args.output else package_root / "docking" / "docking-view.png"
    receptor_path, pose_paths, receptor, ligands = load_inputs(package_root)

    renderer_error: str | None = None
    render_info: dict[str, object]
    if args.renderer in {"auto", "pymol"}:
        try:
            render_info = render_with_pymol(package_root, output, receptor_path, pose_paths[:3], receptor, ligands[:3])
        except Exception as exc:
            renderer_error = str(exc)
            if args.renderer == "pymol":
                raise
            render_info = render_coordinate_projection(output, receptor, ligands)
    else:
        render_info = render_coordinate_projection(output, receptor, ligands)

    metadata = {
        "schemaVersion": "immunograph-docking-figure.v1",
        **render_info,
        "preferredRenderer": "pymol-headless",
        "fallbackRenderer": "coordinate-projection-pillow",
        "rendererError": renderer_error,
        "labelsIncluded": True,
        "labelTypes": ["nearby_residues", "minimum_distances", "polar_contacts", "pose_numbers", "legend"],
        "receptorAtoms": len(receptor),
        "ligandPoseCountRendered": min(3, len(ligands)),
        "output": str(output),
    }
    write_metadata(output, metadata)
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
