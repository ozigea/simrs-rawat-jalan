'use strict';
// Shared helpers for the headless-Chrome UI checks (puppeteer-core drives the locally installed Chrome).
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.FRONTEND_URL || 'http://localhost:5173';
const SHOTS = path.resolve(__dirname, '..', '..', 'docs', 'screenshots');
let failures = 0;

const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${cond ? '' : ' ' + String(extra).slice(0, 500)}`);
  if (!cond) failures += 1;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Intl.NumberFormat('id-ID') puts a no-break space after "Rp"; normalise so assertions can use plain spaces.
const text = (p) => p.evaluate(() => document.body.innerText.replace(/\u00a0/g, ' '));

// Clicks the first VISIBLE element matching `selector` whose text contains `label` (antd keeps hidden tab panes in the DOM).
// Polls (up to `timeout` ms) until the page text contains all needles; returns whether it did. Replaces fixed sleeps.
async function has(page, needles, timeout = 20000) {
  const list = Array.isArray(needles) ? needles : [needles];
  const end = Date.now() + timeout;
  for (;;) {
    const t = await text(page).catch(() => '');
    if (list.every((n) => t.includes(n))) return true;
    if (Date.now() > end) return false;
    await sleep(300);
  }
}

// Waits until no element matching `selector` is visible (e.g. a closing modal whose mask would swallow clicks).
async function waitGone(page, selector, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const visible = await page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none'), selector);
    if (!visible) return;
    await sleep(200);
  }
}

const clickText = (p, selector, label) => p.evaluate((s, l) => {
  const el = [...document.querySelectorAll(s)].find((b) => b.offsetParent !== null && b.innerText.trim().includes(l));
  if (!el) throw new Error(`not found: ${l}`);
  el.click();
}, selector, label);

// Picks an option of an open antd Select dropdown (type into the select first: the list is virtualised).
// Polls for the option because the dropdown animates in and options may load asynchronously.
async function pickOption(p, label, timeout = 8000) {
  const end = Date.now() + timeout;
  for (;;) {
    const clicked = await p.evaluate((l) => {
      const o = [...document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')].find((e) => e.innerText.includes(l));
      if (!o) return false;
      o.click();
      return true;
    }, label);
    if (clicked) break;
    if (Date.now() > end) throw new Error(`option not found: ${label}`);
    await sleep(300);
  }
  await sleep(300);
}

const launch = () => puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });

// Every role gets its own browser context (separate localStorage = separate session).
async function login(browser, username, password = process.env.DEMO_PASSWORD || 'Simrs#2026') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#username', { timeout: 120000 }); // Vite may still be optimising dependencies on a cold start
  await page.type('#username', username);
  await page.type('#password', password);
  await page.click('button[type=submit]');
  await sleep(1500);
  return page;
}

// Runs `trigger` (which makes the app open a new tab, e.g. a PDF), reports whether a tab appeared and closes it,
// then returns focus to `page` (an unfocused headless tab stalls further commands).
async function expectNewTab(browser, page, trigger) {
  const created = new Promise((res) => browser.once('targetcreated', res));
  await trigger();
  const target = await Promise.race([created, sleep(6000).then(() => null)]);
  if (!target) return false;
  await sleep(1500);
  const tab = await target.page().catch(() => null);
  if (tab) await tab.close().catch(() => {});
  await page.bringToFront();
  return true;
}

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
const setNumber = async (p, selector, value) => { await p.click(selector, { clickCount: 3 }); await p.keyboard.press('Backspace'); await p.type(selector, String(value)); };
const done = () => { console.log(`\nFAILURES: ${failures}`); process.exit(failures ? 1 : 0); };

module.exports = { BASE, ok, sleep, text, has, waitGone, clickText, pickOption, launch, login, shot, setNumber, expectNewTab, done };
