# API checks for billing (R-22..R-25) and scenarios D-3 / D-4. Needs the stack running; reset first:
#   docker compose exec -T db psql -U simrs_core -d simrs -v ON_ERROR_STOP=1 < database/tests/reset-transactions.sql
import json, subprocess, sys, urllib.request, urllib.error, uuid, datetime, tempfile, os
B = 'http://localhost:8080/api/v1'
fails = 0

def call(method, path, token=None, body=None, headers=None, raw=False):
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header('Content-Type', 'application/json')
    if token: req.add_header('Authorization', 'Bearer ' + token)
    for k, v in (headers or {}).items(): req.add_header(k, v)
    try:
        r = urllib.request.urlopen(req); data = r.read(); return r.status, (data if raw else json.loads(data)), r.headers
    except urllib.error.HTTPError as e:
        data = e.read(); return e.code, (data if raw else json.loads(data)), e.headers

def login(u): return call('POST', '/auth/login', body={'username': u, 'password': 'Simrs#2026'})[1]['data']['access_token']
def sql(q): return subprocess.run(['docker', 'compose', 'exec', '-T', 'db', 'psql', '-U', 'simrs_core', '-d', 'simrs', '-Atc', q], capture_output=True, text=True).stdout.strip()
def check(name, cond, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' ' + str(extra)[:500]))
    if not cond: fails += 1

NODE = 'http://localhost:3001/api/v1'
def mock_lis(enabled, admin_token):
    # With the integration worker running, the (mock) external lab would return results within seconds;
    # switch it off so "lab result still pending" is deterministic for the DONE rule below.
    req = urllib.request.Request(NODE + '/mock-lis/state', method='PUT', data=json.dumps({'enabled': enabled}).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + admin_token})
    try: urllib.request.urlopen(req).read()
    except Exception as e: print('note: could not toggle mock LIS (' + str(e) + ')')

A, P, D1, D2, K, F, L = (login(u) for u in ['admin', 'pendaftaran', 'dokter1', 'dokter2', 'kasir', 'farmasi', 'lab'])
mock_lis(False, A)
today = datetime.date.today().isoformat()
doc1 = call('GET', '/auth/me', D1)[1]['data']['staff_id']
sch = [x for x in call('GET', f'/schedules/available?date={today}', P)[1]['data'] if x['doctor_id'] == doc1][0]
procs = {p['code']: p for p in call('GET', '/procedures?per_page=100', A)[1]['data']}
tests = call('GET', '/lab-tests?per_page=3&sort=id', A)[1]['data']
def key(): return {'Idempotency-Key': str(uuid.uuid4())}

def visit_in_exam():
    pid = call('POST', '/patients', A, {'name': 'BILL Pasien', 'birth_date': '1980-03-03', 'gender': 'M', 'nik': '99994%011d' % (uuid.uuid4().int % 10**11)})[1]['data']['id']
    v = call('POST', '/visits', P, {'patient_id': pid, 'schedule_id': sch['id'], 'visit_date': today}, key())[1]['data']['id']
    call('POST', f'/visits/{v}/call', D1)
    return pid, v

def finish(v, codes):
    call('PUT', f'/visits/{v}/examination', D1, {'chief_complaint': 'tes'})
    call('POST', f'/visits/{v}/diagnoses', D1, {'icd10_code': 'J06.9', 'type': 'PRIMARY'})
    ids = []
    if codes:
        s, d, _ = call('POST', f'/visits/{v}/procedures', D1, {'items': [{'procedure_id': procs[c]['id'], 'qty': 1} for c in codes]})
        ids = [x['id'] for x in d['data']]
    s, d, _ = call('POST', f'/visits/{v}/finish', D1)
    assert s == 200, d
    return ids

def pay(inv, amount, method='CASH', cash=None, ref=None, token=None, hdr=None):
    body = {'method': method, 'amount': str(amount)}
    if method == 'CASH': body['cash_received'] = str(cash if cash is not None else amount)
    else: body['reference_no'] = ref or 'SIM-1'
    return call('POST', f'/invoices/{inv}/payments', token or K, body, hdr or key())

def invoice(inv): return call('GET', f'/invoices/{inv}', K)[1]['data']
def visit_status(v): return call('GET', f'/visits/{v}', A)[1]['data']['status']

