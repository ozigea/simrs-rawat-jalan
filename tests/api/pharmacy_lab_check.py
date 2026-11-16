# API checks for prescriptions, dispensing, medication history and laboratory (R-17..R-20).
# Needs the stack running; reset first for a clean day (database/tests/reset-transactions.sql).
import json, subprocess, sys, urllib.request, urllib.error, uuid, datetime, time
B = 'http://localhost:8080/api/v1'
fails = 0

def call(method, path, token=None, body=None, headers=None):
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        r = urllib.request.urlopen(req); return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)

def login(u): return call('POST', '/auth/login', body={'username': u, 'password': 'Simrs#2026'})[1]['data']['access_token']
def sql(q):
    return subprocess.run(['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'simrs_core', '-d', 'simrs', '-Atc', q], capture_output=True, text=True).stdout.strip()
def check(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' ' + str(extra)[:400]))
    if not cond: fails += 1

NODE = 'http://localhost:3001/api/v1'
def mock_lis(enabled, admin_token):
    # The integration worker + mock LIS would deliver results by themselves within seconds and race with the
    # assertions about results below; switch the simulated external lab off for this run.
    req = urllib.request.Request(NODE + '/mock-lis/state', method='PUT', data=json.dumps({'enabled': enabled}).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + admin_token})
    try: urllib.request.urlopen(req).read()
    except Exception as e: print('note: could not toggle mock LIS (' + str(e) + ')')

A, P, D1, D2, K, F, L = (login(u) for u in ['admin', 'pendaftaran', 'dokter1', 'dokter2', 'kasir', 'farmasi', 'lab'])
mock_lis(False, A)
today = datetime.date.today().isoformat()
doc1 = call('GET', '/auth/me', D1)[1]['data']['staff_id']
sch = [x for x in call('GET', f'/schedules/available?date={today}', P)[1]['data'] if x['doctor_id'] == doc1][0]

def new_visit(call_it=True):
    pid = call('POST', '/patients', A, {'name': 'RX Pasien', 'birth_date': '1975-05-05', 'gender': 'F', 'nik': '99995%011d' % (uuid.uuid4().int % 10**11)})[1]['data']['id']
    v = call('POST', '/visits', P, {'patient_id': pid, 'schedule_id': sch['id'], 'visit_date': today}, {'Idempotency-Key': str(uuid.uuid4())})[1]['data']['id']
    if call_it: call('POST', f'/visits/{v}/call', D1)
    return pid, v

def new_med(stock, price='1000'):
    code = 'OBT-T%d' % (time.time() * 1000 % 10**9)
    time.sleep(0.01)
    return call('POST', '/medicines', A, {'code': code, 'name': 'Obat Uji ' + code, 'unit': 'tablet', 'price': price, 'initial_stock': stock})[1]['data']

pid, v1 = new_visit()
pid_w, v_wait = new_visit(call_it=False)
mA, mB = new_med(5, '1500'), new_med(100, '2500')
item = lambda m, q=2, **kw: {'medicine_id': m['id'], 'dose': '500 mg', 'frequency': '3x1', 'qty': q, **kw}

# ---- prescribing (R-17)
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': []}); check('empty items -> 422', s == 422 and d['error']['details'][0]['field'] == 'items', (s, d))
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': [{'medicine_id': mA['id'], 'frequency': '3x1', 'qty': 1}]}); check('missing dose -> 422 items[0].dose', s == 422 and d['error']['details'][0]['field'] == 'items[0].dose', (s, d))
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': [item(mA, 0)]}); check('qty 0 -> 422', s == 422 and d['error']['details'][0]['field'] == 'items[0].qty', (s, d))
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': [item(mA), item(mA)]}); check('same medicine twice -> 422', s == 422 and d['error']['details'][0]['field'] == 'items[1].medicine_id', (s, d))
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': [{**item(mA), 'medicine_id': 999999}]}); check('unknown medicine -> 422', s == 422, (s, d))
check('invalid requests left nothing behind', sql(f"select count(*) from prescription where visit_id={v1}") == '0')
s, d = call('POST', f'/visits/{v_wait}/prescriptions', D1, {'items': [item(mA)]}); check('prescription on WAITING visit -> 409', s == 409 and d['error']['code'] == 'INVALID_STATE', (s, d))
s, d = call('POST', f'/visits/{v1}/prescriptions', D2, {'items': [item(mA)]}); check('other doctor cannot prescribe (403)', s == 403)
s, d = call('POST', f'/visits/{v1}/prescriptions', P, {'items': [item(mA)]}); check('pendaftaran cannot prescribe (403)', s == 403)
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': [item(mA, 8), item(mB, 3, instruction='sesudah makan')], 'notes': 'tes'})
rx1 = d['data'].get('id')
check('prescribe 201; qty above stock only WARNS (informative)', s == 201 and d['data']['status'] == 'NEW' and len(d['data']['items']) == 2 and d['data']['warnings'][0]['field'] == 'items[0].qty' and d['data']['items'][0]['unit_price'] == '1500.00', (s, d))
check('prescribing does not touch stock or billing', sql(f"select stock_qty from medicine where id={mA['id']}") == '5' and sql(f"select count(*) from charge_item where visit_id={v1} and source_type='MEDICINE'") == '0')

