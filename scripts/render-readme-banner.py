"""Build the README SVG banner from the exported 1IEP/imatinib complex.

The molecule on the right is a 2D projection of actual C-alpha and docked
ligand coordinates. The banner is illustrative; the source PDB is preserved
under docs/examples for inspection.
"""

from html import escape
from math import cos, radians, sin, sqrt
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/examples/1iep-imatinib-vina-complex.pdb"
OUTPUT = ROOT / "docs/assets/immunograph-hero.svg"


def atoms_from_pdb(path):
    ca, ligand = [], []
    for line in path.read_text().splitlines():
        kind = line[:6].strip()
        if kind not in ("ATOM", "HETATM"):
            continue
        point = tuple(float(line[i : i + 8]) for i in (30, 38, 46))
        element = line[76:78].strip() or line[12:16].strip()[0]
        if kind == "ATOM" and line[12:16].strip() == "CA":
            ca.append((point, line[21:22], line[22:27].strip()))
        if kind == "HETATM" and element != "H":
            ligand.append((point, element))
    if not ca or not ligand:
        raise ValueError("PDB needs protein C-alpha atoms and ligand heavy atoms")
    return ca, ligand


def distance(a, b):
    return sqrt(sum((u - v) ** 2 for u, v in zip(a, b)))


def rotate(point):
    x, y, z = point
    yaw, pitch = radians(-56), radians(29)
    x1 = cos(yaw) * x - sin(yaw) * y
    y1 = sin(yaw) * x + cos(yaw) * y
    return (x1, cos(pitch) * y1 - sin(pitch) * z, sin(pitch) * y1 + cos(pitch) * z)