# ================= Flow A: combined invoice, partial payments, DONE rule
pidA, vA = visit_in_exam()
s, d, _ = call('POST', f'/visits/{vA}/invoice', K); check('invoice before the exam is finished -> 409 VISIT_NOT_FINISHED', s == 409 and d['error']['code'] == 'VISIT_NOT_FINISHED', (s, d))
pa = finish(vA, ['TND-001', 'TND-002'])                     # 25.000 + 35.000, registration 20.000
s, d, _ = call('POST', f'/visits/{vA}/invoice', P); check('pendaftaran cannot create invoice (403)', s == 403)
s, d, _ = call('POST', f'/visits/{vA}/invoice', D1); check('dokter cannot create invoice (403)', s == 403)
s, d, _ = call('POST', f'/visits/{vA}/invoice', A); check('admin is read-only for billing (403)', s == 403)
s, d, _ = call('POST', f'/visits/{vA}/invoice', K); invA = d['data']['id']
check('kasir creates invoice: UNPAID, total = registration + procedures (80.000)', s == 201 and d['data']['status'] == 'UNPAID' and d['data']['total_amount'] == '80000.00' and d['data']['remaining'] == '80000.00' and d['data']['invoice_no'].startswith('INV'), (s, d))
s, d, _ = call('POST', f'/visits/{vA}/invoice', K); check('creating again returns the same invoice (200)', s == 200 and d['data']['id'] == invA)
for who, tok in [('dokter', D1), ('pendaftaran', P), ('farmasi', F), ('lab', L)]:
    check(f'{who} cannot read invoices (403)', call('GET', '/invoices', tok)[0] == 403)

# lab + medicine added AFTER the invoice exists -> total follows automatically
lo = call('POST', f'/visits/{vA}/lab-orders', D1, {'items': [{'lab_test_id': tests[0]['id']}]})[1]['data']
med = call('POST', '/medicines', A, {'code': 'OBT-TB%d' % (uuid.uuid4().int % 10**8), 'name': 'Obat Billing', 'unit': 'tablet', 'price': '2000', 'initial_stock': 50})[1]['data']
rx = call('POST', f'/visits/{vA}/prescriptions', D1, {'items': [{'medicine_id': med['id'], 'dose': '1', 'frequency': '3x1', 'qty': 5}]})[1]['data']
inv = invoice(invA)
check('lab charged at request: total 80.000 + tariff', float(inv['total_amount']) == 80000 + float(tests[0]['tariff']), inv['total_amount'])
check('prescription alone does not change the bill (billed on dispense)', float(inv['total_amount']) == 80000 + float(tests[0]['tariff']))
call('POST', f'/prescriptions/{rx["id"]}/dispense', F)
inv = invoice(invA)
expected = 80000 + float(tests[0]['tariff']) + 10000
check('TC-14 invoice has all 4 components, total = sum', float(inv['total_amount']) == expected and {l['source_type'] for l in inv['lines']} == {'REGISTRATION', 'PROCEDURE', 'LAB', 'MEDICINE'} and inv['version'] > 1, inv)
check('invoice total always equals the sum of ACTIVE charge items (DB cross-check)', float(sql(f"select sum(amount) from charge_item where invoice_id={invA} and status='ACTIVE'")) == expected)
total = expected

# ---- payment validation
h = key()
s, d, _ = call('POST', f'/invoices/{invA}/payments', K, {'method': 'CASH', 'amount': '1000', 'cash_received': '1000'}); check('missing Idempotency-Key -> 422', s == 422 and d['error']['details'][0]['field'] == 'Idempotency-Key', (s, d))
s, d, _ = pay(invA, 0); check('amount 0 -> 422', s == 422)
s, d, _ = pay(invA, '-5'); check('negative amount -> 422', s == 422)
s, d, _ = pay(invA, '10.123'); check('3 decimals -> 422', s == 422)
s, d, _ = call('POST', f'/invoices/{invA}/payments', K, {'method': 'BITCOIN', 'amount': '1000'}, key()); check('unknown method -> 422', s == 422 and d['error']['details'][0]['field'] == 'method')
s, d, _ = call('POST', f'/invoices/{invA}/payments', K, {'method': 'QRIS', 'amount': '1000'}, key()); check('non-cash without reference -> 422', s == 422 and d['error']['details'][0]['field'] == 'reference_no')
s, d, _ = pay(invA, 50000, cash=40000); check('cash received below amount -> 422', s == 422 and d['error']['details'][0]['field'] == 'cash_received')
for who, tok in [('dokter', D1), ('admin', A), ('farmasi', F)]:
    check(f'{who} cannot pay (403)', pay(invA, 1000, token=tok)[0] == 403)
check('nothing was recorded by the rejected attempts', sql(f"select count(*) from payment where invoice_id={invA}") == '0')

