/*
 * Smart Campus Management System - shared script for every page.
 *
 * Each page's <body> has data-page="..."; boot() runs the matching init function.
 * All data lives in localStorage. User-entered text is always rendered with
 * textContent / createElement (never innerHTML) so it cannot inject markup.
 */
(function () {
  'use strict';

  document.documentElement.classList.add('js');

  /* ======================================================================
   * Constants
   * ==================================================================== */

  const KEYS = {
    students: 'scms_students',
    events: 'scms_events',
    enquiries: 'scms_enquiries',
    session: 'scms_session'
  };
  const FLASH_KEY = 'scms_flash';

  // Demo-only credentials. Client-side checks are NOT real security.
  const ADMIN = { username: 'admin', password: 'admin123' };

  const DEPARTMENTS = [
    'Computer Science',
    'Electrical Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Business Administration',
    'Arts and Humanities'
  ];
  const YEARS = ['1', '2', '3', '4'];
  const EVENT_CATEGORIES = ['Academic', 'Cultural', 'Sports', 'Workshop'];
  const ENQUIRY_CATEGORIES = ['Admissions', 'Academics', 'Hostel', 'Fees', 'Other'];

  const RX = {
    name: /^[\p{L}][\p{L} .'-]{1,59}$/u,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    studentId: /^[A-Za-z0-9]{4,12}$/,
    phone: /^\d{10}$/,
    date: /^\d{4}-\d{2}-\d{2}$/,
    time: /^([01]\d|2[0-3]):[0-5]\d$/,
    integer: /^\d+$/
  };

  /* ======================================================================
   * Storage (localStorage with an in-memory fallback)
   * ==================================================================== */

  const memoryStore = {};
  let storageAvailable = true;

  function checkStorage() {
    try {
      const probe = '__scms_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }

  function get(key, fallback) {
    let raw = null;
    if (storageAvailable) {
      try {
        raw = window.localStorage.getItem(key);
      } catch (e) {
        storageAvailable = false;
      }
    }
    if (!storageAvailable) {
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : fallback;
    }
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return fallback; // corrupted value: behave as if missing
    }
  }

  function set(key, value) {
    if (storageAvailable) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return;
      } catch (e) {
        storageAvailable = false;
      }
    }
    memoryStore[key] = value;
  }

  function remove(key) {
    if (storageAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        storageAvailable = false;
      }
    }
    delete memoryStore[key];
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getStudents() {
    return asArray(get(KEYS.students, [])).map(function (s) {
      s.eventIds = asArray(s.eventIds);
      return s;
    });
  }
  function saveStudents(list) { set(KEYS.students, list); }

  function getEvents() { return asArray(get(KEYS.events, [])); }
  function saveEvents(list) { set(KEYS.events, list); }

  function getEnquiries() { return asArray(get(KEYS.enquiries, [])); }
  function saveEnquiries(list) { set(KEYS.enquiries, list); }

  /* ======================================================================
   * Small utilities
   * ==================================================================== */

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /**
   * Create an element safely.
   * props: text, className, dataset, hidden, disabled, or any attribute.
   * children: nodes or strings (strings become text nodes).
   */
  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        const value = props[key];
        if (value === undefined || value === null || value === false) return;
        if (key === 'text') node.textContent = String(value);
        else if (key === 'className') node.className = value;
        else if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key === 'hidden' || key === 'disabled') node[key] = Boolean(value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.append(child instanceof Node ? child : String(child));
    });
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function toISODate(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function todayISO() {
    return toISODate(new Date());
  }

  function daysFromToday(n) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  function isValidISODate(value) {
    if (!RX.date.test(value)) return false;
    const parts = value.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
  }

  function formatDate(iso) {
    if (!isValidISODate(String(iso))) return String(iso || '');
    const parts = iso.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
    });
  }

  function formatTime(hhmm) {
    if (!RX.time.test(String(hhmm))) return String(hhmm || '');
    const parts = hhmm.split(':').map(Number);
    return new Date(2000, 0, 1, parts[0], parts[1]).toLocaleTimeString(undefined, {
      hour: 'numeric', minute: '2-digit'
    });
  }

  function formatTimestamp(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function currentPageFile() {
    const file = window.location.pathname.split('/').pop();
    return file || 'index.html';
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function fillSelect(select, options) {
    if (!select) return;
    options.forEach(function (opt) {
      select.append(el('option', { value: opt, text: opt }));
    });
  }

  function slug(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /* ======================================================================
   * Seed data (plain JS so it works over file://)
   * ==================================================================== */

  function seedEvents() {
    if (get(KEYS.events, null) !== null) return;
    saveEvents([
      {
        id: 'evt-1', title: 'Freshers\u2019 Orientation', category: 'Academic',
        date: daysFromToday(3), time: '10:00', venue: 'Main Auditorium', capacity: 300,
        description: 'Meet your faculty, tour the campus and learn about student services, clubs and support.'
      },
      {
        id: 'evt-2', title: 'AI and Machine Learning Workshop', category: 'Workshop',
        date: daysFromToday(6), time: '14:00', venue: 'Computer Lab 2', capacity: 40,
        description: 'A hands-on introduction to building and training a simple machine learning model.'
      },
      {
        id: 'evt-3', title: 'Inter-Department Football Cup', category: 'Sports',
        date: daysFromToday(9), time: '16:00', venue: 'North Sports Ground', capacity: 120,
        description: 'Cheer for your department or join a team in the annual knockout football tournament.'
      },
      {
        id: 'evt-4', title: 'Cultural Night: Rhythms of the World', category: 'Cultural',
        date: daysFromToday(12), time: '18:30', venue: 'Open Air Theatre', capacity: 250,
        description: 'Music, dance and food from student communities around the world.'
      },
      {
        id: 'evt-5', title: 'Research Paper Writing Seminar', category: 'Academic',
        date: daysFromToday(15), time: '11:00', venue: 'Seminar Hall B', capacity: 60,
        description: 'Learn how to structure, cite and submit a research paper, with tips from published authors.'
      },
      {
        id: 'evt-6', title: 'Web Development Bootcamp', category: 'Workshop',
        date: daysFromToday(18), time: '09:30', venue: 'Innovation Hub', capacity: 30,
        description: 'Build and publish a small website with HTML, CSS and JavaScript in one day.'
      },
      {
        id: 'evt-7', title: 'Annual Athletics Meet', category: 'Sports',
        date: daysFromToday(22), time: '08:00', venue: 'Athletics Track', capacity: 200,
        description: 'Track and field events open to all students. Register to compete or volunteer.'
      },
      {
        id: 'evt-8', title: 'Photography Walk and Exhibition', category: 'Cultural',
        date: daysFromToday(26), time: '15:00', venue: 'Art Gallery, Block C', capacity: 25,
        description: 'A guided photo walk around campus, followed by an exhibition of the best shots.'
      }
    ]);
  }

  /* ======================================================================
   * Flash messages (survive one redirect) and toasts
   * ==================================================================== */

  function setFlash(message, type, extra) {
    try {
      window.sessionStorage.setItem(FLASH_KEY, JSON.stringify(Object.assign({ message: message, type: type || 'success' }, extra || {})));
    } catch (e) { /* sessionStorage blocked: skip the message */ }
  }

  function takeFlash() {
    try {
      const raw = window.sessionStorage.getItem(FLASH_KEY);
      if (!raw) return null;
      window.sessionStorage.removeItem(FLASH_KEY);
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  let toastRegion = null;

  function toast(message, type) {
    if (!toastRegion) {
      toastRegion = el('div', { className: 'toast-region', role: 'status', 'aria-live': 'polite' });
      document.body.append(toastRegion);
    }
    const item = el('div', { className: 'toast toast-' + (type || 'success') }, [
      el('span', { text: message }),
      el('button', { type: 'button', className: 'toast-close', 'aria-label': 'Dismiss message', text: '\u00d7' })
    ]);
    const dismiss = function () {
      item.classList.add('toast-hide');
      window.setTimeout(function () { item.remove(); }, 250);
    };
    item.querySelector('.toast-close').addEventListener('click', dismiss);
    toastRegion.append(item);
    window.setTimeout(dismiss, 5000);
  }

  /* ======================================================================
   * Auth and session
   * ==================================================================== */

  function getSession() {
    const s = get(KEYS.session, null);
    return s && typeof s === 'object' ? s : null;
  }

  /** Returns {role, name, student?} or null. Clears stale student sessions. */
  function currentUser() {
    const session = getSession();
    if (!session) return null;
    if (session.role === 'admin') return { role: 'admin', name: 'Administrator' };
    if (session.role === 'student') {
      const student = getStudents().find(function (s) { return s.id === session.studentId; });
      if (student) return { role: 'student', name: student.name, student: student };
    }
    remove(KEYS.session); // account deleted or session corrupted
    return null;
  }

  function loginStudent(email, password) {
    const normalized = email.trim().toLowerCase();
    const student = getStudents().find(function (s) { return s.email === normalized; });
    if (!student || student.password !== password) return null;
    set(KEYS.session, { role: 'student', studentId: student.id });
    return student;
  }

  function loginAdmin(username, password) {
    if (username.trim() !== ADMIN.username || password !== ADMIN.password) return false;
    set(KEYS.session, { role: 'admin' });
    return true;
  }

  function logout() {
    remove(KEYS.session);
    setFlash('You have been logged out.');
    window.location.href = 'index.html';
  }

  /** Guard for protected pages. Returns the user, or redirects to login and returns null. */
  function requireRole(role) {
    const user = currentUser();
    if (user && user.role === role) {
      document.body.classList.add('auth-ok');
      return user;
    }
    const target = role === 'admin' ? 'admin.html' : 'dashboard.html';
    setFlash(role === 'admin'
      ? 'Please log in as the administrator to open the admin panel.'
      : 'Please log in as a student to view your dashboard.', 'error');
    window.location.replace('login.html?role=' + role + '&next=' + target);
    return null;
  }

  /* ======================================================================
   * Events domain helpers
   * ==================================================================== */

  function sortedEvents() {
    return getEvents().slice().sort(function (a, b) {
      return (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time);
    });
  }

  function isPast(event) {
    return String(event.date) < todayISO();
  }

  function seatsTaken(eventId, students) {
    return (students || getStudents()).filter(function (s) {
      return s.eventIds.indexOf(eventId) !== -1;
    }).length;
  }

  /** join=true signs up, join=false cancels. Returns true when the change was saved. */
  function changeSignup(eventId, join) {
    const user = currentUser();
    if (!user || user.role !== 'student') {
      setFlash('Please log in as a student to sign up for events.', 'error');
      window.location.href = 'login.html?next=events.html';
      return false;
    }
    const students = getStudents();
    const student = students.find(function (s) { return s.id === user.student.id; });
    const event = getEvents().find(function (e) { return e.id === eventId; });
    if (!student || !event) {
      toast('That event is no longer available.', 'error');
      return false;
    }
    if (join) {
      if (student.eventIds.indexOf(eventId) !== -1) return true;
      if (isPast(event)) {
        toast('This event has already taken place.', 'error');
        return false;
      }
      if (seatsTaken(eventId, students) >= Number(event.capacity)) {
        toast('Sorry, "' + event.title + '" is full.', 'error');
        return false;
      }
      student.eventIds.push(eventId);
      saveStudents(students);
      toast('You are signed up for "' + event.title + '".');
    } else {
      student.eventIds = student.eventIds.filter(function (id) { return id !== eventId; });
      saveStudents(students);
      toast('Your sign-up for "' + event.title + '" was cancelled.');
    }
    return true;
  }

  function metaItem(label, value) {
    return el('li', {}, [el('span', { className: 'meta-label', text: label + ': ' }), value]);
  }

  /** Build an event card. opts.compact = home page card with a link instead of sign-up actions. */
  function eventCard(event, user, students, opts) {
    const options = opts || {};
    const capacity = Number(event.capacity) || 0;
    const left = Math.max(0, capacity - seatsTaken(event.id, students));
    const past = isPast(event);
    const signedUp = Boolean(user && user.role === 'student' && user.student.eventIds.indexOf(event.id) !== -1);

    let action;
    if (options.compact) {
      action = el('a', { className: 'btn btn-small btn-outline', href: 'events.html', text: 'View on Events page' });
    } else if (!user) {
      action = el('a', { className: 'btn btn-small', href: 'login.html?next=events.html', text: 'Log in to sign up' });
    } else if (user.role === 'admin') {
      action = el('a', { className: 'btn btn-small btn-outline', href: 'admin.html#events', text: 'Manage in admin panel' });
    } else if (signedUp) {
      action = el('button', {
        type: 'button', className: 'btn btn-small btn-outline', text: 'Cancel sign-up',
        'aria-label': 'Cancel sign-up for ' + event.title, dataset: { action: 'cancel', id: event.id }
      });
    } else if (past) {
      action = el('button', { type: 'button', className: 'btn btn-small', disabled: true, text: 'Event ended' });
    } else if (left === 0) {
      action = el('button', { type: 'button', className: 'btn btn-small', disabled: true, text: 'Event full' });
    } else {
      action = el('button', {
        type: 'button', className: 'btn btn-small', text: 'Sign up',
        'aria-label': 'Sign up for ' + event.title, dataset: { action: 'join', id: event.id }
      });
    }

    return el('article', { className: 'card event-card' }, [
      el('div', { className: 'event-card-top' }, [
        el('span', { className: 'badge badge-cat-' + slug(event.category), text: event.category }),
        signedUp ? el('span', { className: 'badge badge-success', text: 'Signed up' }) : null,
        past ? el('span', { className: 'badge badge-muted', text: 'Past' }) : null
      ]),
      el('h3', { className: 'event-title', text: event.title }),
      el('ul', { className: 'event-meta' }, [
        metaItem('When', formatDate(event.date) + ', ' + formatTime(event.time)),
        metaItem('Venue', event.venue),
        metaItem('Seats', left + ' of ' + capacity + ' left')
      ]),
      el('p', { className: 'event-desc', text: event.description }),
      el('div', { className: 'event-card-actions' }, [action])
    ]);
  }

  /* ======================================================================
   * Validation
   * ==================================================================== */

  const check = {
    name: function (v) {
      const x = v.trim();
      if (!x) return 'Full name is required.';
      return RX.name.test(x) ? '' : 'Use 2 to 60 letters. Spaces, apostrophes, dots and hyphens are allowed.';
    },
    email: function (v) {
      const x = v.trim();
      if (!x) return 'Email address is required.';
      return RX.email.test(x) ? '' : 'Enter a valid email address, such as name@example.com.';
    },
    password: function (v) {
      if (!v) return 'Password is required.';
      if (v.length < 8) return 'Password must be at least 8 characters.';
      if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Password must include at least one letter and one number.';
      return '';
    },
    length: function (label, min, max) {
      return function (v) {
        const x = v.trim();
        if (!x) return label + ' is required.';
        if (x.length < min) return label + ' must be at least ' + min + ' characters.';
        if (x.length > max) return label + ' must be at most ' + max + ' characters.';
        return '';
      };
    },
    oneOf: function (list, message) {
      return function (v) { return list.indexOf(v) !== -1 ? '' : message; };
    },
    required: function (label) {
      return function (v) { return v.trim() ? '' : label + ' is required.'; };
    }
  };

  function setFieldError(input, message) {
    const errorEl = document.getElementById(input.id + '-error');
    if (errorEl) errorEl.textContent = message;
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  function setSummary(form, message) {
    const summary = $('.form-summary', form);
    if (!summary) return;
    summary.textContent = message;
    summary.hidden = !message;
  }

  /** rules: array of [inputId, fn(value) -> error message or '']. Returns true when valid. */
  function validate(form, rules) {
    let firstInvalid = null;
    let errors = 0;
    rules.forEach(function (rule) {
      const input = document.getElementById(rule[0]);
      const message = rule[1](input.value) || '';
      setFieldError(input, message);
      if (message) {
        errors += 1;
        if (!firstInvalid) firstInvalid = input;
      }
    });
    setSummary(form, errors ? 'Please fix ' + plural(errors, 'error', 'errors') + ' below.' : '');
    if (firstInvalid) firstInvalid.focus();
    return errors === 0;
  }

  /** Re-check a field as the user fixes it, and on blur once it has a value. */
  function liveValidate(rules) {
    rules.forEach(function (rule) {
      const input = document.getElementById(rule[0]);
      const recheck = function () { setFieldError(input, rule[1](input.value) || ''); };
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', function () {
        if (input.getAttribute('aria-invalid') === 'true') recheck();
      });
      input.addEventListener('blur', function () {
        if (input.value) recheck();
      });
    });
  }

  function clearErrors(form, rules) {
    rules.forEach(function (rule) { setFieldError(document.getElementById(rule[0]), ''); });
    setSummary(form, '');
  }

  /* ======================================================================
   * CSV export
   * ==================================================================== */

  function csvCell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    // Stop spreadsheets from treating the cell as a formula.
    if (/^[=+\-@\t\r]/.test(text)) text = '\'' + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  /** columns: array of {label, value: fn(row)} */
  function toCSV(rows, columns) {
    const lines = [columns.map(function (c) { return csvCell(c.label); }).join(',')];
    rows.forEach(function (row) {
      lines.push(columns.map(function (c) { return csvCell(c.value(row)); }).join(','));
    });
    return lines.join('\r\n');
  }

  function downloadCSV(filename, csv) {
    // The BOM makes Excel read the file as UTF-8.
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: filename, hidden: true });
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ======================================================================
   * Shared UI: navigation, footer, storage warning
   * ==================================================================== */

  function initNav() {
    const user = currentUser();

    $all('[data-auth]').forEach(function (node) {
      const need = node.dataset.auth;
      let show;
      if (need === 'guest') show = !user;
      else if (need === 'user') show = Boolean(user);
      else show = Boolean(user && user.role === need);
      node.hidden = !show;
    });

    const here = currentPageFile();
    $all('.site-nav a').forEach(function (link) {
      if (link.getAttribute('href') === here) link.setAttribute('aria-current', 'page');
    });

    $all('[data-action="logout"]').forEach(function (btn) {
      btn.addEventListener('click', logout);
    });

    const toggle = $('.nav-toggle');
    const nav = $('#site-nav');
    if (!toggle || !nav) return;

    const setOpen = function (open) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      nav.classList.toggle('open', open);
    };
    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        setOpen(false);
        toggle.focus();
      }
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    const wide = window.matchMedia('(min-width: 768px)');
    const onWide = function (e) { if (e.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  function showStorageWarning() {
    const main = $('#main');
    if (!main) return;
    main.prepend(el('div', { className: 'notice notice-error container', role: 'alert' }, [
      'Your browser is blocking local storage, so data will be lost when you leave this page. ',
      'Run the site from a local web server instead (see README.md).'
    ]));
  }

  /* ======================================================================
   * Page: Home
   * ==================================================================== */

  function initHome() {
    const user = currentUser();
    const students = getStudents();
    const upcoming = sortedEvents().filter(function (e) { return !isPast(e); });

    const list = $('#upcoming-events');
    const empty = $('#upcoming-empty');
    if (list) {
      upcoming.slice(0, 3).forEach(function (event) {
        list.append(eventCard(event, user, students, { compact: true }));
      });
    }
    if (empty) empty.hidden = upcoming.length > 0;

    const statEvents = $('#home-stat-events');
    const statStudents = $('#home-stat-students');
    if (statEvents) statEvents.textContent = String(upcoming.length);
    if (statStudents) statStudents.textContent = String(students.length);

    const greeting = $('#home-greeting');
    if (greeting && user) {
      greeting.textContent = 'Welcome back, ' + user.name + '.';
      greeting.hidden = false;
    }
  }

  /* ======================================================================
   * Page: Register
   * ==================================================================== */

  function initRegister() {
    const form = $('#register-form');
    if (!form) return;
    fillSelect($('#reg-department'), DEPARTMENTS);

    const user = currentUser();
    const notice = $('#register-status');
    if (user && notice) {
      notice.textContent = 'You are logged in as ' + user.name + '. Registering a new student will not log you out.';
      notice.hidden = false;
    }

    const rules = [
      ['reg-name', check.name],
      ['reg-email', function (v) {
        const err = check.email(v);
        if (err) return err;
        const email = v.trim().toLowerCase();
        return getStudents().some(function (s) { return s.email === email; })
          ? 'An account with this email already exists. Try logging in.' : '';
      }],
      ['reg-student-id', function (v) {
        const id = v.trim();
        if (!id) return 'Student ID is required.';
        if (!RX.studentId.test(id)) return 'Use 4 to 12 letters or numbers, with no spaces or symbols.';
        return getStudents().some(function (s) { return String(s.studentId).toUpperCase() === id.toUpperCase(); })
          ? 'This student ID is already registered.' : '';
      }],
      ['reg-department', check.oneOf(DEPARTMENTS, 'Select your department.')],
      ['reg-year', check.oneOf(YEARS, 'Select your year of study.')],
      ['reg-phone', function (v) {
        const digits = v.replace(/[\s-]/g, '');
        if (!digits) return 'Phone number is required.';
        return RX.phone.test(digits) ? '' : 'Enter a 10-digit phone number, digits only.';
      }],
      ['reg-password', check.password],
      ['reg-confirm', function (v) {
        if (!v) return 'Please confirm your password.';
        return v === $('#reg-password').value ? '' : 'Passwords do not match.';
      }]
    ];
    liveValidate(rules);
    form.addEventListener('reset', function () { clearErrors(form, rules); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form, rules)) return;

      const student = {
        id: uid('stu'),
        name: $('#reg-name').value.trim(),
        email: $('#reg-email').value.trim().toLowerCase(),
        password: $('#reg-password').value,
        studentId: $('#reg-student-id').value.trim().toUpperCase(),
        department: $('#reg-department').value,
        year: Number($('#reg-year').value),
        phone: $('#reg-phone').value.replace(/[\s-]/g, ''),
        eventIds: [],
        createdAt: new Date().toISOString()
      };
      const students = getStudents();
      students.push(student);
      saveStudents(students);

      setFlash('Registration successful. Log in with your email and password.', 'success', { email: student.email });
      window.location.href = 'login.html';
    });
  }

  /* ======================================================================
   * Page: Login
   * ==================================================================== */

  function initLogin(flash) {
    const form = $('#login-form');
    if (!form) return;
    const params = new URLSearchParams(window.location.search);
    const idInput = $('#login-id');
    const idLabel = $('label[for="login-id"]');
    const pwInput = $('#login-password');
    const studentHint = $('#login-hint-student');
    const adminHint = $('#login-hint-admin');
    const radios = $all('input[name="role"]', form);

    const rulesFor = function (role) {
      return [
        ['login-id', role === 'admin' ? check.required('Username') : check.email],
        ['login-password', check.required('Password')]
      ];
    };
    const selectedRole = function () {
      const r = radios.find(function (x) { return x.checked; });
      return r ? r.value : 'student';
    };

    const applyRole = function (role) {
      const admin = role === 'admin';
      idLabel.textContent = admin ? 'Admin username' : 'Email address';
      idInput.type = admin ? 'text' : 'email';
      idInput.setAttribute('autocomplete', admin ? 'username' : 'email');
      idInput.placeholder = admin ? 'admin' : 'name@example.com';
      studentHint.hidden = admin;
      adminHint.hidden = !admin;
      clearErrors(form, rulesFor(role));
    };

    const initialRole = params.get('role') === 'admin' ? 'admin' : 'student';
    radios.forEach(function (r) {
      r.checked = r.value === initialRole;
      r.addEventListener('change', function () {
        if (r.checked) applyRole(r.value);
      });
    });
    applyRole(initialRole);

    if (flash && flash.email && initialRole === 'student') {
      idInput.value = flash.email;
      pwInput.focus();
    }

    const user = currentUser();
    const notice = $('#login-status');
    if (user && notice) {
      notice.textContent = 'You are already logged in as ' + user.name + '. Logging in again will switch accounts.';
      notice.hidden = false;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const role = selectedRole();
      if (!validate(form, rulesFor(role))) return;

      let name;
      if (role === 'admin') {
        if (!loginAdmin(idInput.value, pwInput.value)) {
          setSummary(form, 'Incorrect admin username or password.');
          pwInput.value = '';
          pwInput.focus();
          return;
        }
        name = 'Administrator';
      } else {
        const student = loginStudent(idInput.value, pwInput.value);
        if (!student) {
          setSummary(form, 'Incorrect email or password.');
          pwInput.value = '';
          pwInput.focus();
          return;
        }
        name = student.name;
      }

      const allowed = role === 'admin' ? ['admin.html'] : ['dashboard.html', 'events.html', 'enquiry.html'];
      const next = params.get('next');
      const destination = allowed.indexOf(next) !== -1 ? next : allowed[0];
      setFlash('Welcome, ' + name + '!');
      window.location.href = destination;
    });
  }

  /* ======================================================================
   * Page: Events
   * ==================================================================== */

  function initEvents() {
    const list = $('#event-list');
    const search = $('#event-search');
    const category = $('#event-category');
    const count = $('#event-count');
    const empty = $('#event-empty');
    if (!list) return;
    fillSelect(category, EVENT_CATEGORIES);

    const render = function () {
      const q = search.value.trim().toLowerCase();
      const c = category.value;
      const user = currentUser();
      const students = getStudents();
      const events = sortedEvents().filter(function (e) {
        const matchesText = !q || String(e.title).toLowerCase().indexOf(q) !== -1 ||
          String(e.venue).toLowerCase().indexOf(q) !== -1;
        return matchesText && (!c || e.category === c);
      });
      clear(list);
      events.forEach(function (e) { list.append(eventCard(e, user, students)); });
      empty.hidden = events.length > 0;
      count.textContent = 'Showing ' + plural(events.length, 'event', 'events') + '.';
    };

    $('#event-filters').addEventListener('submit', function (e) { e.preventDefault(); });
    search.addEventListener('input', render);
    category.addEventListener('change', render);
    $('#event-reset').addEventListener('click', function () {
      search.value = '';
      category.value = '';
      render();
      search.focus();
    });

    list.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!changeSignup(id, btn.dataset.action === 'join')) return;
      render();
      const again = list.querySelector('button[data-id="' + CSS.escape(id) + '"]');
      if (again) again.focus();
    });

    render();
  }

  /* ======================================================================
   * Page: Enquiry
   * ==================================================================== */

  function initEnquiry() {
    const form = $('#enquiry-form');
    if (!form) return;
    fillSelect($('#enq-category'), ENQUIRY_CATEGORIES);

    const nameInput = $('#enq-name');
    const emailInput = $('#enq-email');
    const message = $('#enq-message');
    const counter = $('#enq-message-count');
    const success = $('#enquiry-success');

    const prefill = function () {
      const user = currentUser();
      if (user && user.role === 'student') {
        nameInput.value = user.student.name;
        emailInput.value = user.student.email;
        nameInput.readOnly = true;
        emailInput.readOnly = true;
        $('#enquiry-prefill-note').hidden = false;
      }
    };
    const updateCounter = function () {
      counter.textContent = message.value.length + ' / 1000 characters';
    };

    const rules = [
      ['enq-name', check.name],
      ['enq-email', check.email],
      ['enq-subject', check.length('Subject', 3, 100)],
      ['enq-category', check.oneOf(ENQUIRY_CATEGORIES, 'Select a category.')],
      ['enq-message', check.length('Message', 20, 1000)]
    ];
    liveValidate(rules);
    message.addEventListener('input', updateCounter);
    prefill();
    updateCounter();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(form, rules)) return;

      const enquiry = {
        id: uid('enq'),
        name: nameInput.value.trim(),
        email: emailInput.value.trim().toLowerCase(),
        subject: $('#enq-subject').value.trim(),
        category: $('#enq-category').value,
        message: message.value.trim(),
        status: 'Open',
        createdAt: new Date().toISOString()
      };
      const enquiries = getEnquiries();
      enquiries.push(enquiry);
      saveEnquiries(enquiries);

      form.reset();
      prefill();
      updateCounter();
      $('#enquiry-ref').textContent = enquiry.id.toUpperCase();
      success.hidden = false;
      success.focus();
      toast('Your enquiry was submitted.');
    });
  }

  /* ======================================================================
   * Page: Student dashboard
   * ==================================================================== */

  function initDashboard() {
    if (!requireRole('student')) return;
    const eventsList = $('#my-events');

    const render = function () {
      const user = currentUser();
      if (!user || user.role !== 'student') {
        requireRole('student');
        return;
      }
      const student = user.student;
      $('#welcome-name').textContent = student.name;

      // Profile
      const profile = $('#profile-details');
      clear(profile);
      [
        ['Name', student.name],
        ['Email', student.email],
        ['Student ID', student.studentId],
        ['Department', student.department],
        ['Year of study', 'Year ' + student.year],
        ['Phone', student.phone],
        ['Registered on', formatTimestamp(student.createdAt)]
      ].forEach(function (row) {
        profile.append(el('div', { className: 'profile-row' }, [
          el('dt', { text: row[0] }), el('dd', { text: row[1] })
        ]));
      });

      // My events
      const myEvents = sortedEvents().filter(function (e) { return student.eventIds.indexOf(e.id) !== -1; });
      clear(eventsList);
      myEvents.forEach(function (e) {
        eventsList.append(el('li', { className: 'list-item' }, [
          el('div', { className: 'list-item-body' }, [
            el('h3', { className: 'list-item-title', text: e.title }),
            el('p', { className: 'muted small', text: formatDate(e.date) + ', ' + formatTime(e.time) + ' \u00b7 ' + e.venue }),
            isPast(e) ? el('span', { className: 'badge badge-muted', text: 'Past' }) : null
          ]),
          el('button', {
            type: 'button', className: 'btn btn-small btn-outline', text: 'Cancel',
            'aria-label': 'Cancel sign-up for ' + e.title, dataset: { action: 'cancel', id: e.id }
          })
        ]));
      });
      $('#my-events-empty').hidden = myEvents.length > 0;

      // My enquiries (matched by email)
      const myEnquiries = getEnquiries()
        .filter(function (q) { return q.email === student.email; })
        .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      const enquiryList = $('#my-enquiries');
      clear(enquiryList);
      myEnquiries.forEach(function (q) {
        const resolved = q.status === 'Resolved';
        enquiryList.append(el('li', { className: 'list-item list-item-stack' }, [
          el('div', { className: 'list-item-head' }, [
            el('h3', { className: 'list-item-title', text: q.subject }),
            el('span', { className: 'badge ' + (resolved ? 'badge-success' : 'badge-warning'), text: resolved ? 'Resolved' : 'Open' })
          ]),
          el('p', { className: 'muted small', text: q.category + ' \u00b7 submitted ' + formatTimestamp(q.createdAt) }),
          el('details', {}, [
            el('summary', { text: 'View message' }),
            el('p', { className: 'pre-wrap', text: q.message })
          ])
        ]));
      });
      $('#my-enquiries-empty').hidden = myEnquiries.length > 0;

      // Stats
      $('#stat-my-events').textContent = String(myEvents.length);
      $('#stat-my-open').textContent = String(myEnquiries.filter(function (q) { return q.status !== 'Resolved'; }).length);
      $('#stat-my-resolved').textContent = String(myEnquiries.filter(function (q) { return q.status === 'Resolved'; }).length);
    };

    eventsList.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action="cancel"]');
      if (!btn) return;
      if (changeSignup(btn.dataset.id, false)) {
        render();
        $('#my-events-heading').focus();
      }
    });

    render();
  }

  /* ======================================================================
   * Page: Admin
   * ==================================================================== */

  function initTabs() {
    const tabs = $all('[role="tab"]');
    if (!tabs.length) return;
    const select = function (tab, focus) {
      tabs.forEach(function (t) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        let j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        if (j !== null) {
          e.preventDefault();
          select(tabs[j], true);
        }
      });
    });
    const hash = window.location.hash.slice(1);
    const fromHash = tabs.find(function (t) { return t.getAttribute('aria-controls') === 'panel-' + hash; });
    select(fromHash || tabs[0]);
  }

  function td(text, className) {
    return el('td', { className: className, text: text });
  }

  function initAdmin() {
    if (!requireRole('admin')) return;
    initTabs();
    fillSelect($('#ev-category'), EVENT_CATEGORIES);
    $('#ev-date').min = todayISO();

    const studentSearch = $('#students-search');
    const enquirySearch = $('#enquiries-search');
    const enquiryStatus = $('#enquiries-status');

    const filteredStudents = function () {
      const q = studentSearch.value.trim().toLowerCase();
      return getStudents()
        .filter(function (s) {
          return !q || [s.name, s.email, s.studentId, s.department, s.phone].some(function (f) {
            return String(f).toLowerCase().indexOf(q) !== -1;
          });
        })
        .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    };

    const filteredEnquiries = function () {
      const q = enquirySearch.value.trim().toLowerCase();
      const status = enquiryStatus.value;
      return getEnquiries()
        .filter(function (x) {
          const matchesText = !q || [x.name, x.email, x.subject, x.category, x.message].some(function (f) {
            return String(f).toLowerCase().indexOf(q) !== -1;
          });
          return matchesText && (!status || x.status === status);
        })
        .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    };

    const renderStats = function () {
      const students = getStudents();
      const enquiries = getEnquiries();
      $('#stat-students').textContent = String(students.length);
      $('#stat-open').textContent = String(enquiries.filter(function (q) { return q.status !== 'Resolved'; }).length);
      $('#stat-events').textContent = String(getEvents().length);
      $('#stat-signups').textContent = String(students.reduce(function (sum, s) { return sum + s.eventIds.length; }, 0));
    };

    const renderStudents = function () {
      const rows = filteredStudents();
      const eventIds = getEvents().map(function (e) { return e.id; });
      const body = $('#students-body');
      clear(body);
      rows.forEach(function (s) {
        const count = s.eventIds.filter(function (id) { return eventIds.indexOf(id) !== -1; }).length;
        body.append(el('tr', {}, [
          td(s.name), td(s.studentId), td(s.email), td(s.department), td('Year ' + s.year), td(s.phone),
          td(String(count), 'num'), td(formatTimestamp(s.createdAt), 'nowrap'),
          el('td', {}, [el('button', {
            type: 'button', className: 'btn btn-small btn-danger', text: 'Delete',
            'aria-label': 'Delete ' + s.name, dataset: { action: 'delete-student', id: s.id }
          })])
        ]));
      });
      $('#students-empty').hidden = rows.length > 0;
      $('#students-count').textContent = 'Showing ' + rows.length + ' of ' + plural(getStudents().length, 'registration', 'registrations') + '.';
    };

    const renderEnquiries = function () {
      const rows = filteredEnquiries();
      const body = $('#enquiries-body');
      clear(body);
      rows.forEach(function (q) {
        const resolved = q.status === 'Resolved';
        body.append(el('tr', {}, [
          td(formatTimestamp(q.createdAt), 'nowrap'), td(q.name), td(q.email), td(q.category), td(q.subject),
          td(q.message, 'cell-message pre-wrap'),
          el('td', {}, [el('span', { className: 'badge ' + (resolved ? 'badge-success' : 'badge-warning'), text: resolved ? 'Resolved' : 'Open' })]),
          el('td', {}, [el('button', {
            type: 'button', className: 'btn btn-small ' + (resolved ? 'btn-outline' : ''),
            text: resolved ? 'Reopen' : 'Mark resolved',
            'aria-label': (resolved ? 'Reopen enquiry: ' : 'Mark resolved: ') + q.subject,
            dataset: { action: 'toggle-enquiry', id: q.id }
          })])
        ]));
      });
      $('#enquiries-empty').hidden = rows.length > 0;
      $('#enquiries-count').textContent = 'Showing ' + rows.length + ' of ' + plural(getEnquiries().length, 'enquiry', 'enquiries') + '.';
    };

    const renderEvents = function () {
      const students = getStudents();
      const rows = sortedEvents();
      const body = $('#events-body');
      clear(body);
      rows.forEach(function (e) {
        body.append(el('tr', {}, [
          td(e.title), td(e.category), td(formatDate(e.date), 'nowrap'), td(formatTime(e.time), 'nowrap'), td(e.venue),
          td(seatsTaken(e.id, students) + ' / ' + e.capacity, 'num'),
          el('td', {}, [el('button', {
            type: 'button', className: 'btn btn-small btn-danger', text: 'Delete',
            'aria-label': 'Delete event ' + e.title, dataset: { action: 'delete-event', id: e.id }
          })])
        ]));
      });
      $('#events-empty').hidden = rows.length > 0;
    };

    const renderAll = function () {
      renderStats();
      renderStudents();
      renderEnquiries();
      renderEvents();
    };

    studentSearch.addEventListener('input', renderStudents);
    enquirySearch.addEventListener('input', renderEnquiries);
    enquiryStatus.addEventListener('change', renderEnquiries);
    $all('form[role="search"]').forEach(function (f) {
      f.addEventListener('submit', function (e) { e.preventDefault(); });
    });

    // Delete a student (their sign-ups live on the record, so they go too).
    $('#students-body').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action="delete-student"]');
      if (!btn) return;
      const students = getStudents();
      const student = students.find(function (s) { return s.id === btn.dataset.id; });
      if (!student) return;
      if (!window.confirm('Delete ' + student.name + ' (' + student.studentId + ')?\n\nTheir event sign-ups will also be removed. This cannot be undone.')) return;
      saveStudents(students.filter(function (s) { return s.id !== student.id; }));
      renderAll();
      studentSearch.focus();
      toast('Deleted registration for ' + student.name + '.');
    });

    // Toggle enquiry status.
    $('#enquiries-body').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action="toggle-enquiry"]');
      if (!btn) return;
      const enquiries = getEnquiries();
      const enquiry = enquiries.find(function (q) { return q.id === btn.dataset.id; });
      if (!enquiry) return;
      enquiry.status = enquiry.status === 'Resolved' ? 'Open' : 'Resolved';
      saveEnquiries(enquiries);
      renderStats();
      renderEnquiries();
      const again = $('#enquiries-body').querySelector('button[data-id="' + CSS.escape(enquiry.id) + '"]');
      if (again) again.focus();
      toast('Enquiry marked ' + enquiry.status + '.');
    });

    // Delete an event and remove it from every student's sign-ups.
    $('#events-body').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-action="delete-event"]');
      if (!btn) return;
      const events = getEvents();
      const event = events.find(function (x) { return x.id === btn.dataset.id; });
      if (!event) return;
      const students = getStudents();
      const affected = seatsTaken(event.id, students);
      if (!window.confirm('Delete "' + event.title + '"?\n\n' + plural(affected, 'student sign-up', 'student sign-ups') + ' will be removed. This cannot be undone.')) return;
      saveEvents(events.filter(function (x) { return x.id !== event.id; }));
      students.forEach(function (s) {
        s.eventIds = s.eventIds.filter(function (id) { return id !== event.id; });
      });
      saveStudents(students);
      renderAll();
      toast('Deleted event "' + event.title + '".');
    });

    // Add event.
    const eventForm = $('#event-form');
    const eventRules = [
      ['ev-title', check.length('Title', 3, 80)],
      ['ev-category', check.oneOf(EVENT_CATEGORIES, 'Select a category.')],
      ['ev-date', function (v) {
        if (!v) return 'Date is required.';
        if (!isValidISODate(v)) return 'Enter a valid date.';
        return v < todayISO() ? 'The date cannot be in the past.' : '';
      }],
      ['ev-time', function (v) {
        if (!v) return 'Time is required.';
        return RX.time.test(v) ? '' : 'Enter a valid time, such as 14:30.';
      }],
      ['ev-venue', check.length('Venue', 2, 80)],
      ['ev-capacity', function (v) {
        const x = v.trim();
        if (!x) return 'Capacity is required.';
        if (!RX.integer.test(x)) return 'Capacity must be a whole number.';
        const n = Number(x);
        return n >= 1 && n <= 1000 ? '' : 'Capacity must be between 1 and 1000.';
      }],
      ['ev-description', check.length('Description', 10, 500)]
    ];
    liveValidate(eventRules);
    eventForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(eventForm, eventRules)) return;
      const event = {
        id: uid('evt'),
        title: $('#ev-title').value.trim(),
        category: $('#ev-category').value,
        date: $('#ev-date').value,
        time: $('#ev-time').value,
        venue: $('#ev-venue').value.trim(),
        capacity: Number($('#ev-capacity').value.trim()),
        description: $('#ev-description').value.trim()
      };
      const events = getEvents();
      events.push(event);
      saveEvents(events);
      eventForm.reset();
      clearErrors(eventForm, eventRules);
      renderAll();
      $('#ev-title').focus();
      toast('Added event "' + event.title + '".');
    });

    // CSV export of the current filtered view. Passwords are never exported.
    const stamp = function () { return todayISO(); };
    $('#students-export').addEventListener('click', function () {
      const rows = filteredStudents();
      if (!rows.length) {
        toast('There are no registrations to export.', 'error');
        return;
      }
      const titles = {};
      getEvents().forEach(function (e) { titles[e.id] = e.title; });
      downloadCSV('registrations-' + stamp() + '.csv', toCSV(rows, [
        { label: 'Name', value: function (s) { return s.name; } },
        { label: 'Student ID', value: function (s) { return s.studentId; } },
        { label: 'Email', value: function (s) { return s.email; } },
        { label: 'Department', value: function (s) { return s.department; } },
        { label: 'Year', value: function (s) { return s.year; } },
        { label: 'Phone', value: function (s) { return s.phone; } },
        { label: 'Events', value: function (s) {
          return s.eventIds.map(function (id) { return titles[id]; }).filter(Boolean).join('; ');
        } },
        { label: 'Registered at', value: function (s) { return s.createdAt; } }
      ]));
      toast('Exported ' + plural(rows.length, 'registration', 'registrations') + '.');
    });
    $('#enquiries-export').addEventListener('click', function () {
      const rows = filteredEnquiries();
      if (!rows.length) {
        toast('There are no enquiries to export.', 'error');
        return;
      }
      downloadCSV('enquiries-' + stamp() + '.csv', toCSV(rows, [
        { label: 'Reference', value: function (q) { return q.id.toUpperCase(); } },
        { label: 'Submitted at', value: function (q) { return q.createdAt; } },
        { label: 'Name', value: function (q) { return q.name; } },
        { label: 'Email', value: function (q) { return q.email; } },
        { label: 'Category', value: function (q) { return q.category; } },
        { label: 'Subject', value: function (q) { return q.subject; } },
        { label: 'Message', value: function (q) { return q.message; } },
        { label: 'Status', value: function (q) { return q.status; } }
      ]));
      toast('Exported ' + plural(rows.length, 'enquiry', 'enquiries') + '.');
    });

    renderAll();
  }

  /* ======================================================================
   * Boot
   * ==================================================================== */

  const PAGE_INITS = {
    home: initHome,
    register: initRegister,
    login: initLogin,
    events: initEvents,
    enquiry: initEnquiry,
    dashboard: initDashboard,
    admin: initAdmin
  };

  function boot() {
    storageAvailable = checkStorage();
    seedEvents();
    initNav();

    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());

    if (!storageAvailable) showStorageWarning();

    const flash = takeFlash();
    if (flash && flash.message) toast(flash.message, flash.type);

    const init = PAGE_INITS[document.body.dataset.page];
    if (init) init(flash);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
