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
