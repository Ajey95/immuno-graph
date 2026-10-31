import sys
import unittest
from pathlib import Path
from xml.etree import ElementTree

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "live"))
from extract_plip import parse_contacts


class PlipParserTest(unittest.TestCase):
    def test_pi_stack_included_in_structured_contacts(self) -> None:
        root = ElementTree.fromstring("""
            <report><bindingsite><interactions><pi_stacks><pi_stack>
              <resnr>253</resnr><reschain>A</reschain><centdist>4.95</centdist>
            </pi_stack></pi_stacks></interactions></bindingsite></report>
        """)
        self.assertEqual(parse_contacts(root), [{
            "interactionType": "PI_STACKING",
            "residueRef": "A:253",
            "distanceAngstrom": 4.95,
        }])


if __name__ == "__main__":
    unittest.main()