# ---- visibility
s, d = call('GET', '/prescriptions?status=NEW', F); check('farmasi worklist lists NEW', s == 200 and any(x['id'] == rx1 for x in d['data']) and d['data'][0]['item_count'] >= 1, (s, d))
s, d = call('GET', '/prescriptions', D1); check('dokter has no worklist (403)', s == 403)
s, d = call('GET', f'/prescriptions/{rx1}', F); check('farmasi reads detail with current stock', s == 200 and d['data']['items'][0]['stock_qty'] == 5, (s, d))
s, d = call('GET', f'/prescriptions/{rx1}', D1); check('prescribing doctor reads own prescription', s == 200)
s, d = call('GET', f'/prescriptions/{rx1}', D2); check('other doctor cannot (403)', s == 403)
s, d = call('GET', f'/prescriptions/{rx1}', K); check('kasir cannot (403)', s == 403)

# ---- dispensing (R-18, D-2)
s, d = call('POST', f'/prescriptions/{rx1}/dispense', D1); check('dokter cannot dispense (403)', s == 403)
s, d = call('POST', f'/prescriptions/{rx1}/dispense', F)
check('insufficient stock -> 409 with items[0].qty detail', s == 409 and d['error']['code'] == 'STOCK_INSUFFICIENT' and d['error']['details'][0]['field'] == 'items[0].qty' and 'Sisa stok 5' in d['error']['details'][0]['message'], (s, d))
check('all-or-nothing: still NEW, stock untouched (also item B), no ledger OUT, no charge', sql(f"select status from prescription where id={rx1}") == 'NEW'
      and sql(f"select stock_qty from medicine where id={mB['id']}") == '100' and sql(f"select count(*) from stock_movement where ref_type='PRESCRIPTION' and ref_id={rx1}") == '0'
      and sql(f"select count(*) from charge_item where visit_id={v1} and source_type='MEDICINE'") == '0')
s, d = call('POST', f'/medicines/{mA["id"]}/stock-adjustments', F, {'qty_change': 10, 'reason': 'restock'}); check('restock via stock card', s == 200 and d['data']['stock_qty'] == 15)
s, d = call('POST', f'/prescriptions/{rx1}/dispense', F)
check('dispense -> DISPENSED with who/when', s == 200 and d['data']['status'] == 'DISPENSED' and d['data']['dispensed_by_name'] and d['data']['dispensed_at'], (s, d))
check('stock reduced (15-8=7, 100-3=97)', sql(f"select stock_qty from medicine where id={mA['id']}") == '7' and sql(f"select stock_qty from medicine where id={mB['id']}") == '97')
check('ledger OUT rows reference the prescription', sql(f"select count(*) from stock_movement where ref_type='PRESCRIPTION' and ref_id={rx1} and movement_type='OUT'") == '2'
      and sql(f"select balance_after from stock_movement where ref_type='PRESCRIPTION' and ref_id={rx1} and medicine_id={mA['id']}") == '7')
check('MEDICINE charge items = qty x price (12000 + 7500)', sql(f"select sum(amount) from charge_item where visit_id={v1} and source_type='MEDICINE' and status='ACTIVE'") == '19500.00')
s, d = call('POST', f'/prescriptions/{rx1}/dispense', F); check('dispense twice -> 409 INVALID_STATE', s == 409 and d['error']['code'] == 'INVALID_STATE')
s, d = call('POST', f'/prescriptions/{rx1}/cancel', F, {'reason': 'salah'}); check('cannot cancel a DISPENSED prescription (409)', s == 409)