# ---- TC-15 partial payments, cash with change, then non-cash
s, d, hd = pay(invA, 50000, cash=100000, hdr=h)
check('cash 50.000 (given 100.000): change 50.000, invoice PARTIAL', s == 201 and d['data']['change_amount'] == '50000.00' and d['data']['invoice_status'] == 'PARTIAL' and float(d['data']['remaining']) == total - 50000 and d['data']['payment_no'].startswith('PAY'), (s, d))
payA1 = d['data']['id']
s, d, hd = pay(invA, 50000, cash=100000, hdr=h); check('D-3 same key + same request -> 200 replay, header, same payment', s == 200 and d['data']['id'] == payA1 and hd.get('Idempotent-Replayed') == 'true', (s, d))
s, d, _ = pay(invA, 60000, cash=100000, hdr=h); check('D-3 same key + different amount -> 409 IDEMPOTENCY_KEY_REUSED', s == 409 and d['error']['code'] == 'IDEMPOTENCY_KEY_REUSED', (s, d))
check('retries created exactly one payment and one deduction', sql(f"select count(*) from payment where invoice_id={invA}") == '1' and float(invoice(invA)['paid_amount']) == 50000)
s, d, _ = pay(invA, total - 50000 + 1); check('TC-16 amount above the remaining balance -> 422 OVERPAYMENT', s == 422 and d['error']['code'] == 'OVERPAYMENT' and d['error']['details'][0]['field'] == 'amount', (s, d))
s, d, _ = pay(invA, 30000, method='QRIS', ref='SIM-QR-1'); check('non-cash (QRIS) partial payment accepted', s == 201 and d['data']['reference_no'] == 'SIM-QR-1' and d['data']['cash_received'] is None and d['data']['change_amount'] == '0.00', (s, d))
check('status PARTIAL until fully paid', invoice(invA)['status'] == 'PARTIAL' and visit_status(vA) == 'EXAMINED')
rest = total - 80000
s, d, _ = pay(invA, rest, method='TRANSFER', ref='SIM-TRF-9'); payA3 = d['data']['id']
check('final payment -> PAID, remaining 0', s == 201 and d['data']['invoice_status'] == 'PAID' and float(d['data']['remaining']) == 0, (s, d))
check('PAID but lab pending: visit is still EXAMINED (not DONE yet)', visit_status(vA) == 'EXAMINED')
s, d, _ = pay(invA, 1); check('paying a PAID invoice -> 409 INVOICE_ALREADY_PAID (also with a new key)', s == 409 and d['error']['code'] == 'INVOICE_ALREADY_PAID', (s, d))
call('PUT', f'/lab-orders/{lo["id"]}/results', L, {'results': [{'item_id': lo['items'][0]['id'], 'value': '13', 'flag': 'NORMAL'}]})
check('lab resulted + prescription dispensed + invoice PAID -> visit DONE', visit_status(vA) == 'DONE')

# ---- PDF (R-25)
s, body, hd = call('GET', f'/invoices/{invA}/pdf', K, raw=True)
check('invoice PDF: 200, application/pdf, %PDF header', s == 200 and 'application/pdf' in hd.get('Content-Type', '') and body[:4] == b'%PDF', (s, body[:80]))
f1 = os.path.join(tempfile.gettempdir(), 'inv-test.pdf'); open(f1, 'wb').write(body)
txt = subprocess.run(['pdftotext', '-layout', f1, '-'], capture_output=True, text=True).stdout
inv = invoice(invA)
check('invoice PDF shows number, patient, 4 line types, total, LUNAS, payments', inv['invoice_no'] in txt and 'BILL Pasien' in txt and all(w in txt for w in ['Pendaftaran', 'Tindakan', 'Laboratorium', 'Obat', 'LUNAS', 'Riwayat pembayaran']) and f"{int(total):,}".replace(',', '.') in txt, txt[:600])
s, body, hd = call('GET', f'/payments/{payA1}/receipt', K, raw=True)
f2 = os.path.join(tempfile.gettempdir(), 'rcpt-test.pdf'); open(f2, 'wb').write(body)
txt2 = subprocess.run(['pdftotext', '-layout', f2, '-'], capture_output=True, text=True).stdout
check('receipt PDF: payment no, cash received, change, remaining', s == 200 and body[:4] == b'%PDF' and 'BUKTI PEMBAYARAN' in txt2 and 'Kembalian' in txt2 and '50.000' in txt2 and '100.000' in txt2, txt2[:500])
check('PDF requires auth + permission', call('GET', f'/invoices/{invA}/pdf', None, raw=True)[0] == 401 and call('GET', f'/invoices/{invA}/pdf', D1, raw=True)[0] == 403)

