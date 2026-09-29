"""Exercise reviewed-image SQL against SQLite (the D1 SQL dialect)."""
import json
from pathlib import Path
import sqlite3
import subprocess

root = Path(__file__).resolve().parent.parent
catalog = json.loads((root / 'data/movie-images/2026-09-27.json').read_text())
sql = subprocess.check_output(['node', str(root / 'scripts/reviewed-images.mjs')], text=True)
schema = (root / 'migrations/0025_reviewed_movie_images.sql').read_text()
db = sqlite3.connect(':memory:')
db.execute('CREATE TABLE showings (id TEXT PRIMARY KEY, title TEXT, movie_key TEXT, image_url TEXT)')
film = catalog['films'][0]
title, key, image = film['showingTitles'][0], film['movieKey'], film['imageUrl']
placeholder = 'https://tjoy.jp/img/front/images/no-img.jpg'
real = 'https://example.com/existing.jpg'
rows = [('missing', title, key, None), ('placeholder', title, key, placeholder),
        ('valid', title, key, real), ('unknown', 'Unknown film', key, None),
        ('wrong-key', title, 'other-key', None)]
db.executemany('INSERT INTO showings VALUES (?,?,?,?)', rows)
db.executescript(schema)
db.executescript(sql)
get = lambda row_id: db.execute('SELECT image_url FROM showings WHERE id=?', (row_id,)).fetchone()[0]
assert get('missing') == image
assert get('placeholder') == image
assert get('valid') == real
assert get('unknown') is None
assert get('wrong-key') is None
# Idempotent backfill and schema application.
db.executescript(schema)
db.executescript(sql)
assert get('valid') == real
# The collector deletes and reinserts each date; the image must survive it.
db.execute("DELETE FROM showings WHERE id='missing'")
db.execute('INSERT INTO showings VALUES (?,?,?,?)', ('missing', title, key, None))
assert get('missing') == image
for row_id, value in [('new-placeholder', placeholder), ('new-empty', ''), ('new-valid', real)]:
    db.execute('INSERT INTO showings VALUES (?,?,?,?)', (row_id, title, key, value))
    assert get(row_id) == (real if value == real else image)
assert db.execute('SELECT count(*) FROM reviewed_movie_images').fetchone()[0] == sum(len(f['showingTitles']) for f in catalog['films'])
print('Passed: backfill, preserved images, exact matching, repeat application, collection replacement.')
