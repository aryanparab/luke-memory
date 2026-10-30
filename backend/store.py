"""Local, transactional memory and task storage; no desktop tracking."""
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, title TEXT NOT NULL,
                    content TEXT NOT NULL, source TEXT NOT NULL);
                CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(id UNINDEXED, title, content);
                CREATE TABLE IF NOT EXISTS observations (
                    fingerprint TEXT PRIMARY KEY, memory_id TEXT, last_seen TEXT NOT NULL,
                    seen_count INTEGER NOT NULL DEFAULT 1);
                CREATE TABLE IF NOT EXISTS summary_inputs (
                    memory_id TEXT PRIMARY KEY, summary_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS conversation (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
                    content TEXT NOT NULL, created_at TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]');
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY, title TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL, completed_at TEXT);
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def add_memory(self, title, content, source='note'):
        record = dict(id=uuid.uuid4().hex, created_at=now(), title=title, content=content, source=source)
        with self.connect() as db:
            db.execute('INSERT INTO memories VALUES (:id,:created_at,:title,:content,:source)', record)
            db.execute('INSERT INTO memory_search VALUES (:id,:title,:content)', record)
        return record

    def memories(self, query='', limit=40):
        import re
        words = re.findall(r'\w+', query, flags=re.UNICODE)[:20]
        with self.connect() as db:
            if query.strip() and not words:
                return []
            if words:
                match = ' OR '.join('"' + word + '"' for word in words)
                rows = db.execute('''SELECT m.* FROM memory_search f JOIN memories m ON m.id=f.id
                    WHERE memory_search MATCH ? ORDER BY rank, m.created_at DESC LIMIT ?''', (match, limit))
            else:
                rows = db.execute('SELECT * FROM memories ORDER BY created_at DESC LIMIT ?', (limit,))
            return [dict(row) for row in rows]

    def add_task(self, title):
        record = dict(id=uuid.uuid4().hex, title=title, done=0, created_at=now(), completed_at=None)
        with self.connect() as db:
            db.execute('INSERT INTO tasks VALUES (:id,:title,:done,:created_at,:completed_at)', record)
        return record

    def tasks(self):
        with self.connect() as db:
            return [dict(row) for row in db.execute('SELECT * FROM tasks ORDER BY done, created_at DESC')]

    def complete_task(self, task_id):
        with self.connect() as db:
            updated = db.execute('UPDATE tasks SET done=1, completed_at=? WHERE id=? AND done=0', (now(), task_id))
        return updated.rowcount == 1

    def observation_seen(self, fingerprint):
        with self.connect() as db:
            row = db.execute('SELECT * FROM observations WHERE fingerprint=?', (fingerprint,)).fetchone()
            if not row:
                return False
            db.execute('UPDATE observations SET last_seen=?,seen_count=seen_count+1 WHERE fingerprint=?', (now(), fingerprint))
            return True

    def remember_observation(self, fingerprint, memory_id=None):
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO observations(fingerprint,memory_id,last_seen) VALUES (?,?,?)',
                       (fingerprint, memory_id, now()))

    def uncompacted(self, limit=20):
        with self.connect() as db:
            return [dict(row) for row in db.execute("""SELECT m.* FROM memories m
                LEFT JOIN summary_inputs s ON s.memory_id=m.id
                WHERE s.memory_id IS NULL AND m.source!='summary'
                ORDER BY m.created_at ASC LIMIT ?""", (limit,))]

    def save_summary(self, text, records):
        # Summary and input coverage commit together; originals remain available.
        record = dict(id=uuid.uuid4().hex, created_at=now(), title='Memory summary', content=text, source='summary')
        with self.connect() as db:
            db.execute('INSERT INTO memories VALUES (:id,:created_at,:title,:content,:source)', record)
            db.execute('INSERT INTO memory_search VALUES (:id,:title,:content)', record)
            for row in records:
                db.execute('INSERT INTO summary_inputs VALUES (?,?)', (row['id'], record['id']))
        return record

    def add_message(self, role, content, sources=None):
        import json
        with self.connect() as db:
            db.execute('INSERT INTO conversation(role,content,created_at,sources) VALUES (?,?,?,?)',
                       (role, content, now(), json.dumps(sources or [])))

    def history(self, limit=40):
        import json
        with self.connect() as db:
            rows = db.execute('SELECT * FROM (SELECT * FROM conversation ORDER BY seq DESC LIMIT ?) ORDER BY seq', (limit,))
            return [dict(row, sources=json.loads(row['sources'])) for row in rows]

    def stats(self):
        with self.connect() as db:
            return dict(memory_count=db.execute('SELECT COUNT(*) FROM memories').fetchone()[0],
                        conversation_messages=db.execute('SELECT COUNT(*) FROM conversation').fetchone()[0],
                        compacted_records=db.execute('SELECT COUNT(*) FROM summary_inputs').fetchone()[0],
                        pending_compaction=db.execute("SELECT COUNT(*) FROM memories WHERE source!='summary' AND id NOT IN (SELECT memory_id FROM summary_inputs)").fetchone()[0],
                        observations=db.execute('SELECT COUNT(*) FROM observations').fetchone()[0],
                        duplicate_skips=db.execute('SELECT COALESCE(SUM(seen_count-1),0) FROM observations').fetchone()[0])
