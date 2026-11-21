/*
 * Real-browser submission audit. No npm packages are needed.
 * Run: node tests/audit.cjs
 * Uses a temporary browser profile; it never touches your regular browser data.
 */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(__dirname, 'artifacts');
const pages = ['index', 'register', 'login', 'events', 'enquiry', 'dashboard', 'admin'];
const results = [];
const errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(fn, description) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if (await fn()) return; } catch (_) { /* navigation can replace the execution context */ }
    await delay(60);
  }
  throw new Error('Timed out: ' + description);
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.pending = new Map();
    this.id = 0;
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
        errors.push(message.params.entry.text);
      } else if (message.method === 'Page.javascriptDialogOpening') {
        this.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
      }
    });
  }
  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    return this;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('CDP timed out: ' + method));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const response = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result.value;
  }
}

async function run() {
  fs.mkdirSync(artifacts, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scms-audit-'));
  const candidates = [
    process.env.SCMS_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  const executable = candidates.find(candidate => candidate && fs.existsSync(candidate));
  assert.ok(executable, 'Install Edge/Chrome or set SCMS_BROWSER to the browser executable.');
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end(); return; }
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      response.setHeader('Content-Type', (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8');
      response.end(data);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = spawn(executable, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let browserCDP;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    await until(() => fs.existsSync(portFile), 'browser startup');
    const [port, socket] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    browserCDP = await new CDP('ws://127.0.0.1:' + port + socket).connect();
    async function newPage() {
      const { targetId } = await browserCDP.send('Target.createTarget', { url: 'about:blank' });
      const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const target = targets.find(item => item.id === targetId);
      const tab = await new CDP(target.webSocketDebuggerUrl).connect();
      await tab.send('Page.enable');
      await tab.send('Runtime.enable');
      await tab.send('Log.enable');
      return tab;
    }
    const tab = await newPage();
    const value = expression => tab.evaluate(expression);
    const get = key => value('JSON.parse(localStorage.getItem(' + JSON.stringify('scms_' + key) + '))');
    const count = selector => value('document.querySelectorAll(' + JSON.stringify(selector) + ').length');
    const text = selector => value('document.querySelector(' + JSON.stringify(selector) + ').textContent');
    async function navigate(file, target = tab) {
      const url = file.startsWith('file:') ? file : base + file;
      await target.send('Page.navigate', { url });
      const protectedPage = new URL(url).pathname.split('/').pop();
      const mayRedirect = ['admin.html', 'dashboard.html'].includes(protectedPage);
      await until(() => target.evaluate('document.readyState === "complete" && (location.href === ' + JSON.stringify(url) +
        (mayRedirect ? ' || (location.pathname.endsWith("/login.html") && new URLSearchParams(location.search).get("next") === ' + JSON.stringify(protectedPage) + ')' : '') + ')'), 'load ' + file);
    }
    async function redirected(page) {
      await until(() => value('location.pathname.endsWith(' + JSON.stringify('/' + page + '.html') + ') && document.readyState === "complete"'), 'redirect to ' + page);
    }
    async function fill(fields) {
      await value('(' + function (fields) {
        for (const [id, inputValue] of Object.entries(fields)) {
          const input = document.getElementById(id);
          if (!input) throw new Error('Missing input: ' + id);
          input.value = inputValue;
          input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        }
      }.toString() + ')(' + JSON.stringify(fields) + ')');
    }
    const click = selector => value('document.querySelector(' + JSON.stringify(selector) + ').click()');
    const submit = id => value('document.getElementById(' + JSON.stringify(id) + ').requestSubmit()');
    async function login(email = 'asha@example.com', password = 'Campus123', admin = false) {
      await navigate('login.html' + (admin ? '?role=admin' : ''));
      await fill({ 'login-id': email, 'login-password': password });
      await submit('login-form');
      await redirected(admin ? 'admin' : 'dashboard');
    }
    async function test(name, fn) {
      await fn();
      results.push(name);
      console.log('PASS ' + name);
    }
    const student = {
      'reg-name': 'अनया शर्मा', 'reg-email': 'Asha@Example.com', 'reg-student-id': 'CS2026001',
      'reg-department': 'Computer Science', 'reg-year': '1', 'reg-phone': '9876543210',
      'reg-password': 'Campus123', 'reg-confirm': 'Campus123'
    };
    await test('All seven pages: local assets, links, labels, semantic structure, no browser errors', async () => {
      for (const page of pages) {
        // Protected pages need their matching demo session.
        await navigate('index.html');
        if (page === 'admin') await value('localStorage.setItem("scms_session", JSON.stringify({role:"admin"}))');
        else await value('localStorage.removeItem("scms_session")');
        if (page === 'dashboard') continue; // Checked after real registration below.
        await navigate(page + '.html');
        const issues = await value('(' + function () {
          const issues = [];
          if (document.querySelectorAll('h1').length !== 1) issues.push('Must have one h1');
          if (!document.documentElement.lang || !document.querySelector('meta[name="viewport"]')) issues.push('Missing language/viewport');
          const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
          if (new Set(ids).size !== ids.length) issues.push('Duplicate IDs');
          for (const input of document.querySelectorAll('input,select,textarea')) {
            if (!document.querySelector('label[for="' + input.id + '"]')) issues.push('Unlabelled input: ' + input.id);
          }
          for (const image of document.images) {
            if (!image.complete || image.naturalWidth === 0) issues.push('Broken image: ' + image.src);
            if (!image.hasAttribute('alt')) issues.push('Missing alt');
          }
          return issues;
        }.toString() + ')()');
        assert.deepEqual(issues, [], page);
        const links = await value('[...document.querySelectorAll("a[href],link[href],script[src],img[src]")].map(n => n.getAttribute("href") || n.getAttribute("src")).filter(h => !h.startsWith("#"))');
        for (const link of links) assert.ok((await fetch(new URL(link, base))).ok, 'Broken reference: ' + link);
      }
      await value('localStorage.clear()');
      await navigate('index.html');
      assert.equal(await count('#upcoming-events article'), 3);
      assert.equal((await get('events')).length, 8);
    });
    await test('Registration: empty/invalid fields, reset, Unicode name, saved account and email prefill', async () => {
      await navigate('register.html');
      await submit('register-form');
      assert.equal(await count('[aria-invalid="true"]'), 8);
      assert.equal(await value('document.activeElement.id'), 'reg-name');
      await fill({ ...student, 'reg-email': 'invalid', 'reg-student-id': '!!', 'reg-phone': '12', 'reg-password': 'short', 'reg-confirm': 'different' });
      await submit('register-form');
      assert.equal(await count('[aria-invalid="true"]'), 5);
      await click('button[type="reset"]');
      assert.equal(await count('[aria-invalid="true"]'), 0);
      await fill(student);
      await submit('register-form');
      await redirected('login');
      assert.equal(await value('document.getElementById("login-id").value'), 'asha@example.com');
      assert.equal((await get('students')).length, 1);
    });
    await test('Registration: duplicate email and student ID rejected without overwriting data', async () => {
      await navigate('register.html');
      await fill(student);
      await submit('register-form');
      assert.equal(await count('[aria-invalid="true"]'), 2);
      assert.equal((await get('students')).length, 1);
    });
    await test('Login: wrong password, safe redirect, protected pages and logout', async () => {
      await navigate('dashboard.html');
      await redirected('login');
      await navigate('admin.html');
      await redirected('login');
      await navigate('login.html?next=https://example.com');
      await fill({ 'login-id': 'asha@example.com', 'login-password': 'Wrong123' });
      await submit('login-form');
      assert.match(await text('.form-summary'), /Incorrect/);
      await fill({ 'login-password': 'Campus123' });
      await submit('login-form');
      await redirected('dashboard');
      assert.equal(await text('#welcome-name'), 'अनया शर्मा');
      assert.equal(await count('#profile-details .profile-row'), 7);
      await navigate('admin.html');
      await redirected('login');
      await click('[data-action="logout"]');
      await redirected('index');
      assert.equal(await get('session'), null);
    });
    await test('Events: search, category, empty results, clear filters and return after login', async () => {
      await navigate('events.html');
      assert.equal(await count('#event-list article'), 8);
      await fill({ 'event-search': 'computer lab' });
      assert.equal(await count('#event-list article'), 1);
      await fill({ 'event-search': '', 'event-category': 'Sports' });
      assert.equal(await count('#event-list article'), 2);
      await fill({ 'event-search': 'nothing matches' });
      assert.equal(await count('#event-list article'), 0);
      await click('#event-reset');
      assert.equal(await count('#event-list article'), 8);
      await click('#event-list a');
      await redirected('login');
      await fill({ 'login-id': 'asha@example.com', 'login-password': 'Campus123' });
      await submit('login-form');
      await redirected('events');
    });
    await test('Event sign-up: seat count, persistence, dashboard and cancellation', async () => {
      await click('button[data-action="join"][data-id="evt-1"]');
      assert.deepEqual((await get('students'))[0].eventIds, ['evt-1']);
      assert.match(await text('#event-list article'), /299 of 300 left/);
      await navigate('events.html');
      assert.equal(await count('button[data-action="cancel"]'), 1);
      await navigate('dashboard.html');
      assert.equal(await text('#stat-my-events'), '1');
      await click('#my-events button');
      assert.equal(await text('#stat-my-events'), '0');
      await navigate('events.html');
      await click('button[data-action="join"][data-id="evt-1"]');
      await click('button[data-action="cancel"][data-id="evt-1"]');
      assert.deepEqual((await get('students'))[0].eventIds, []);
    });
    await test('Enquiries: validation, locked student details, reference, safe text and dashboard status', async () => {
      await navigate('enquiry.html');
      assert.equal(await value('document.getElementById("enq-email").readOnly'), true);
      await submit('enquiry-form');
      assert.equal(await count('[aria-invalid="true"]'), 3);
      await fill({ 'enq-subject': '  =1+1', 'enq-category': 'Fees', 'enq-message': '<script>window.auditInjected=true</script> Please explain the fee schedule.' });
      await submit('enquiry-form');
      assert.equal(await value('document.getElementById("enquiry-success").hidden'), false);
      assert.match(await text('#enquiry-ref'), /^ENQ-/);
      assert.equal(await count('[aria-invalid="true"]'), 0);
      assert.equal(await text('#enq-message-count'), '0 / 1000 characters');
      await navigate('dashboard.html');
      assert.equal(await text('#stat-my-open'), '1');
      assert.match(await text('#my-enquiries'), /<script>/);
      assert.equal(await value('Boolean(window.auditInjected)'), false);
    });
    await test('Guest enquiry: publicly available and saved with a reference', async () => {
      await click('[data-action="logout"]');
      await redirected('index');
      await navigate('enquiry.html');
      await fill({ 'enq-name': 'Guest Student', 'enq-email': 'guest@example.com', 'enq-subject': 'Hostel information', 'enq-category': 'Hostel', 'enq-message': 'Please share the hostel application dates and details.' });
      await submit('enquiry-form');
      assert.equal((await get('enquiries')).length, 2);
    });
    await test('Admin: counts, searches, resolution/reopening, status filtering and keyboard tabs', async () => {
      await login('admin', 'admin123', true);
      assert.equal(await text('#stat-students'), '1');
      assert.equal(await text('#stat-open'), '2');
      await fill({ 'students-search': 'cs2026001' });
      assert.equal(await count('#students-body tr'), 1);
      await fill({ 'students-search': 'nonexistent' });
      assert.equal(await count('#students-body tr'), 0);
      await fill({ 'students-search': '' });
      await value('document.getElementById("tab-students").focus()');
      await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' });
      assert.equal(await value('document.activeElement.id'), 'tab-enquiries');
      await fill({ 'enquiries-search': 'asha@example.com' });
      assert.equal(await count('#enquiries-body tr'), 1);
      await click('#enquiries-body button');
      assert.equal(await text('#stat-open'), '1');
      await fill({ 'enquiries-status': 'Open' });
      assert.equal(await count('#enquiries-body tr'), 0);
      await fill({ 'enquiries-status': 'Resolved' });
      assert.equal(await count('#enquiries-body tr'), 1);
      await click('#enquiries-body button');
      assert.equal(await value('document.activeElement.id'), 'enquiries-status');
      await fill({ 'enquiries-status': '', 'enquiries-search': '' });
      await navigate('admin.html#events');
      assert.equal(await value('document.getElementById("panel-events").hidden'), false);
      await value('location.hash = "enquiries"');
      await until(() => value('!document.getElementById("panel-enquiries").hidden'), 'admin hash tab');
    });
    await test('CSV: actual downloads, filenames, current filters, UTF-8, escaping and no passwords', async () => {
      await browserCDP.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts });
      const stamp = await value('new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0")+"-"+String(new Date().getDate()).padStart(2,"0")');
      const enquiryFile = path.join(artifacts, 'enquiries-' + stamp + '.csv');
      const studentFile = path.join(artifacts, 'registrations-' + stamp + '.csv');
      // Only remove these two known test downloads, so reruns cannot read stale CSVs.
      for (const file of [enquiryFile, studentFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
      await fill({ 'enquiries-search': 'asha@example.com' });
      await click('#enquiries-export');
      await until(() => fs.existsSync(enquiryFile), 'enquiries CSV download');
      const csv = fs.readFileSync(enquiryFile, 'utf8');
      assert.match(csv, /"'=1\+1"/);
      assert.match(csv, /asha@example.com/);
      assert.ok(!csv.includes('guest@example.com'));
      await click('#tab-students');
      await click('#students-export');
      await until(() => fs.existsSync(studentFile), 'registrations CSV download');
      assert.ok(!fs.readFileSync(studentFile, 'utf8').includes('Campus123'));
      assert.match(fs.readFileSync(studentFile, 'utf8'), /अनया शर्मा/);
      await navigate('admin.html#events');
    });
    await test('Admin event form: empty validation, past day/time rejection and new event persistence', async () => {
      await submit('event-form');
      assert.equal(await count('[aria-invalid="true"]'), 7);
      const dates = await value(`(() => {
        const iso = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
        const future = new Date(); future.setDate(future.getDate()+2);
        return { yesterday: iso(yesterday), today: iso(new Date()), future: iso(future) };
      })()`);
      const eventFields = {
        'ev-title': 'One seat workshop', 'ev-category': 'Workshop', 'ev-venue': 'Lab 1',
        'ev-date': dates.yesterday, 'ev-time': '00:00', 'ev-capacity': '1',
        'ev-description': 'A workshop with one place available for testing.'
      };
      await fill(eventFields);
      await submit('event-form');
      assert.match(await text('#ev-date-error'), /past/);
      await fill({ 'ev-date': dates.today });
      await submit('event-form');
      assert.match(await text('#ev-time-error'), /future/);
      await fill({ 'ev-date': dates.future });
      await submit('event-form');
      assert.equal((await get('events')).length, 9);
    });
    const addedEvent = (await get('events')).find(event => event.title === 'One seat workshop');
    await test('Capacity and started events: closed for students and guests', async () => {
      await login();
      await navigate('events.html');
      await click('button[data-action="join"][data-id="' + addedEvent.id + '"]');
      await value(`const allEvents = JSON.parse(localStorage.scms_events);
        allEvents.push({...allEvents[0], id:"already-started", date:new Date().getFullYear()+"-"+String(new Date().getMonth()+1).padStart(2,"0")+"-"+String(new Date().getDate()).padStart(2,"0"), time:"00:00"});
        localStorage.scms_events = JSON.stringify(allEvents);`);
      await click('[data-action="logout"]');
      await redirected('index');
      await navigate('events.html');
      assert.equal(await count('#event-list button[disabled]'), 2);
      await navigate('register.html');
      await fill({ ...student, 'reg-name': 'Second Student', 'reg-email': 'second@example.com', 'reg-student-id': 'CS2026002' });
      await submit('register-form');
      await redirected('login');
      await login('second@example.com');
      await navigate('events.html');
      assert.equal(await count('#event-list button[disabled]'), 2);
      assert.equal(await count('button[data-action="join"][data-id="' + addedEvent.id + '"]'), 0);
    });
    await test('Multiple tabs: data refresh, enquiry status and logout invalidate protected pages', async () => {
      await login();
      await navigate('dashboard.html');
      const other = await newPage();
      await navigate('index.html', other);
      await other.evaluate('const q = JSON.parse(localStorage.scms_enquiries); q[0].status = "Resolved"; localStorage.scms_enquiries = JSON.stringify(q)');
      await until(() => text('#stat-my-resolved').then(result => result === '1'), 'live enquiry status');
      await other.evaluate('localStorage.removeItem("scms_session")');
      await redirected('login');
      assert.equal(await count('.site-nav [data-auth="guest"]:not([hidden])'), 2);
      await browserCDP.send('Target.closeTarget', { targetId: (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(item => item.webSocketDebuggerUrl === other.ws.url)?.id });
    });
    await test('Admin deletion: confirmation, signup cleanup and deleted student cannot log in', async () => {
      await login('admin', 'admin123', true);
      await click('#tab-events');
      await click('button[data-action="delete-event"][data-id="' + addedEvent.id + '"]');
      assert.ok(!(await get('events')).some(event => event.id === addedEvent.id));
      assert.ok((await get('students')).every(student => !student.eventIds.includes(addedEvent.id)));
      await click('#tab-students');
      await fill({ 'students-search': 'second@example.com' });
      await click('#students-body button');
      assert.equal((await get('students')).length, 1);
      await navigate('login.html');
      await fill({ 'login-id': 'second@example.com', 'login-password': 'Campus123' });
      await submit('login-form');
      assert.match(await text('.form-summary'), /Incorrect/);
    });
    await test('Responsive pages: 320, 360, 768 and 1280px, long text, menu and screenshots', async () => {
      await value(`const events = JSON.parse(localStorage.scms_events); events[0].title = "X".repeat(80); events[0].venue = "Y".repeat(80); events[0].description = "Z".repeat(500); localStorage.scms_events = JSON.stringify(events);`);
      for (const width of [320, 360, 768, 1280]) {
        await tab.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const page of pages) {
          if (page === 'admin') await login('admin', 'admin123', true);
          if (page === 'dashboard') await login();
          await navigate(page + '.html');
          const overflow = await value('document.documentElement.scrollWidth > innerWidth');
          if (overflow) {
            console.error(await value(`JSON.stringify([...document.querySelectorAll("main,main *")].map(node => {
              const box = node.getBoundingClientRect();
              return {tag:node.tagName, id:node.id, class:node.className, width:box.width, right:box.right, display:getComputedStyle(node).display};
            }).filter(box => box.width > innerWidth || box.right > innerWidth).slice(0,20), null, 2)`));
            const image = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.writeFileSync(path.join(artifacts, 'overflow-' + page + '-' + width + '.png'), Buffer.from(image.data, 'base64'));
          }
          assert.equal(overflow, false, page + ' overflows at ' + width + 'px');
          if ((page === 'index' || page === 'admin') && (width === 360 || width === 1280)) {
            const image = await tab.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            fs.writeFileSync(path.join(artifacts, page + '-' + width + '.png'), Buffer.from(image.data, 'base64'));
          }
        }
      }
      await tab.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 900, deviceScaleFactor: 1, mobile: false });
      await navigate('index.html');
      await click('.nav-toggle');
      assert.equal(await value('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'), 'true');
      await tab.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
      assert.equal(await value('document.querySelector(".nav-toggle").getAttribute("aria-expanded")'), 'false');
      await value('document.querySelector(".skip-link").focus()');
      assert.ok(await value('document.querySelector(".skip-link").getBoundingClientRect().top >= 0'));
    });
    await test('Damaged saved records: malformed entries do not crash pages, missing events reseed', async () => {
      await value(`localStorage.scms_students = JSON.stringify([null, "bad", {}, ...JSON.parse(localStorage.scms_students)]);
        localStorage.scms_events = JSON.stringify([null, "bad", {}, ...JSON.parse(localStorage.scms_events)]);
        localStorage.scms_enquiries = JSON.stringify([null, "bad", {}, ...JSON.parse(localStorage.scms_enquiries)]);`);
      await navigate('events.html');
      assert.equal(await count('#event-list article'), 9);
      await login('admin', 'admin123', true);
      assert.equal(await count('#students-body tr'), 1);
      assert.equal(await count('#enquiries-body tr'), 2);
      await value('localStorage.removeItem("scms_events")');
      await navigate('events.html');
      assert.equal(await count('#event-list article'), 8);
      await value('localStorage.scms_events = "invalid JSON"');
      await navigate('events.html');
      assert.equal(await count('#event-list article'), 8);
    });
    await test('Storage failure: no false registration/enquiry/signup/login success, form values retained', async () => {
      await navigate('register.html');
      await fill({ ...student, 'reg-email': 'storage@example.com', 'reg-student-id': 'CS2026003' });
      await value('Storage.prototype.setItem = function() { throw new DOMException("Full", "QuotaExceededError"); }');
      await submit('register-form');
      assert.equal(await value('location.pathname.endsWith("register.html")'), true);
      assert.equal(await count('#storage-warning'), 1);
      assert.equal(await value('document.getElementById("reg-email").value'), 'storage@example.com');
      await navigate('enquiry.html');
      await fill({ 'enq-name': 'Guest Student', 'enq-email': 'failure@example.com', 'enq-subject': 'Storage failure', 'enq-category': 'Other', 'enq-message': 'This enquiry must not display a success message if saving fails.' });
      await value('Storage.prototype.setItem = function() { throw new DOMException("Full", "QuotaExceededError"); }');
      await submit('enquiry-form');
      assert.equal(await value('document.getElementById("enquiry-success").hidden'), true);
      await navigate('login.html');
      await fill({ 'login-id': 'asha@example.com', 'login-password': 'Campus123' });
      await value('Storage.prototype.setItem = function() { throw new DOMException("Full", "QuotaExceededError"); }');
      await submit('login-form');
      assert.match(await text('.form-summary'), /could not be saved/);
      await login();
      await navigate('events.html');
      await value('Storage.prototype.setItem = function() { throw new DOMException("Full", "QuotaExceededError"); }');
      await click('button[data-action="join"][data-id="evt-1"]');
      assert.equal(await count('button[data-action="cancel"][data-id="evt-1"]'), 0);
      await navigate('index.html');
      const { identifier } = await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: 'Storage.prototype.setItem = function() { throw new DOMException("Blocked", "SecurityError"); };' });
      await navigate('index.html');
      assert.equal(await count('#storage-warning'), 1);
      await tab.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
    });
    await test('Direct-file mode: offline assets, registration, login and dashboard across HTML files', async () => {
      const fileBase = new URL('file:///' + root.replaceAll('\\', '/') + '/');
      await navigate(new URL('index.html', fileBase).href);
      await value('localStorage.clear()');
      await navigate(new URL('register.html', fileBase).href);
      await fill(student);
      await submit('register-form');
      await redirected('login');
      await fill({ 'login-id': 'asha@example.com', 'login-password': 'Campus123' });
      await submit('login-form');
      await redirected('dashboard');
      assert.equal(await text('#welcome-name'), 'अनया शर्मा');
      assert.equal(await value('[...document.images].every(image => image.complete && image.naturalWidth > 0)'), true);
    });
    assert.deepEqual(errors, [], 'Browser console/page errors');
    const report = { testedAt: new Date().toISOString(), browser: executable, passed: results.length, checks: results, browserErrors: errors };
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('\n' + results.length + ' audit groups passed. Report and screenshots: tests/artifacts/');
  } finally {
    if (browserCDP) {
      await browserCDP.send('Browser.close').catch(() => {});
      browserCDP.ws.close();
    } else browser.kill();
    server.close();
    // Remove only the verified, uniquely-created temporary browser profile.
    await until(() => browser.exitCode !== null || browser.signalCode !== null, 'browser shutdown').catch(() => browser.kill());
    if (path.dirname(profile) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('scms-audit-')) {
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
      } catch (_) {
        console.warn('The browser still has a temporary profile file open; temporary profile retained at ' + profile);
      }
    }
  }
}

run().catch(error => {
  console.error(error.stack);
  if (errors.length) console.error('Browser errors:', errors);
  process.exitCode = 1;
});