# ---- payment history (R-25)
s, d, _ = call('GET', f'/payments?patient_id={pidA}', K); check('payment history by patient lists 3 payments newest first', s == 200 and len(d['data']) == 3 and d['data'][0]['id'] == payA3, (s, d))
s, d, _ = call('GET', f'/payments?patient_id={pidA}&method=qris', K); check('history filter by method', s == 200 and len(d['data']) == 1 and d['data'][0]['method'] == 'QRIS')
s, d, _ = call('GET', f'/payments?from={today}&to={today}&q=BILL', A); check('history filter by period + search (admin read)', s == 200 and d['meta']['total'] >= 3)
s, d, _ = call('GET', '/payments?from=xx', K); check('bad date -> 422', s == 422)
s, d, _ = call('GET', f'/invoices?status=PAID&q={inv["invoice_no"]}', K); check('invoice list filter by status + number', s == 200 and len(d['data']) == 1 and d['data'][0]['remaining'] == '0.00', (s, d))

# ================= Flow B: D-4 - changes around billing
pidB, vB = visit_in_exam()
pb = finish(vB, ['TND-001', 'TND-003'])                     # 25.000 + 75.000 + registration 20.000 = 120.000
s, d, _ = call('POST', f'/visits/{vB}/invoice', K); invB = d['data']['id']; check('invoice B total 120.000', d['data']['total_amount'] == '120000.00')
s, d, _ = pay(invB, 100000); check('pay 100.000 -> PARTIAL', d['data']['invoice_status'] == 'PARTIAL')
s, d, _ = call('POST', f'/visit-procedures/{pb[1]}/void', D1, {'reason': 'salah input tindakan'})
inv = invoice(invB)
check('TC-18 void a procedure after a partial payment: total 45.000 < paid -> OVERPAID, version bumped', s == 200 and inv['total_amount'] == '45000.00' and inv['status'] == 'OVERPAID' and float(inv['remaining']) == -55000, inv)
check('voided line stays visible on the invoice with its reason', any(l['status'] == 'VOID' and l['void_reason'] == 'salah input tindakan' for l in inv['lines']))
check('audit trail: invoice change with reason, procedure void, charge_item void',
      int(sql(f"select count(*) from audit_log where table_name='invoice' and record_id='{invB}' and reason like 'Tindakan dibatalkan: salah input tindakan%'")) == 1
      and int(sql(f"select count(*) from audit_log where table_name='visit_procedure' and record_id='{pb[1]}' and action='VOID'")) == 1
      and int(sql(f"select count(*) from audit_log where table_name='charge_item' and action='VOID' and reason='salah input tindakan'")) >= 1)
s, d, _ = pay(invB, 1); check('OVERPAID invoice accepts no further payment (409)', s == 409 and d['error']['code'] == 'INVOICE_ALREADY_PAID')
s, d, _ = call('POST', f'/visits/{vB}/procedures', D1, {'procedure_id': procs['TND-003']['id']})
inv = invoice(invB)
check('doctor adds a procedure back after OVERPAID: total 120.000 > paid 100.000 -> PARTIAL again', s == 201 and inv['status'] == 'PARTIAL' and inv['total_amount'] == '120000.00' and float(inv['remaining']) == 20000, inv)
s, d, _ = pay(invB, 20000); check('settle the rest -> PAID', d['data']['invoice_status'] == 'PAID')
vp_b = [x for x in call('GET', f'/visits/{vB}', D1)[1]['data']['clinical']['procedures'] if x['status'] == 'ACTIVE' and x['procedure_code'] == 'TND-003'][0]['id']

