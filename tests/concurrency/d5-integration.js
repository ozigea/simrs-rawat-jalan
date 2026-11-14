'use strict';
// Scenario D-5 (integration failures), proven end to end against the running stack:
//   Yii (order + outbox) -> Node worker -> mock LIS -> Node inbox -> Yii (result)
//   node tests/concurrency/d5-integration.js            full run (stops/starts the yii-web container)
//   node tests/concurrency/d5-integration.js --no-docker   skips the "core is down" part
const { execSync } = require('child_process');
const path = require('path');
const { call, callNode, login, makeVisitsInExam, waitFor, sleep, check, done } = require('./lib');

const REPO = path.resolve(__dirname, '..', '..');
const NO_DOCKER = process.argv.includes('--no-docker');
const LIS_KEY = process.env.LIS_API_KEY || 'change-me-lis-key';
const docker = (cmd) => execSync(`docker compose ${cmd}`, { cwd: REPO, stdio: 'pipe' });

(async () => {
  const [admin, reg, doctor, lab] = await Promise.all(['admin', 'pendaftaran', 'dokter1', 'lab'].map((u) => login(u)));
  const setMock = (enabled) => callNode('PUT', '/mock-lis/state', { token: admin, body: { enabled } });
  const monitor = async (kind, orderNo, extId) => {
    const r = await callNode('GET', `/integration/${kind}?per_page=100`, { token: admin });
    return r.body.data.find((row) => (extId ? row.external_id === extId : row.payload.order_no === orderNo));
  };
  const tests = (await call('GET', '/lab-tests?per_page=2&sort=id', { token: admin })).body.data;
  const orderLab = async (visitId, n = 2) => {
    const r = await call('POST', `/visits/${visitId}/lab-orders`, { token: doctor, body: { items: tests.slice(0, n).map((t) => ({ lab_test_id: t.id })) } });
    if (r.status !== 201) throw new Error('lab order failed: ' + JSON.stringify(r.body));
    return r.body.data;
  };
  const yiiOrder = async (id) => (await call('GET', `/lab-orders/${id}`, { token: lab })).body.data;
  const sendResult = (orderNo, extId, value = '11.0') => callNode('POST', '/integration/lab-results', {
    headers: { 'X-API-Key': LIS_KEY },
    body: { external_id: extId, order_no: orderNo, results: [{ test_code: tests[0].code, value, flag: 'NORMAL' }, { test_code: tests[1].code, value: '22.0', flag: 'NORMAL' }] },
  });

  const [v1, v2, v3, v4] = await makeVisitsInExam(4, 'd5', { admin, reg, doctor });
  try {
    // ---- A. external lab is DOWN when the doctor orders
    console.log('--- D-5: lab system down when the order is placed');
    check('mock LIS switched off', (await setMock(false)).status === 200);
    const o1 = await orderLab(v1);
    check('order is saved in the core anyway (ORDERED) - the doctor is not blocked', o1.status === 'ORDERED');
    const ev = await waitFor(async () => { const e = await monitor('outbox', o1.order_no); return e && e.attempts >= 1 ? e : null; }, 20000, 'first failed delivery attempt');
    check('outbox event is PENDING with retries and the error recorded', ev.status === 'PENDING' && ev.attempts >= 1 && /503/.test(ev.last_error), ev);
    check('retry is scheduled in the future (backoff)', new Date(ev.next_attempt_at) > new Date(Date.now() - 1000), ev.next_attempt_at);

    console.log('--- D-5: lab system comes back -> the same order is delivered and the result flows back');
    await setMock(true);
    await waitFor(async () => (await monitor('outbox', o1.order_no)).status === 'SENT', 40000, 'outbox SENT');
    check('outbox event SENT', true);
    const done1 = await waitFor(async () => { const o = await yiiOrder(o1.id); return o.status === 'RESULTED' ? o : null; }, 30000, 'order RESULTED');
    check('result stored in the core: RESULTED, source LIS, all items have a value', done1.items.every((i) => i.result_value && i.result_source === 'LIS'), done1.items);
    const inb = await monitor('inbox', o1.order_no, `RES-${o1.order_no}`);
    check('inbox message FORWARDED', inb && inb.status === 'FORWARDED', inb);

    // ---- B. duplicates
    console.log('--- TC-20 / D-5: the same result delivered again');
    const before = JSON.stringify((await yiiOrder(o1.id)).items.map((i) => [i.result_value, i.resulted_at]));
    const dups = await Promise.all([1, 2, 3].map(() => sendResult(o1.order_no, `RES-${o1.order_no}`, '99.9')));
    check('every re-delivery is answered 202 duplicate:true', dups.every((r) => r.status === 202 && r.body.data.duplicate === true), dups.map((r) => r.body));
    await sleep(3000);
    check('still exactly one inbox row for that external_id', (await callNode('GET', '/integration/inbox?per_page=100', { token: admin })).body.data.filter((r) => r.external_id === `RES-${o1.order_no}`).length === 1);
    check('the stored result did not change (first delivery wins)', JSON.stringify((await yiiOrder(o1.id)).items.map((i) => [i.result_value, i.resulted_at])) === before);

    // ---- C. core (Yii) down when the result arrives
    if (!NO_DOCKER) {
      console.log('--- D-5: the core is DOWN when the lab result arrives');
      await setMock(false);
      const o2 = await orderLab(v2);
      docker('stop yii-web');
      const r = await sendResult(o2.order_no, `MANUAL-${o2.order_no}`);
      check('the external system still gets 202 (message safe in the inbox)', r.status === 202 && r.body.data.status === 'RECEIVED', r.body);
      const stuck = await waitFor(async () => { const m = await monitor('inbox', o2.order_no, `MANUAL-${o2.order_no}`); return m && m.attempts >= 1 ? m : null; }, 20000, 'forward attempt while core is down');
      check('message stays RECEIVED with retries (nothing lost)', stuck.status === 'RECEIVED' && stuck.attempts >= 1, stuck);
      docker('start yii-web');
      await waitFor(async () => { try { return (await call('GET', '/health')).status === 200; } catch { return false; } }, 30000, 'core back up');
      await waitFor(async () => (await monitor('inbox', o2.order_no, `MANUAL-${o2.order_no}`)).status === 'FORWARDED', 40000, 'inbox FORWARDED after recovery');
      check('after the core is back the result is forwarded automatically', (await yiiOrder(o2.id)).status === 'RESULTED');
    }

    // ---- D. business rejection -> FAILED immediately, visible + retry by admin
    console.log('--- D-5: result for an unknown order -> FAILED (permanent), visible to the admin');
    const ghost = `LAB-GHOST-${Date.now()}`;
    await sendResult(ghost, `GHOST-${ghost}`);
    const failedMsg = await waitFor(async () => { const m = await monitor('inbox', ghost, `GHOST-${ghost}`); return m && m.status === 'FAILED' ? m : null; }, 15000, 'inbox FAILED');
    check('FAILED with the reason, no endless retry', failedMsg.attempts === 1 && /404/.test(failedMsg.last_error), failedMsg);
    const retry = await callNode('POST', `/integration/inbox/${failedMsg.id}/retry`, { token: admin });
    check('admin retry puts it back to RECEIVED', retry.status === 200 && retry.body.data.status === 'RECEIVED', retry.body);
    await waitFor(async () => (await monitor('inbox', ghost, `GHOST-${ghost}`)).status === 'FAILED', 15000, 'FAILED again');
    check('a non-admin cannot use the monitor retry (403)', (await callNode('POST', `/integration/inbox/${failedMsg.id}/retry`, { token: reg })).status === 403);

    // ---- E. outbox exhausts its attempts -> FAILED, admin retry delivers it
    console.log('--- D-5: lab system stays down -> after 5 attempts the event is FAILED; admin retry after recovery');
    await setMock(false);
    const o3 = await orderLab(v3, 1);
    const failedEv = await waitFor(async () => { const e = await monitor('outbox', o3.order_no); return e && e.status === 'FAILED' ? e : null; }, 90000, 'outbox FAILED after max attempts');
    check('outbox FAILED after 5 attempts, error kept', failedEv.attempts === 5 && /503/.test(failedEv.last_error), failedEv);
    await setMock(true);
    const rr = await callNode('POST', `/integration/outbox/${failedEv.id}/retry`, { token: admin });
    check('admin retry resets it to PENDING', rr.status === 200 && rr.body.data.status === 'PENDING' && rr.body.data.attempts === 0, rr.body);
    await waitFor(async () => (await yiiOrder(o3.id)).status === 'RESULTED', 40000, 'order RESULTED after manual retry');
    check('delivered and resulted after the admin retry', true);
  } finally {
    await setMock(true).catch(() => {});
    if (!NO_DOCKER) { try { docker('start yii-web'); } catch { /* already running */ } }
  }
  done();
})().catch((e) => { console.error(e); try { docker('start yii-web'); } catch { /* ignore */ } process.exit(2); });
