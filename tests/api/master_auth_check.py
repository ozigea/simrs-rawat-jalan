# API checks for auth (R-27) and master data (R-01..R-07). Needs the stack running (docker compose up).
# Run: python3 tests/api/master_auth_check.py   (leaves no data behind except ledger-free temp rows it deletes)
import json, sys, urllib.request, urllib.error
B = 'http://localhost:8080/api/v1'
fails = 0
def call(method, path, token=None, body=None):
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    try:
        r = urllib.request.urlopen(req); return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)
def login(u, p='Simrs#2026'):
    s, d = call('POST', '/auth/login', body={'username': u, 'password': p}); return d['data']['access_token'] if s == 200 else None
def check(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if not cond else ''))
    if not cond: fails += 1
A, P, D = login('admin'), login('pendaftaran'), login('dokter1')

# patients
s, d = call('POST', '/patients', A, {'name': 'Tes Pasien', 'birth_date': '1990-05-05', 'gender': 'M', 'nik': '9999999999990001'})
check('patient create 201 + MRN', s == 201 and d['data']['mrn'].startswith('RM-'), (s, d)); pid = d['data'].get('id')
s, d = call('POST', '/patients', A, {'name': 'Dup', 'birth_date': '1990-05-05', 'gender': 'M', 'nik': '9999999999990001'})
check('TC-03 duplicate NIK 422 with field', s == 422 and d['error']['details'][0]['field'] == 'nik', (s, d))
s, d = call('POST', '/patients', A, {'name': '', 'birth_date': '2999-01-01', 'gender': 'X', 'nik': '12'})
check('validation: many fields 422', s == 422 and {x['field'] for x in d['error']['details']} >= {'name', 'birth_date', 'gender', 'nik'}, d['error'])
s, d = call('POST', '/patients', P, {'name': 'Oleh Pendaftaran', 'birth_date': '1980-01-01', 'gender': 'F', 'nik': ''})
check('pendaftaran can create patient, empty NIK -> null', s == 201 and d['data']['nik'] is None, (s, d)); pid2 = d['data'].get('id')
s, d = call('PUT', f'/patients/{pid}', P, {'phone': '0811'})
check('pendaftaran can update patient', s == 200 and d['data']['phone'] == '0811', (s, d))
s, d = call('DELETE', f'/patients/{pid}', P)
check('pendaftaran cannot delete (403)', s == 403, (s, d))
s, d = call('GET', f'/patients/{pid}', D)
check('dokter can read patient', s == 200)
s, d = call('PUT', f'/patients/{pid}', D, {'phone': 'x'})
check('dokter cannot update patient (403)', s == 403)
s, d = call('GET', '/patients/999999', A)
check('404 envelope', s == 404 and d['error']['code'] == 'NOT_FOUND')
s, d = call('DELETE', f'/patients/{pid}', A); check('admin deletes unused patient', s == 200, (s, d))
call('DELETE', f'/patients/{pid2}', A)

# filter / sort / pagination
s, d = call('GET', '/patients?gender=F&per_page=500&sort=-name,mrn', A)
check('filter+sort, per_page capped 100', s == 200 and d['meta']['per_page'] == 100 and all(r['gender'] == 'F' for r in d['data']), d.get('meta'))
names = [r['name'] for r in d['data']]; check('sorted desc by name', names == sorted(names, reverse=True))
s, d = call('GET', '/patients?is_active=maybe', A); check('invalid filter 422', s == 422)
s, d = call('GET', '/patients?q=%25', A); check('q with % is escaped (no match-all)', s == 200 and d['meta']['total'] == 0, d['meta'])
s, d = call('GET', '/patients?sort=password_hash;drop', A); check('sort whitelist ignores junk', s == 200)