# ---- O-6: PAID invoice locks medical changes (except diagnosis)
s, d, _ = call('POST', f'/visits/{vB}/procedures', D1, {'procedure_id': procs['TND-002']['id']}); check('PAID: doctor cannot add a procedure (403 INVOICE_ALREADY_PAID)', s == 403 and d['error']['code'] == 'INVOICE_ALREADY_PAID', (s, d))
s, d, _ = call('POST', f'/visit-procedures/{vp_b}/void', D1, {'reason': 'koreksi'}); check('PAID: doctor cannot void a procedure (403)', s == 403 and d['error']['code'] == 'INVOICE_ALREADY_PAID')
s, d, _ = call('PUT', f'/visits/{vB}/examination', D1, {'chief_complaint': 'ubah', 'version': 1}); check('PAID: examination is locked (403)', s == 403 and d['error']['code'] == 'INVOICE_ALREADY_PAID')
s, d, _ = call('POST', f'/visits/{vB}/lab-orders', D1, {'items': [{'lab_test_id': tests[1]['id']}]}); check('PAID: new lab order is locked (403)', s == 403)
s, d, _ = call('POST', f'/visits/{vB}/prescriptions', D1, {'items': [{'medicine_id': med['id'], 'dose': '1', 'frequency': '1x1', 'qty': 1}]}); check('PAID: new prescription is locked (403)', s == 403)
s, d, _ = call('POST', f'/visits/{vB}/diagnoses', D1, {'icd10_code': 'R50.9', 'type': 'SECONDARY'}); check('PAID: diagnosis can still be added (and is audited)', s == 201 and int(sql(f"select count(*) from audit_log where table_name='visit_diagnosis' and record_id='{d['data']['id']}'")) == 1, (s, d))
check('visit B is DONE (paid, nothing pending)', visit_status(vB) == 'DONE')
s, d, _ = call('POST', f'/visits/{vB}/procedures', A, {'procedure_id': procs['TND-002']['id']}); check('admin override needs a reason (422)', s == 422 and d['error']['details'][0]['field'] == 'reason', (s, d))
s, d, _ = call('POST', f'/visits/{vB}/procedures', A, {'procedure_id': procs['TND-002']['id'], 'reason': 'tindakan terlewat, disetujui kepala klinik'})
inv = invoice(invB)
check('admin correction after PAID: allowed with reason -> total up, status PARTIAL, remaining shown', s == 201 and inv['status'] == 'PARTIAL' and inv['total_amount'] == '155000.00' and float(inv['remaining']) == 35000, (s, inv))
check('the visit is reopened (DONE -> EXAMINED) because the bill is open again', visit_status(vB) == 'EXAMINED')
check('admin correction is audited with the reason', int(sql(f"select count(*) from audit_log where table_name='invoice' and record_id='{invB}' and reason='tindakan terlewat, disetujui kepala klinik'")) == 1)
s, d, _ = call('POST', f'/visit-procedures/{vp_b}/void', A, {'reason': 'x y z'}); check('after the correction the invoice is open (PARTIAL): admin has no clinical rights again (403)', s == 403 and d['error']['code'] == 'FORBIDDEN', (s, d))
s, d, _ = pay(invB, 35000); check('cashier settles the corrected bill -> PAID', d['data']['invoice_status'] == 'PAID')
s, d, _ = call('POST', f'/visit-procedures/{vp_b}/void', A, {}); check('admin void without reason -> 422', s == 422)
s, d, _ = call('POST', f'/visit-procedures/{vp_b}/void', A, {'reason': 'koreksi tarif ganda'}); inv = invoice(invB)
check('admin may void after PAID (with reason): total 80.000 < paid 155.000 -> OVERPAID', s == 200 and inv['status'] == 'OVERPAID' and inv['total_amount'] == '80000.00', (s, inv))
s, d, _ = call('POST', f'/visits/{vB}/procedures', D1, {'procedure_id': procs['TND-002']['id']}); check('OVERPAID is not locked for the doctor (can re-add; admin is not needed)', s == 201 and invoice(invB)['total_amount'] == '115000.00', (s, d))

# ---- admin has no clinical rights on an unpaid invoice
pidC, vC = visit_in_exam(); finish(vC, ['TND-001']); invC = call('POST', f'/visits/{vC}/invoice', K)[1]['data']['id']
s, d, _ = call('POST', f'/visits/{vC}/procedures', A, {'procedure_id': procs['TND-002']['id'], 'reason': 'coba'}); check('admin cannot add procedures while the invoice is not paid (403 FORBIDDEN)', s == 403 and d['error']['code'] == 'FORBIDDEN', (s, d))
s, d, _ = call('POST', f'/visits/{vC}/procedures', D1, {'procedure_id': procs['TND-002']['id']}); inv = invoice(invC)
check('UNPAID invoice: doctor may still add a procedure, total follows (20.000 + 25.000 + 35.000 = 80.000)', s == 201 and inv['total_amount'] == '80000.00' and inv['status'] == 'UNPAID', (s, inv))
s, d, _ = call('GET', f'/visits/{vC}', K); check('visit detail exposes the invoice summary', s == 200 and d['data']['invoice']['id'] == invC and 'clinical' not in d['data'])
s, d, _ = call('GET', '/visits?status=EXAMINED&no_invoice=1&per_page=100', K); check('kasir list: visits waiting for an invoice (no_invoice filter)', s == 200 and all(x['invoice_id'] is None for x in d['data']))
s, d, _ = call('GET', f'/visits?date={today}&per_page=100', K); check('visit list carries invoice status', any(x['invoice_status'] == 'UNPAID' for x in d['data']))

mock_lis(True, A)
print('\nFAILURES:', fails); sys.exit(1 if fails else 0)
