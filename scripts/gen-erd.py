#!/usr/bin/env python3
"""Generates docs/erd.mmd (Mermaid ER diagram) from the live database: tables, key columns, foreign keys.
Run: python3 scripts/gen-erd.py   (stack running). Render PNG: see docs/01-arsitektur.md."""
import subprocess, collections

def q(sql):
    out = subprocess.run(['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'simrs_core', '-d', 'simrs', '-AtF', '|', '-c', sql], capture_output=True, text=True, check=True).stdout
    return [l.split('|') for l in out.strip().splitlines() if l]

cols = q("""select c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull
            from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname, a.attnum""")
pk = {(r, c) for r, c in q("""select conrelid::regclass::text, a.attname from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=any(k.conkey) where k.contype='p'""")}
uq = {(r, c) for r, c in q("""select conrelid::regclass::text, a.attname from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=any(k.conkey) where k.contype='u' and array_length(k.conkey,1)=1""")}
fks = q("""select conrelid::regclass::text, a.attname, confrelid::regclass::text from pg_constraint k join pg_attribute a on a.attrelid=k.conrelid and a.attnum=any(k.conkey) where k.contype='f'""")
fk = {(r, c) for r, c, _ in fks}
SKIP = {'created_at', 'updated_at', 'created_by', 'updated_by'}
tables = collections.OrderedDict()
for t, c, ty, nn in cols:
    tables.setdefault(t, []).append((c, ty, nn))

def short(ty):
    ty = ty.replace('character varying', 'varchar').replace('timestamp with time zone', 'timestamptz').replace('double precision', 'float')
    return ty.split('(')[0].replace(' ', '_')

lines = ['erDiagram']
for t, cs in tables.items():
    lines.append(f'    {t} {{')
    for c, ty, nn in cs:
        if c in SKIP:
            continue
        keys = [k for k, s in (('PK', pk), ('FK', fk), ('UK', uq)) if (t, c) in s]
        # show keys, plus a few business columns on small tables
        if keys:
            lines.append(f'        {short(ty)} {c} {",".join(keys)}')
        elif len([1 for x in cs if x[0] not in SKIP]) <= 9:
            lines.append(f'        {short(ty)} {c}')
    lines.append('    }')
seen = set()
for r, c, ref in fks:
    if (r, c, ref) in seen:
        continue
    seen.add((r, c, ref))
    lines.append(f'    {ref} ||--o{{ {r} : "{c}"')
open('docs/erd.mmd', 'w').write('\n'.join(lines) + '\n')
print(len(tables), 'tables,', len(seen), 'relations')