# polyclinic
s, d = call('POST', '/polyclinics', A, {'code': 'POL-X', 'name': 'poli umum', 'registration_fee': 1})
check('polyclinic duplicate name (case-insens) 422', s == 422 and d['error']['details'][0]['field'] == 'name', (s, d))
s, d = call('GET', '/polyclinics?q=umum', A); poli = d['data'][0]['id']
s, d = call('DELETE', f'/polyclinics/{poli}', A)
check('TC-04 delete used poli 409 IN_USE + hint', s == 409 and d['error']['code'] == 'IN_USE' and 'Nonaktifkan' in d['error']['message'], (s, d))
s, d = call('PUT', f'/polyclinics/{poli}', A, {'is_active': True}); check('poli update ok', s == 200)

# schedules
s, d = call('GET', '/staff?staff_type=DOCTOR&q=Andi', A); doc = d['data'][0]['id']
s, d = call('POST', '/schedules', A, {'doctor_id': doc, 'polyclinic_id': poli, 'day_of_week': 1, 'start_time': '10:00', 'end_time': '11:00', 'quota': 5})
check('TC-05 overlapping schedule 409', s == 409 and d['error']['code'] == 'RANGE_CONFLICT', (s, d))
s, d = call('POST', '/schedules', A, {'doctor_id': doc, 'polyclinic_id': poli, 'day_of_week': 1, 'start_time': '12:00', 'end_time': '11:00', 'quota': 5})
check('schedule end<=start 422', s == 422 and d['error']['details'][0]['field'] == 'end_time', (s, d))
s, d = call('GET', '/staff?staff_type=NURSE', A); nurse = d['data'][0]['id']
s, d = call('POST', '/schedules', A, {'doctor_id': nurse, 'polyclinic_id': poli, 'day_of_week': 1, 'start_time': '10:00', 'end_time': '11:00', 'quota': 5})
check('schedule rejects non-doctor 422', s == 422 and d['error']['details'][0]['field'] == 'doctor_id', (s, d))
s, d = call('POST', '/schedules', A, {'doctor_id': doc, 'polyclinic_id': poli, 'day_of_week': 1, 'start_time': '14:00', 'end_time': '15:00', 'quota': 5}); sid = d['data'].get('id')
check('adjacent schedule 201 with names', s == 201 and d['data']['doctor_name'] and d['data']['polyclinic_name'], (s, d))
call('DELETE', f'/schedules/{sid}', A)
s, d = call('GET', '/schedules/available?date=2026-11-16', P)   # Monday
check('R-09 available schedules (Monday) with remaining', s == 200 and len(d['data']) >= 3 and 'remaining' in d['data'][0], (s, d))
s, d = call('GET', '/schedules/available?date=2026-11-15&polyclinic_id=%d' % poli, P)   # Sunday
check('available Sunday only dr. Andi', s == 200 and len(d['data']) == 1, d['data'])
s, d = call('GET', '/schedules/available?date=15-11-2026', P); check('available bad date 422', s == 422)

# medicines & stock card
s, d = call('POST', '/medicines', A, {'code': 'OBT-T%d' % __import__('time').time(), 'name': 'Obat Tes', 'unit': 'tablet', 'price': '1500.50', 'min_stock': 5, 'initial_stock': 40, 'stock_qty': 9999})
check('medicine create: stock_qty not assignable, initial_stock via ledger', s == 201 and d['data']['stock_qty'] == 40 and d['data']['price'] == '1500.50', (s, d)); mid = d['data'].get('id')
s, d = call('PUT', f'/medicines/{mid}', A, {'stock_qty': 1, 'price': '2000'})
check('PUT cannot set stock_qty', s == 200 and d['data']['stock_qty'] == 40, d['data'])
F = login('farmasi')
s, d = call('POST', f'/medicines/{mid}/stock-adjustments', F, {'qty_change': -15, 'reason': 'rusak'}); check('farmasi adjust -15', s == 200 and d['data']['stock_qty'] == 25, (s, d))
s, d = call('POST', f'/medicines/{mid}/stock-adjustments', F, {'qty_change': -100, 'reason': 'x'}); check('adjust below zero 409 STOCK_INSUFFICIENT', s == 409 and d['error']['code'] == 'STOCK_INSUFFICIENT', (s, d))
s, d = call('POST', f'/medicines/{mid}/stock-adjustments', F, {'qty_change': 3}); check('adjust requires reason 422', s == 422, (s, d))
s, d = call('POST', f'/medicines/{mid}/stock-adjustments', D, {'qty_change': 3, 'reason': 'x'}); check('dokter cannot adjust 403', s == 403)
s, d = call('GET', f'/medicines/{mid}/stock-movements', F)
check('stock card: 2 rows newest first, balance chain', s == 200 and [r['balance_after'] for r in d['data']] == [25, 40], d.get('data'))
s, d = call('DELETE', f'/medicines/{mid}', A); check('delete medicine with ledger 409 IN_USE', s == 409 and d['error']['code'] == 'IN_USE', (s, d))

