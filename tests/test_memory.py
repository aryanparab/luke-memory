import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import create_app
from store import Store

BASE = 'http://localhost:5051'

class FakeModels:
    provider = 'ollama'
    text_model = 'test-model'
    def __init__(self): self.messages = []
    def chat(self, messages):
        self.messages = messages
        return 'The launch review is Friday. [1]'

class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.models = FakeModels()
        with patch.dict('os.environ', {'LUKE_ALLOW_CAPTURE':'0', 'LUKE_PORT':'5051'}):
            self.app = create_app(self.temp.name, self.models)
        self.client = self.app.test_client()
    def tearDown(self): self.temp.cleanup()
    def get(self, route): return self.client.get(route, base_url=BASE)
    def post(self, route, data): return self.client.post(route, json=data, base_url=BASE)
    def note(self):
        return self.post('/api/memories', {'title':'Launch review', 'content':'Meet Imani on Friday to review the lighthouse release.'}).json['memory']
    def test_capture_never_starts_on_launch(self):
        status = self.get('/api/status').json
        self.assertFalse(status['capture_running'])
        self.assertFalse(status['capture_allowed'])
        self.assertEqual(self.post('/api/capture', {'action':'once'}).status_code, 403)
        self.assertEqual(self.post('/api/capture', {'action':'start'}).status_code, 403)
    def test_notes_persist_in_fresh_store_and_search(self):
        self.note()
        second_store = Store(Path(self.temp.name) / 'memory.sqlite3')
        self.assertEqual(second_store.memories('lighthouse')[0]['title'], 'Launch review')
        self.assertEqual(second_store.memories('unrelatedterm'), [])
        self.assertEqual(second_store.memories('" OR "'), [])
    def test_task_completion_uses_stable_ids(self):
        task = self.post('/api/tasks', {'title':'Review the demo'}).json['task']
        self.assertEqual(self.post('/api/tasks/complete', {'id':task['id']}).status_code, 200)
        self.assertEqual(self.get('/api/tasks').json['tasks'][0]['done'], 1)
        self.assertEqual(self.post('/api/tasks/complete', {'id':task['id']}).status_code, 404)
    def test_chat_gets_retrieved_records_and_sources(self):
        memory = self.note()
        result = self.post('/api/chat', {'message':'When is the launch review?'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['sources'][0]['id'], memory['id'])
        self.assertIn('Friday', self.models.messages[-1]['content'])
    def test_empty_chat_does_not_call_model(self):
        result = self.post('/api/chat', {'message':'What did I do?'})
        self.assertIn('empty', result.json['answer'])
        self.assertEqual(self.models.messages, [])
    def test_provider_failure_keeps_memories(self):
        self.note()
        with patch.object(self.models, 'chat', side_effect=RuntimeError('offline')):
            self.assertEqual(self.post('/api/chat', {'message':'Review'}).status_code, 502)
        self.assertEqual(len(self.get('/api/memories').json['memories']), 1)
    def test_summary_is_searchable_and_persisted(self):
        self.note()
        result = self.post('/api/summarize', {})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['memory']['source'], 'summary')
        self.assertEqual(len(self.get('/api/memories?q=Friday').json['memories']), 2)
    def test_cross_origin_and_host_are_rejected(self):
        r = self.client.post('/api/tasks', json={'title':'bad'}, base_url=BASE, headers={'Origin':'https://untrusted.example'})
        self.assertEqual(r.status_code, 403)
        self.assertEqual(self.client.get('/api/status', base_url='http://untrusted.example:5051').status_code, 403)
    def test_non_object_requests_are_rejected(self):
        self.assertEqual(self.post('/api/memories', []).status_code, 400)
        self.assertEqual(self.post('/api/chat', None).status_code, 415)

    def test_validation_rejects_empty_or_oversized_notes(self):
        self.assertEqual(self.post('/api/memories', {'title':' ', 'content':'x'}).status_code, 400)
        self.assertEqual(self.post('/api/memories', {'title':'x', 'content':'x'*12001}).status_code, 400)