# cancel
s, d = call('POST', f'/visits/{v1}/prescriptions', D1, {'items': [item(mB, 1)]}); rx2 = d['data']['id']
s, d = call('POST', f'/prescriptions/{rx2}/cancel', D1, {}); check('cancel needs a reason (422)', s == 422)
s, d = call('POST', f'/prescriptions/{rx2}/cancel', D2, {'reason': 'bukan pasien saya'}); check('other doctor cannot cancel (403)', s == 403)
s, d = call('POST', f'/prescriptions/{rx2}/cancel', D1, {'reason': 'salah obat'}); check('doctor cancels own NEW prescription', s == 200 and d['data']['status'] == 'CANCELLED', (s, d))
s, d = call('POST', f'/prescriptions/{rx2}/dispense', F); check('cancelled prescription cannot be dispensed (409)', s == 409)

# ---- medication history (R-19)
s, d = call('GET', f'/patients/{pid}/medications', F); check('farmasi reads medication history', s == 200 and len(d['data']) == 2 and d['data'][0]['prescription_no'], (s, d))
s, d = call('GET', f'/patients/{pid}/medications', D2); check('any doctor reads medication history', s == 200)
s, d = call('GET', f'/patients/{pid}/medications', K); check('kasir cannot (403)', s == 403)
s, d = call('GET', f'/patients/{pid}/history', P); check('visit history lists dispensed medicines', s == 200 and len(d['data'][0]['medicines']) == 2, (s, d))

# ---- laboratory (R-20)
tests = call('GET', '/lab-tests?per_page=3&sort=id', A)[1]['data']
s, d = call('POST', f'/visits/{v1}/lab-orders', D1, {'items': []}); check('lab: empty items -> 422', s == 422)
s, d = call('POST', f'/visits/{v1}/lab-orders', D1, {'items': [{'lab_test_id': tests[0]['id']}, {'lab_test_id': tests[0]['id']}]}); check('lab: duplicate test -> 422', s == 422 and d['error']['details'][0]['field'] == 'items[1].lab_test_id', (s, d))
s, d = call('POST', f'/visits/{v1}/lab-orders', D1, {'items': [{'lab_test_id': 999999}]}); check('lab: unknown test -> 422', s == 422)
s, d = call('POST', f'/visits/{v_wait}/lab-orders', D1, {'items': [{'lab_test_id': tests[0]['id']}]}); check('lab on WAITING visit -> 409', s == 409)
s, d = call('POST', f'/visits/{v1}/lab-orders', D2, {'items': [{'lab_test_id': tests[0]['id']}]}); check('lab: other doctor 403', s == 403)
check('lab: failed requests left nothing', sql(f"select count(*) from lab_order where visit_id={v1}") == '0')
s, d = call('POST', f'/visits/{v1}/lab-orders', D1, {'items': [{'lab_test_id': tests[0]['id']}, {'lab_test_id': tests[1]['id']}], 'notes': 'cito'})
lo = d['data'].get('id'); items = d['data'].get('items', [])
check('lab order created: ORDERED, 2 items with tariff snapshot', s == 201 and d['data']['status'] == 'ORDERED' and len(items) == 2 and items[0]['tariff'] == tests[0]['tariff'], (s, d))
check('LAB charge items created at request time', sql(f"select count(*) from charge_item where visit_id={v1} and source_type='LAB' and status='ACTIVE'") == '2')
# The Node worker may already have delivered it by the time we look (PENDING -> SENT), so accept both.
check('outbox event written in the same transaction (payload has patient + tests)',
      sql(f"select (status in ('PENDING','SENT'))::text || '|' || (payload->>'order_no') || '|' || jsonb_array_length(payload->'tests') || '|' || (payload->'patient'->>'mrn' is not null)::text from integration_outbox where aggregate_type='lab_order' and aggregate_id={lo}") == f"true|{d['data']['order_no']}|2|true", sql(f"select * from integration_outbox where aggregate_id={lo}"))
order_no = d['data']['order_no']