# icd10
s, d = call('POST', '/icd10', A, {'code': 'z99.9', 'description': 'Tes'}); check('icd10 create uppercases', s == 201 and d['data']['code'] == 'Z99.9', (s, d))
s, d = call('POST', '/icd10', A, {'code': 'Z99.9', 'description': 'Dup'}); check('icd10 duplicate 422', s == 422, (s, d))
s, d = call('PUT', '/icd10/Z99.9', A, {'description': 'Ubah', 'code': 'Z88.8'}); check('icd10 code immutable 422', s == 422, (s, d))
s, d = call('GET', '/icd10/A01.0', D); check('icd10 get by code with dot', s == 200 and d['data']['code'] == 'A01.0', (s, d))
s, d = call('DELETE', '/icd10/Z99.9', A); check('icd10 delete', s == 200)

# users
s, d = call('POST', '/users', A, {'username': 'Tes.User', 'full_name': 'Tes', 'password': 'abc', 'role': 'kasir'})
check('user create: short password 422', s == 422 and d['error']['details'][0]['field'] == 'password', (s, d))
s, d = call('POST', '/users', A, {'username': 'tes.user', 'full_name': 'Tes User', 'password': 'Rahasia123', 'role': 'kasir'})
check('user create 201, role set, no hash leaked', s == 201 and d['data']['role'] == 'kasir' and 'password_hash' not in d['data'], (s, d)); uid = d['data'].get('id')
check('new user can login', login('tes.user', 'Rahasia123') is not None)
s, d = call('PUT', f'/users/{uid}', A, {'is_active': False})
check('deactivated user cannot login (TC-01)', login('tes.user', 'Rahasia123') is None)
tok = login('kasir'); s, d = call('GET', '/auth/me', tok); me = d['data']['id']
s, d = call('PUT', f'/users/{me}', A, {'is_active': True}); check('admin updates other user', s == 200)
s, d = call('GET', '/users?per_page=100', A); admin_id = [u for u in d['data'] if u['username'] == 'admin'][0]['id']
check('users list has roles', all(u['role'] for u in d['data'] if u['username'] != 'tes.user'), d['data'][:2])
s, d = call('DELETE', f'/users/{admin_id}', A); check('cannot delete self', s == 409 and d['error']['code'] == 'SELF_DELETE')
s, d = call('PUT', f'/users/{admin_id}', A, {'is_active': False}); check('cannot deactivate self', s == 422)
s, d = call('DELETE', f'/users/{uid}', A); check('delete test user', s == 200, (s, d))
s, d = call('POST', '/users', A, {'username': 'xtest1', 'full_name': 'X', 'password': 'Rahasia123', 'role': 'kasir', 'staff_id': 1})
check('staff already has account 422', s == 422 and d['error']['details'][0]['field'] == 'staff_id', (s, d))

# token integrity
s, d = call('GET', '/auth/me', A[:-3] + 'abc'); check('tampered token 401', s == 401, s)
print('\nFAILURES:', fails); sys.exit(1 if fails else 0)
