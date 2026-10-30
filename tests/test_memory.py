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
        self.assertTrue(any('Friday' in row['content'] for row in self.models.messages))
    def test_empty_chat_still_allows_conversation(self):
        result = self.post('/api/chat', {'message':'What did I do?'})
        self.assertEqual(result.status_code, 200)
        self.assertTrue(self.models.messages)
        self.assertEqual(result.json['sources'], [])
    def test_provider_failure_keeps_memories(self):
        self.note()
        with patch.object(self.models, 'chat', side_effect=RuntimeError('offline')):
            self.assertEqual(self.post('/api/chat', {'message':'Review'}).status_code, 502)
        self.assertEqual(len(self.get('/api/memories').json['memories']), 1)
        self.assertEqual(self.get('/api/chat/history').json['messages'][0]['content'], 'Review')
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

    def test_greetings_are_saved_without_irrelevant_sources(self):
        self.note()
        result = self.post('/api/chat', {'message':'Hi'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['sources'], [])
        self.assertEqual(self.models.messages, [])
        history = self.get('/api/chat/history').json['messages']
        self.assertEqual([row['role'] for row in history], ['user', 'assistant'])
        self.assertEqual(len(Store(Path(self.temp.name) / 'memory.sqlite3').history()), 2)

    def test_followup_context_survives_new_app(self):
        self.post('/api/chat', {'message':'My project is called Atlas'})
        with patch.dict('os.environ', {'LUKE_ALLOW_CAPTURE':'0', 'LUKE_PORT':'5051'}):
            restarted = create_app(self.temp.name, self.models).test_client()
        result = restarted.post('/api/chat', json={'message':'What is it called?'}, base_url=BASE)
        self.assertEqual(result.status_code, 200)
        self.assertTrue(any(row['content']=='My project is called Atlas' for row in self.models.messages))
        self.assertEqual(len(self.get('/api/chat/history').json['messages']), 4)

    def test_uncited_memories_are_not_displayed_as_sources(self):
        self.note()
        with patch.object(self.models, 'chat', return_value='I do not have that detail.'):
            result = self.post('/api/chat', {'message':'unknown fact'})
        self.assertEqual(result.json['sources'], [])

    def test_curated_memories_group_daily_summaries_and_keep_raw_search(self):
        store = self.app.extensions['memory_store']
        note = self.note()
        screen = store.add_memory('Screen observation', 'Orchid technical decision', 'screen')
        store.save_summary('Orchid decision recap', [screen])
        other = store.add_memory('Later observation', 'Follow up with the team', 'screen')
        store.save_summary('Team follow up recap', [other])
        cards = self.get('/api/memories').json['memories']
        self.assertEqual(len(cards), 2)
        digest = next(row for row in cards if row['source']=='digest')
        self.assertEqual(digest['record_count'], 2)
        self.assertIn('Orchid', digest['content'])
        self.assertIn('Team', digest['content'])
        self.assertEqual(store.card_count(), 2)
        self.assertEqual(len(self.get('/api/memories?view=activity').json['memories']), 5)
        self.assertTrue(self.get('/api/memories?q=Orchid').json['memories'])

    def test_smalltalk_does_not_create_memory_cards(self):
        self.post('/api/chat', {'message':'Hi'})
        self.post('/api/chat', {'message':'How are you?'})
        self.assertEqual(len(self.get('/api/chat/history').json['messages']), 4)
        self.assertEqual(self.get('/api/status').json['memory_count'], 0)
        self.assertEqual(self.get('/api/memories').json['memories'], [])

    def test_explicit_user_fact_is_saved_without_assistant_duplication(self):
        self.post('/api/chat', {'message':'Remember that my project is Orchid'})
        records = self.app.extensions['memory_store'].memories()
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['content'], 'User stated: Remember that my project is Orchid')
