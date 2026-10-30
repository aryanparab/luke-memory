"""Synthetic capture fixtures: no real screen or private data used by tests."""
import tempfile
import unittest
import sys
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from store import Store
from capture import Capture


class Models:
    def chat(self, messages):
        return 'Release review Friday at 10 AM; follow up with Imani.'


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'test.sqlite3')
        self.capture = Capture(self.store, Models())
        self.capture.extractor = 'ocr'
    def tearDown(self):
        self.temp.cleanup()
    def observe(self, capture=None, color='white', text='Release review Friday at 10 AM'):
        capture = capture or self.capture
        with patch.object(capture, 'screen_image', return_value=Image.new('RGB', (320, 200), color)), patch('capture.extract_text', return_value=text) as ocr:
            result = capture.once()
        return result, ocr.call_count
    def test_same_screen_hash_skips_ocr_and_survives_restart(self):
        self.observe()
        second = Capture(Store(self.store.path), Models())
        second.extractor = 'ocr'
        result, calls = self.observe(second)
        self.assertTrue(result['skipped'])
        self.assertEqual(calls, 0)
        self.assertEqual(len(self.store.memories()), 1)
        self.assertEqual(self.store.stats()['duplicate_skips'], 1)
    def test_visual_near_duplicate_skips_ocr(self):
        self.observe()
        result, calls = self.observe(color=(254, 254, 254))
        self.assertTrue(result['skipped'])
        self.assertEqual(calls, 0)
    def test_changed_pixels_identical_text_does_not_add_memory(self):
        self.observe()
        result, calls = self.observe(color='black')
        self.assertTrue(result['skipped'])
        self.assertEqual(calls, 1)
        self.assertEqual(len(self.store.memories()), 1)
    def test_changed_text_persists(self):
        self.observe()
        result, _ = self.observe(color='black', text='New meeting Monday at noon')
        self.assertEqual(result['source'], 'screen')
        self.assertEqual(len(Store(self.store.path).memories()), 1)
        self.assertIn('Friday', Store(self.store.path).memories()[0]['content'])
        self.assertIn('Monday', Store(self.store.path).memories()[0]['content'])
    def test_failed_extraction_retries_without_marking_seen(self):
        with patch.object(self.capture, 'screen_image', return_value=Image.new('RGB', (320,200))), patch('capture.extract_text', side_effect=RuntimeError('ocr failed')):
            with self.assertRaises(RuntimeError): self.capture.once()
        self.assertEqual(self.store.stats()['observations'], 0)
        self.observe(color='black')
        self.assertEqual(len(self.store.memories()), 1)
    def test_compaction_covers_inputs_and_preserves_originals(self):
        for i in range(4): self.store.add_memory(str(i), 'Friday release review')
        self.capture.compact_if_due()
        stats = self.store.stats()
        self.assertEqual(stats['memory_count'], 5)
        self.assertEqual(stats['compacted_records'], 4)
        self.assertEqual(stats['pending_compaction'], 0)
        self.capture.compact_if_due()
        self.assertEqual(self.store.stats()['memory_count'], 5)
        with self.assertRaises(ValueError): self.capture.summarize()
    def test_summary_failure_keeps_pending_records(self):
        for i in range(4): self.store.add_memory(str(i), 'Friday review')
        with patch.object(self.capture.models, 'chat', side_effect=RuntimeError('offline')):
            self.capture.compact_if_due()
        self.assertEqual(self.store.stats()['pending_compaction'], 4)
        self.assertEqual(self.store.stats()['compacted_records'], 0)
        self.assertIsNotNone(self.capture.compaction_error)

    def test_open_screen_session_is_not_compacted_automatically(self):
        self.observe()
        self.assertEqual(self.store.uncompacted(include_active=False), [])
        self.assertEqual(len(self.store.uncompacted()), 1)

    def test_compaction_rejects_stale_screen_snapshot(self):
        record, _ = self.observe()
        self.observe(color='black', text='Another important detail')
        with self.assertRaises(RuntimeError):
            self.store.save_summary('Outdated summary', [record])
        self.assertEqual(self.store.stats()['compacted_records'], 0)
