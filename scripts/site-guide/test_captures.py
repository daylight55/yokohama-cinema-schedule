import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[2]
CAPTURES = Path(__file__).parent / 'captures'


class CaptureAssetsTests(unittest.TestCase):
    def test_every_script_scene_has_complete_real_captures(self):
        copy = json.loads((ROOT / 'shared/site-guide.json').read_text())
        manifest = json.loads((CAPTURES / 'manifest.json').read_text())
        self.assertNotEqual(manifest['sourceRevision'], 'unknown')
        for lang, guide in copy.items():
            scenes = manifest['languages'][lang]
            self.assertEqual(len(scenes), len(guide['scenes']))
            for scene in scenes:
                self.assertEqual(scene['frames'][0]['at'], 0)
                times = [frame['at'] for frame in scene['frames']]
                self.assertEqual(times, sorted(set(times)))
                self.assertLess(times[-1], scene['duration'])
                for frame in scene['frames']:
                    file = CAPTURES / frame['image']
                    data = file.read_bytes()
                    self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
                    self.assertEqual(struct.unpack('>II', data[16:24]), (780, 1400))
                    self.assertTrue(file.with_suffix('.txt').read_text().strip())
                    focus = frame['focus']
                    if focus:
                        self.assertGreater(focus['width'], 0)
                        self.assertGreater(focus['height'], 0)


if __name__ == '__main__':
    unittest.main()
