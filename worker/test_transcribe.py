"""Run with:  python -m unittest discover worker   (needs no model, no network)."""

import json
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(__file__))
sys.modules.setdefault("requests", types.ModuleType("requests"))  # the tests never call the network

import transcribe  # noqa: E402


class FormatSegments(unittest.TestCase):
    def test_tidies_text_and_drops_empty_lines(self):
        out = transcribe.format_segments([(0.04, 3.26, "  Hello   there. "), (3.3, 4.0, "   ")])
        self.assertEqual(out, [{"s": 0.0, "e": 3.3, "t": "Hello there."}])

    def test_rounds_to_one_decimal(self):
        out = transcribe.format_segments([(12.349, 15.951, "x")])
        self.assertEqual((out[0]["s"], out[0]["e"]), (12.3, 16.0))


class FitSegments(unittest.TestCase):
    def test_leaves_small_transcripts_alone(self):
        segs = [{"s": 0, "e": 1, "t": "a"}, {"s": 1, "e": 2, "t": "b"}]
        self.assertEqual(transcribe.fit_segments(segs), segs)

    def test_merges_until_it_fits_and_keeps_the_whole_timeline(self):
        segs = [{"s": i, "e": i + 1, "t": "word " * 6} for i in range(2500)]
        self.assertGreater(len(json.dumps(segs)), transcribe.MAX_SEGMENT_JSON)
        fitted = transcribe.fit_segments(segs)
        self.assertLessEqual(len(json.dumps(fitted)), transcribe.MAX_SEGMENT_JSON)
        self.assertEqual(fitted[0]["s"], 0)
        self.assertEqual(fitted[-1]["e"], 2500)

    def test_cuts_the_text_only_when_the_words_alone_are_too_many(self):
        segs = [{"s": i, "e": i + 1, "t": "word " * 40} for i in range(1200)]
        fitted = transcribe.fit_segments(segs)
        self.assertLessEqual(len(json.dumps(fitted)), transcribe.MAX_SEGMENT_JSON)
        self.assertTrue(fitted[-1]["t"].endswith("..."))


if __name__ == "__main__":
    unittest.main()
