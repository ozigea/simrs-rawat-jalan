# API checks for registration, queue, examination, diagnosis, procedures, history (R-08..R-16, D-1, D-4 basics).
# Needs the stack running. Reset first for a clean day:
#   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/reset-transactions.sql
import json, subprocess, sys, urllib.request, urllib.error, uuid, datetime
B = 'http://localhost:8080/api/v1'
fails = 0

def call(method, path, token=None, body=None, headers=None):
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        r = urllib.request.urlopen(req); return r.status, json.load(r), r.headers
    except urllib.error.HTTPError as e:
        return e.code, json.load(e), e.headers

def login(u):
    s, d, _ = call('POST', '/auth/login', body={'username': u, 'password': 'Simrs#2026'}); return d['data']['access_token']

def sql(q):
    out = subprocess.run(['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'simrs_core', '-d', 'simrs', '-Atc', q], capture_output=True, text=True)
    return out.stdout.strip()

def check(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' ' + str(extra)))
    if not cond: fails += 1

A, P, D1, D2, K, F = (login(u) for u in ['admin', 'pendaftaran', 'dokter1', 'dokter2', 'kasir', 'farmasi'])
today = datetime.date.today().isoformat()
def hdr(): return {'Idempotency-Key': str(uuid.uuid4())}

# patients: 5 throw-away ones
pts = []
for i in range(5):
    s, d, _ = call('POST', '/patients', A, {'name': f'FLOW Pasien {i}', 'birth_date': '1980-02-02', 'gender': 'M', 'nik': '99996%011d' % (int(uuid.uuid4().int % 10**10) + i)})
    pts.append(d['data']['id'])
doc1_staff = call('GET', '/auth/me', D1)[1]['data']['staff_id']
s, d, _ = call('GET', f'/schedules/available?date={today}', P)
mine = [x for x in d['data'] if x['doctor_id'] == doc1_staff]
check('dokter1 has a schedule today (available list)', len(mine) >= 1 and mine[0]['remaining'] > 0, d)
sch = mine[0]
other_sch = [x for x in d['data'] if x['doctor_id'] != doc1_staff][0] if len(d['data']) > 1 else None

def reg(pid, sid=None, day=None, token=P, h=None):
    return call('POST', '/visits', token, {'patient_id': pid, 'schedule_id': sid or sch['id'], 'visit_date': day or today}, h or hdr())

# ---- registration rules
s, d, _ = reg(pts[0]); v1 = d['data'].get('id')
check('register -> 201 WAITING with queue_no, patient & doctor names', s == 201 and d['data']['status'] == 'WAITING' and d['data']['queue_no'] >= 1 and d['data']['doctor_name'], (s, d))
s, d, _ = reg(pts[0]); check('same patient/poli/day again -> 409 DUPLICATE_VISIT + existing visit', s == 409 and d['error']['code'] == 'DUPLICATE_VISIT' and d['error']['details'][0]['visit']['id'] == v1, (s, d))
s, d, _ = reg(pts[1], day=(datetime.date.today() + datetime.timedelta(days=1)).isoformat())
check('TC-06 schedule not valid on that weekday -> 422 SCHEDULE_NOT_ON_DATE', s == 422 and d['error']['code'] == 'SCHEDULE_NOT_ON_DATE', (s, d))
s, d, _ = reg(pts[1], day=(datetime.date.today() - datetime.timedelta(days=1)).isoformat()); check('past date -> 422', s == 422 and d['error']['details'][0]['field'] == 'visit_date', (s, d))
s, d, _ = reg(999999); check('unknown patient -> 422 on patient_id', s == 422 and d['error']['details'][0]['field'] == 'patient_id', (s, d))
s, d, _ = reg(pts[1], token=D1); check('dokter cannot register (403)', s == 403)
s, d, _ = reg(pts[1], token=K); check('kasir cannot register (403)', s == 403)
s, d, _ = call('POST', '/visits', P, {'patient_id': pts[1], 'schedule_id': sch['id']}, {'Idempotency-Key': 'x'}); check('bad Idempotency-Key -> 422', s == 422, (s, d))
s, d, _ = reg(pts[1]); v2 = d['data']['id']
s, d, _ = reg(pts[2]); v3 = d['data']['id']
check('registration fee charge item created', sql(f"select count(*) from charge_item where visit_id={v1} and source_type='REGISTRATION' and status='ACTIVE'") == '1')

# ---- visibility / ownership
s, d, _ = call('GET', f'/visits?date={today}&per_page=100', D1)
check('dokter1 list = only own visits', s == 200 and len(d['data']) >= 3 and all(x['doctor_id'] == doc1_staff for x in d['data']), (s, d['meta']))
s, d, _ = call('GET', f'/visits?date={today}&per_page=100', D2); check('dokter2 list excludes dokter1 visits', s == 200 and all(x['id'] not in (v1, v2, v3) for x in d['data']))
s, d, _ = call('GET', f'/visits/{v1}', D2); check('dokter2 cannot open dokter1 visit (403)', s == 403, (s, d))
s, d, _ = call('GET', f'/visits/{v1}', D1); check('dokter1 opens own visit incl. clinical block', s == 200 and 'clinical' in d['data'], d)
s, d, _ = call('GET', f'/visits/{v1}', P); check('pendaftaran sees visit WITHOUT clinical data', s == 200 and 'clinical' not in d['data'])
s, d, _ = call('GET', f'/visits/{v1}', A); check('admin sees visit with clinical block (read only)', s == 200 and 'clinical' in d['data'])
s, d, _ = call('GET', f'/visits?date={today}&q=FLOW&status=WAITING', P); check('list filter q + status', s == 200 and d['meta']['total'] >= 3, d['meta'])
s, d, _ = call('GET', f'/visits?date=abc', P); check('bad date filter -> 422', s == 422)
s, d, _ = call('GET', f'/visits', F); check('farmasi cannot list visits (403)', s == 403)

# ---- queue board
s, d, _ = call('GET', f'/queues?date={today}', P)
board = [x for x in d['data'] if x['schedule_id'] == sch['id']][0]
check('queue board: totals, next number, items', s == 200 and board['total'] >= 3 and board['next_queue_no'] and board['items'][0]['patient_name'], board)
s, d, _ = call('GET', f'/queues?date={today}', D1); check('dokter queue only own schedules', all(x['doctor_id'] == doc1_staff for x in d['data']))

# ---- call / state machine
s, d, _ = call('POST', f'/visits/{v1}/call', P); check('pendaftaran cannot call (403)', s == 403)
s, d, _ = call('POST', f'/visits/{v1}/call', D2); check('other doctor cannot call (403)', s == 403)
s, d, _ = call('POST', f'/visits/{v1}/finish', D1); check('finish before IN_EXAM -> 409', s in (409, 422), (s, d))
s, d, _ = call('POST', f'/visits/{v1}/call', D1); check('call -> IN_EXAM', s == 200 and d['data']['status'] == 'IN_EXAM' and d['data']['called_at'], (s, d))
s, d, _ = call('POST', f'/visits/{v1}/call', D1); check('call again -> 409 INVALID_STATE', s == 409 and d['error']['code'] == 'INVALID_STATE', (s, d))
s, d, _ = call('POST', f'/visits/{v1}/finish', D1)
check('finish without record/diagnosis -> 422 EXAM_INCOMPLETE (2 reasons)', s == 422 and d['error']['code'] == 'EXAM_INCOMPLETE' and len(d['error']['details']) == 2, (s, d))
s, d, _ = call('PUT', f'/visits/{v2}/examination', D1, {'chief_complaint': 'x'}); check('examination on WAITING visit -> 409', s == 409 and d['error']['code'] == 'INVALID_STATE', (s, d))

# ---- examination (R-13) + optimistic lock
s, d, _ = call('PUT', f'/visits/{v1}/examination', D1, {'chief_complaint': '', 'systolic': 80, 'diastolic': 90, 'temperature': 99})
check('examination validation: complaint, BP order, temperature', s == 422 and {x['field'] for x in d['error']['details']} >= {'chief_complaint', 'diastolic', 'temperature'}, (s, d))
ex = {'chief_complaint': 'Demam 3 hari', 'anamnesis': 'Batuk pilek', 'systolic': 120, 'diastolic': 80, 'pulse': 88, 'resp_rate': 18, 'temperature': 38.2, 'spo2': 97, 'weight_kg': 65.5, 'height_cm': 170, 'physical_exam': 'Faring hiperemis'}
s, d, _ = call('PUT', f'/visits/{v1}/examination', D1, ex); check('examination created, version 1', s == 200 and d['data']['version'] == 1 and d['data']['temperature'] == '38.2', (s, d))
s, d, _ = call('PUT', f'/visits/{v1}/examination', D1, ex); check('update without version -> 422', s == 422 and d['error']['details'][0]['field'] == 'version', (s, d))
s, d, _ = call('PUT', f'/visits/{v1}/examination', D1, {**ex, 'pulse': 90, 'version': 1}); check('update with version 1 -> version 2', s == 200 and d['data']['version'] == 2 and d['data']['pulse'] == 90, (s, d))
s, d, _ = call('PUT', f'/visits/{v1}/examination', D1, {**ex, 'pulse': 95, 'version': 1}); check('stale version -> 409 VERSION_CONFLICT', s == 409 and d['error']['code'] == 'VERSION_CONFLICT', (s, d))
s, d, _ = call('PUT', f'/visits/{v1}/examination', D2, ex); check('other doctor cannot edit (403)', s == 403)

# ---- diagnoses (R-14)
s, d, _ = call('POST', f'/visits/{v1}/diagnoses', D1, {'icd10_code': 'Z99.99', 'type': 'PRIMARY'}); check('unknown ICD-10 -> 422', s == 422 and d['error']['details'][0]['field'] == 'icd10_code', (s, d))
s, d, _ = call('POST', f'/visits/{v1}/diagnoses', D1, {'icd10_code': 'j06.9', 'type': 'PRIMARY'}); prim = d['data'].get('id')
check('primary diagnosis added (code uppercased)', s == 201 and d['data']['icd10_code'] == 'J06.9', (s, d))
s, d, _ = call('POST', f'/visits/{v1}/diagnoses', D1, {'icd10_code': 'R50.9', 'type': 'PRIMARY'}); check('TC-09 second primary -> 409 PRIMARY_DIAGNOSIS_EXISTS', s == 409 and d['error']['code'] == 'PRIMARY_DIAGNOSIS_EXISTS', (s, d))
s, d, _ = call('POST', f'/visits/{v1}/diagnoses', D1, {'icd10_code': 'J06.9', 'type': 'SECONDARY'}); check('same code twice -> 409', s == 409 and d['error']['code'] == 'DIAGNOSIS_DUPLICATE', (s, d))
s, d, _ = call('POST', f'/visits/{v1}/diagnoses', D1, {'icd10_code': 'R50.9', 'type': 'SECONDARY'}); sec = d['data']['id']; check('secondary diagnosis added', s == 201)
s, d, _ = call('DELETE', f'/visits/{v1}/diagnoses/{sec}', D1); check('void diagnosis without reason -> 422', s == 422)
s, d, _ = call('DELETE', f'/visits/{v1}/diagnoses/{sec}?reason=salah%20input', D1); check('void diagnosis with reason', s == 200, (s, d))
s, d, _ = call('DELETE', f'/visits/{v1}/diagnoses/{sec}?reason=lagi', D1); check('void twice -> 409', s == 409 and d['error']['code'] == 'ALREADY_VOID')
check('voided diagnosis kept in table (never physically deleted) + audit', sql(f"select status from visit_diagnosis where id={sec}") == 'VOID' and int(sql(f"select count(*) from audit_log where table_name='visit_diagnosis' and record_id='{sec}'")) == 2)

# ---- procedures (R-16)
s, d, _ = call('GET', '/procedures?per_page=3&sort=id', D1); pr = d['data']
s, d, _ = call('POST', f'/visits/{v1}/procedures', D1, {'items': [{'procedure_id': pr[0]['id'], 'qty': 1}, {'procedure_id': pr[1]['id'], 'qty': 2}]})
check('multi procedures -> 201, tariff snapshot + amount', s == 201 and len(d['data']) == 2 and d['data'][1]['unit_tariff'] == pr[1]['tariff'], (s, d))
vp = [x['id'] for x in d['data']]
check('charge_item per procedure (qty x tariff)', sql(f"select count(*) from charge_item where source_type='PROCEDURE' and source_id in ({vp[0]},{vp[1]}) and status='ACTIVE'") == '2'
      and float(sql(f"select amount from charge_item where source_type='PROCEDURE' and source_id={vp[1]}")) == float(pr[1]['tariff']) * 2)
s, d, _ = call('POST', f'/visits/{v1}/procedures', D1, {'items': [{'procedure_id': pr[2]['id'], 'qty': 1}, {'procedure_id': pr[0]['id'], 'qty': 0}]})
check('invalid item -> 422 and nothing saved (atomic)', s == 422 and d['error']['details'][0]['field'] == 'items[1].qty' and sql(f"select count(*) from visit_procedure where visit_id={v1} and procedure_id={pr[2]['id']}") == '0', (s, d))
s, d, _ = call('POST', f'/visits/{v1}/procedures', D1, {'procedure_id': pr[2]['id']}); vp3 = d['data'][0]['id']; check('single-item body accepted (qty default 1)', s == 201)
s, d, _ = call('POST', f'/visit-procedures/{vp3}/void', D1, {}); check('void procedure without reason -> 422', s == 422)
s, d, _ = call('POST', f'/visit-procedures/{vp3}/void', D2, {'reason': 'salah'}); check('other doctor cannot void (403)', s == 403)
s, d, _ = call('POST', f'/visit-procedures/{vp3}/void', D1, {'reason': 'salah input'}); check('void procedure', s == 200, (s, d))
check('void also voids its charge item', sql(f"select status from charge_item where source_type='PROCEDURE' and source_id={vp3}") == 'VOID')
s, d, _ = call('POST', f'/visit-procedures/{vp3}/void', D1, {'reason': 'lagi'}); check('void twice -> 409', s == 409)

# ---- finish (R-15) and clinical read-back
s, d, _ = call('POST', f'/visits/{v1}/finish', D1); check('finish -> EXAMINED', s == 200 and d['data']['status'] == 'EXAMINED' and d['data']['finished_at'], (s, d))
s, d, _ = call('GET', f'/visits/{v1}', D1); c = d['data']['clinical']
check('clinical block: exam v2, 2 diagnoses (1 void), 3 procedures (1 void)', c['examination']['version'] == 2 and len(c['diagnoses']) == 2 and len(c['procedures']) == 3 and [x['status'] for x in c['procedures']].count('VOID') == 1, c)
s, d, _ = call('PUT', f'/visits/{v1}/examination', D1, {**ex, 'pulse': 70, 'version': 2}); check('EXAMINED visit still editable (version 3)', s == 200 and d['data']['version'] == 3)
check('audit trail for examination: insert + 3 updates... (>=3 rows)', int(sql("select count(*) from audit_log where table_name='examination'")) >= 3)

# ---- history (R-11, R-15)
s, d, _ = call('GET', f'/patients/{pts[0]}/history', P)
h = d['data'][0] if s == 200 and d['data'] else {}
check('history: visit with complaint, active diagnosis and procedures', h.get('chief_complaint') == 'Demam 3 hari' and [x['icd10_code'] for x in h['diagnoses']] == ['J06.9'] and len(h['procedures']) == 2, (s, d))
s, d, _ = call('GET', f'/patients/{pts[0]}/history', D2); check('any doctor can read patient history', s == 200)
s, d, _ = call('GET', f'/patients/{pts[0]}/history', K); check('kasir cannot read history (403)', s == 403)
s, d, _ = call('GET', f'/patients/99999999/history', P); check('history of unknown patient -> 404', s == 404)

# ---- cancel
s, d, _ = call('POST', f'/visits/{v2}/cancel', P, {}); check('cancel without reason -> 422', s == 422)
s, d, _ = call('POST', f'/visits/{v2}/cancel', D1, {'reason': 'x y z'}); check('dokter cannot cancel (403)', s == 403)
s, d, _ = call('POST', f'/visits/{v2}/cancel', P, {'reason': 'pasien pulang'}); check('cancel WAITING -> CANCELLED', s == 200 and d['data']['status'] == 'CANCELLED' and d['data']['cancel_reason'] == 'pasien pulang', (s, d))
check('cancel voids registration charge', sql(f"select status from charge_item where visit_id={v2} and source_type='REGISTRATION'") == 'VOID')
s, d, _ = call('POST', f'/visits/{v2}/cancel', P, {'reason': 'lagi ya'}); check('cancel twice -> 409', s == 409 and d['error']['code'] == 'INVALID_STATE')
s, d, _ = call('POST', f'/visits/{v1}/cancel', P, {'reason': 'terlambat'}); check('cannot cancel an examined visit -> 409', s == 409)
s, d, _ = reg(pts[1]); check('re-register after cancel works (new queue number)', s == 201 and d['data']['queue_no'] > 0, (s, d))
s, d, _ = call('POST', f'/visits/{v3}/call', D1); s2, d2, _ = call('POST', f'/visits/{v3}/cancel', P, {'reason': 'sedang diperiksa'})
check('cannot cancel a visit that is IN_EXAM -> 409', s2 == 409)

print('\nFAILURES:', fails); sys.exit(1 if fails else 0)