s, d = call('GET', '/lab-orders?status=ORDERED,IN_PROGRESS', L); check('lab worklist (oldest first)', s == 200 and any(x['id'] == lo and x['item_count'] == 2 and x['resulted_count'] == 0 for x in d['data']), (s, d))
s, d = call('GET', '/lab-orders', D1); check('dokter has no lab worklist (403)', s == 403)
s, d = call('PUT', f'/lab-orders/{lo}/results', D1, {'results': [{'item_id': items[0]['id'], 'value': '13'}]}); check('doctor cannot enter results (403)', s == 403)
s, d = call('PUT', f'/lab-orders/{lo}/results', L, {'results': [{'item_id': items[0]['id'], 'value': '', 'flag': 'NORMAL'}]}); check('empty result value -> 422', s == 422)
s, d = call('PUT', f'/lab-orders/{lo}/results', L, {'results': [{'item_id': items[0]['id'], 'value': '13.5', 'flag': 'BAGUS'}]}); check('bad flag -> 422', s == 422 and d['error']['details'][0]['field'] == 'results[0].flag')
s, d = call('PUT', f'/lab-orders/{lo}/results', L, {'results': [{'item_id': items[0]['id'], 'value': '13.5', 'flag': 'normal'}]}); check('partial result -> IN_PROGRESS', s == 200 and d['data']['status'] == 'IN_PROGRESS' and d['data']['items'][0]['result_source'] == 'MANUAL', (s, d))
s, d = call('PUT', f'/lab-orders/{lo}/results', L, {'results': [{'item_id': items[1]['id'], 'value': '7500', 'flag': 'HIGH', 'note': 'ulang?'}]}); check('all items resulted -> RESULTED', s == 200 and d['data']['status'] == 'RESULTED', (s, d))
audit_before = sql("select count(*) from audit_log where table_name='lab_order_item'")
s, d = call('PUT', f'/lab-orders/{lo}/results', L, {'results': [{'item_id': items[0]['id'], 'value': '13.5', 'flag': 'NORMAL'}]}); check('re-sending identical result is a no-op (idempotent)', s == 200 and sql("select count(*) from audit_log where table_name='lab_order_item'") == audit_before)
s, d = call('GET', f'/visits/{v1}', D1); lab = d['data']['clinical']['lab_orders'][0]
check('doctor sees results in the visit clinical block', lab['status'] == 'RESULTED' and lab['items'][1]['result_value'] == '7500' and lab['items'][1]['result_flag'] == 'HIGH')
s, d = call('GET', f'/lab-orders/{lo}', D1); check('doctor reads own lab order', s == 200 and d['data']['items'][0]['result_value'] == '13.5')
s, d = call('GET', f'/lab-orders/{lo}', D2); check('other doctor cannot read it (403)', s == 403)
s, d = call('GET', f'/patients/{pid}/history', D1); check('history includes lab results', len(d['data'][0]['lab_results']) == 2)

# ---- internal endpoint (Node -> Yii)
s, d = call('POST', '/visits/%d/lab-orders' % v1, D1, {'items': [{'lab_test_id': tests[2]['id']}]}); lo2 = d['data']['id']; on2 = d['data']['order_no']; code = d['data']['items'][0]['test_code']
payload = {'external_id': 'RES-' + on2, 'order_no': on2, 'results': [{'test_code': code, 'value': '98', 'flag': 'NORMAL'}]}
s, d = call('POST', '/internal/lab-results', None, payload); check('internal: no token -> 401', s == 401)
s, d = call('POST', '/internal/lab-results', None, payload, {'X-Service-Token': 'wrong'}); check('internal: wrong token -> 401', s == 401)
s, d = call('POST', '/internal/lab-results', A, payload); check('internal: a user JWT is NOT accepted -> 401', s == 401)
tok = {'X-Service-Token': 'change-me-service-token'}
s, d = call('POST', '/internal/lab-results', None, {**payload, 'order_no': 'LAB-NOPE'}, tok); check('internal: unknown order -> 404', s == 404)
s, d = call('POST', '/internal/lab-results', None, {**payload, 'results': [{'test_code': 'LAB-XXX', 'value': '1'}]}, tok); check('internal: unknown test code -> 422', s == 422)
s, d = call('POST', '/internal/lab-results', None, payload, tok); check('internal: result stored, order RESULTED, source LIS', s == 200 and d['data']['status'] == 'RESULTED' and sql(f"select result_source from lab_order_item where lab_order_id={lo2}") == 'LIS', (s, d))
a1 = sql("select count(*) from audit_log where table_name='lab_order_item'")
s, d = call('POST', '/internal/lab-results', None, payload, tok); check('internal: same message again -> 200, nothing changes (idempotent)', s == 200 and sql("select count(*) from audit_log where table_name='lab_order_item'") == a1)

mock_lis(True, A)
print('\nFAILURES:', fails); sys.exit(1 if fails else 0)
