import json
from pathlib import Path
import re
import struct
import unittest

ROOT = Path(__file__).resolve().parents[2]
CAPTURES = Path(__file__).parent / 'captures'


class CaptureAssetsTests(unittest.TestCase):
    def test_every_screen_scene_has_complete_real_captures(self):
        copy = json.loads((ROOT / 'shared/site-guide.json').read_text())
        manifest = json.loads((CAPTURES / 'manifest.json').read_text())
        self.assertNotEqual(manifest['sourceRevision'], 'unknown')
        for lang, guide in copy.items():
            scenes = manifest['languages'][lang]
            self.assertEqual(len(scenes), len(guide['scenes']))
            self.assertEqual(sum(scene['duration'] for scene in scenes), 81)
            self.assertEqual([scene['name'] for scene in scenes if scene['kind'] == 'mascot'], ['intro', 'outro'])
            self.assertEqual([scene['name'] for scene in scenes[:3]], ['intro', 'schedule', 'cinema-settings'])
            self.assertEqual(scenes[0]['kind'], 'mascot')
            self.assertEqual(scenes[-1]['kind'], 'mascot')
            for scene in scenes:
                self.assertGreater(scene['duration'], 0)
                if scene['kind'] == 'mascot':
                    self.assertNotIn('frames', scene)
                    continue
                self.assertEqual(scene['kind'], 'screen')
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

    def test_exported_subtitles_follow_the_scene_durations(self):
        copy = json.loads((ROOT / 'shared/site-guide.json').read_text())
        manifest = json.loads((CAPTURES / 'manifest.json').read_text())
        for lang, scenes in manifest['languages'].items():
            blocks = (ROOT / f'public/guide/how-to-{lang}.vtt').read_text().strip().split('\n\n')[1:]
            self.assertEqual(len(blocks), len(scenes))
            start = 0
            for index, (scene, block) in enumerate(zip(scenes, blocks)):
                timing, caption = block.split('\n', 1)
                cues = re.findall(r'(\d\d):(\d\d):(\d\d)\.000', timing)
                seconds = [int(h)*3600+int(m)*60+int(s) for h, m, s in cues]
                end = start + scene['duration']
                self.assertEqual(seconds, [start, end])
                self.assertEqual(caption, copy[lang]['scenes'][index]['caption'])
                start = end


if __name__ == '__main__':
    unittest.main()