def render():
    ca, ligand = atoms_from_pdb(SOURCE)
    all_points = [rotate(point) for point, _, _ in ca] + [rotate(point) for point, _ in ligand]
    left, right = min(p[0] for p in all_points), max(p[0] for p in all_points)
    top, bottom = min(p[1] for p in all_points), max(p[1] for p in all_points)
    scale = min(398 / (right - left), 286 / (bottom - top))
    dx = 742 + (398 - (right - left) * scale) / 2
    dy = 65 + (286 - (bottom - top) * scale) / 2

    def project(point):
        x, y, depth = rotate(point)
        return (dx + (x - left) * scale, dy + (y - top) * scale, depth)

    protein_segments = []
    for first, second in zip(ca, ca[1:]):
        if first[1] != second[1] or distance(first[0], second[0]) >= 4.5:
            continue
        a, b = project(first[0]), project(second[0])
        protein_segments.append(f"M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}")
    protein_path = " ".join(protein_segments)

    bonds = []
    radii = {"C": 0.76, "N": 0.71, "O": 0.66, "S": 1.05, "P": 1.07}
    for index, (first, first_element) in enumerate(ligand):
        for second, second_element in ligand[index + 1 :]:
            limit = radii.get(first_element, 0.75) + radii.get(second_element, 0.75) + 0.5
            if distance(first, second) <= limit:
                a, b = project(first), project(second)
                bonds.append(f'<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f}" stroke="#ffbb74" stroke-width="3.2" stroke-linecap="round"/>')
    colors = {"C": "#ffca86", "N": "#9eb9ff", "O": "#ff7e94", "S": "#ffe48b"}
    dots = []
    for point, element in ligand:
        x, y, _ = project(point)
        dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.1" fill="{colors.get(element, "#f5f2e8")}"/>')

    ligand_center = tuple(sum(point[axis] for point, _ in ligand) / len(ligand) for axis in range(3))
    halo_x, halo_y, _ = project(ligand_center)
    title = escape("ImmunoGraph MCP")
    description = escape("Open-source MCP for computational epitope research. The molecular trace is projected from a real 1IEP protein and docked imatinib complex; the pose is computed, not experimentally validated.")
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="420" viewBox="0 0 1280 420" role="img" aria-labelledby="title desc">
  <title id="title">{title}</title>
  <desc id="desc">{description}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#081221"/><stop offset=".55" stop-color="#101d35"/><stop offset="1" stop-color="#101c32"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#7ee6db"/><stop offset="1" stop-color="#a998ff"/></linearGradient>
    <radialGradient id="halo"><stop stop-color="#faac73" stop-opacity=".34"/><stop offset="1" stop-color="#faac73" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#88a0c7" opacity=".2"/></pattern>
    <clipPath id="viewport"><rect x="704" y="36" width="528" height="348" rx="24"/></clipPath>
  </defs>
  <rect width="1280" height="420" rx="24" fill="url(#bg)"/>
  <rect width="1280" height="420" rx="24" fill="url(#dots)"/>
  <path d="M0 0 H672 L650 420 H0Z" fill="#091525" opacity=".55"/>
  <path d="M38 36 H40 V384 H38" fill="none" stroke="url(#accent)" stroke-width="3"/>
  <text x="68" y="79" fill="#7ee6db" font-family="Arial,Helvetica,sans-serif" font-size="14" font-weight="700" letter-spacing="2.2">OPEN-SOURCE SCIENTIFIC MCP</text>
  <text x="68" y="176" fill="#f7f9ff" font-family="Arial,Helvetica,sans-serif" font-size="68" font-weight="700" letter-spacing="-2.5">ImmunoGraph</text>
  <rect x="68" y="194" width="85" height="33" rx="16" fill="#20364b" stroke="#4b8a9a"/>
  <text x="91" y="216" fill="#85e6dd" font-family="Arial,Helvetica,sans-serif" font-size="17" font-weight="700">MCP</text>
  <text x="168" y="216" fill="#dce7f3" font-family="Arial,Helvetica,sans-serif" font-size="20">From sequence to inspectable evidence</text>
  <path d="M68 253 H610" stroke="url(#accent)" stroke-width="2" opacity=".8"/>
  <text x="68" y="294" fill="#d3e0eb" font-family="Arial,Helvetica,sans-serif" font-size="19">46 typed tools  ·  explicit provenance</text>
  <text x="68" y="325" fill="#a7bdd2" font-family="Arial,Helvetica,sans-serif" font-size="18">Real coordinate exports and 3D viewers</text>
  <text x="68" y="374" fill="#778da8" font-family="Arial,Helvetica,sans-serif" font-size="14">COMPUTATIONAL RESEARCH  /  NOT CLINICAL VALIDATION</text>
  <g clip-path="url(#viewport)">
    <rect x="704" y="36" width="528" height="348" rx="24" fill="#0c2030"/>
    <circle cx="{halo_x:.1f}" cy="{halo_y:.1f}" r="86" fill="url(#halo)"/>
    <path d="{protein_path}" fill="none" stroke="#54ced4" stroke-width="8" opacity=".12" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="{protein_path}" fill="none" stroke="#76dae1" stroke-width="2.3" opacity=".82" stroke-linecap="round" stroke-linejoin="round"/>
    {''.join(bonds)}
    {''.join(dots)}
    <rect x="724" y="54" width="234" height="30" rx="15" fill="#163447" stroke="#386b7b"/>
    <circle cx="740" cy="69" r="4" fill="#79dfdb"/>
    <text x="752" y="74" fill="#cce8ed" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="700" letter-spacing=".7">REAL COORDINATE EXAMPLE</text>
    <rect x="722" y="331" width="490" height="36" rx="10" fill="#091828" opacity=".92"/>
    <text x="738" y="354" fill="#c9dbe5" font-family="Arial,Helvetica,sans-serif" font-size="14">1IEP protein  +  computed imatinib pose</text>
  </g>
  <rect x="704" y="36" width="528" height="348" rx="24" fill="none" stroke="#3c6a7d" stroke-opacity=".8"/>
</svg>'''
    OUTPUT.write_text(svg + "\n", encoding="utf-8")
    print(f"{OUTPUT} ({len(ca)} C-alpha atoms, {len(ligand)} ligand heavy atoms)")


if __name__ == "__main__":
    render()
