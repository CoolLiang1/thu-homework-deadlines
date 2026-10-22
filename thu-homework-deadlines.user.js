// ==UserScript==
// @name         清华网络学堂：课程内嵌作业 DDL（候选版）
// @namespace    local.thu-homework-deadlines
// @version      0.4.0
// @description  课程标题同行显示最近未来未交DDL；紧凑日期标签，超过72小时逾期隐藏。0.4.0标题同行修订。
// @match        https://learn.tsinghua.edu.cn/f/wlxt/index/course/student/
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==
/* DOM evidence: user-supplied Elements screenshots. No denied API calls,
 * cookie/token/password access or external dependency. Real-session access and
 * geometry remain unverified. Normal same-origin pages may disallow embedding.
 */
(function () {
  'use strict';
  const ORIGIN = 'https://learn.tsinghua.edu.cn';
  const HOME = '/f/wlxt/index/course/student/';
  const HOUR = 3600000;
  class DataError extends Error { constructor(code, message) { super(message); this.name = 'DataError'; this.code = code; } }
  function id(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new DataError('COURSE', '课程标识缺失或无效。'); return value; }
  function parseDeadline(value) {
    if (value === null || value === undefined || value === '') return { ms: null, reason: '未提供截止时间' };
    if (typeof value === 'number' || (typeof value === 'string' && /^\d{13}$/.test(value))) {
      const ms = Number(value);
      if (Number.isSafeInteger(ms) && ms >= Date.UTC(2000, 0, 1) && ms < Date.UTC(2101, 0, 1)) {
        return { ms, reason: '', zone: 'epoch-ms' };
      }
      return { ms: null, reason: '时间戳格式不明确' };
    }
    if (typeof value !== 'string') return { ms: null, reason: '截止时间格式不支持' };
    const text = value.trim();
    if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(text)) return { ms: null, reason: '仅提供日期，具体截止时刻未明确' };
    const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(text);
    if (!match) return { ms: null, reason: '无法解析截止时间' };
    const [, yy, mo, dd, hh, mi, ss = '0', fraction = '0', zone] = match;
    const [y, m, d, h, minute, second] = [yy, mo, dd, hh, mi, ss].map(Number);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || minute > 59 || second > 59) {
      return { ms: null, reason: '截止时间含无效日期或时刻' };
    }
    const base = Date.UTC(y, m - 1, d, h, minute, second, Number(fraction.padEnd(3, '0')));
    const check = new Date(base);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      return { ms: null, reason: '截止时间含无效日期' };
    }
    let offset = 8 * 60;
    if (zone === 'Z') offset = 0;
    else if (zone) {
      const pieces = /^([+-])(\d{2}):?(\d{2})$/.exec(zone);
      const zh = Number(pieces[2]); const zm = Number(pieces[3]);
      if (zh > 14 || zm > 59 || (zh === 14 && zm !== 0)) return { ms: null, reason: '时区偏移无效' };
      offset = (pieces[1] === '+' ? 1 : -1) * (zh * 60 + zm);
    }
    return { ms: base - offset * 60000, reason: '', zone: zone || 'assumed-Asia/Shanghai' };
  }

  function urgency(ms, now) {
    if (!Number.isFinite(ms)) return { level: 'unknown', text: '截止时间待核对' };
    const delta = ms - now;
    if (delta < 0) return { level: 'red', text: '已逾期' };
    if (delta === 0) return { level: 'red', text: '已到截止时间' };
    if (delta <= 24 * HOUR) return { level: 'red', text: '24 小时内截止' };
    if (delta <= 72 * HOUR) return { level: 'orange', text: '72 小时内截止' };
    if (delta <= 168 * HOUR) return { level: 'yellow', text: '7 天内截止' };
    return { level: 'normal', text: '7 天后截止' };
  }

  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function formatDeadline(ms) { return dateFormatter.format(new Date(ms)) + '（北京时间）'; }
  function visibleTasks(tasks, showSubmitted) {
    return tasks.filter(task => showSubmitted || !['submitted', 'graded'].includes(task.status))
      .slice().sort((a, b) => (a.deadline.ms ?? Infinity) - (b.deadline.ms ?? Infinity) || a.title.localeCompare(b.title, 'zh-CN'));
  }

  const PAGE = '/f/wlxt/kczy/zy/student/beforePageList';
  const STATES = { unsubmitted: '未提交', submitted: '已提交未批改', graded: '已批改' };
  function fail(code, message) { return new DataError(code, message); }
  function errorText(error) { return error instanceof DataError ? error.message + '〔' + error.code + '〕' : '读取异常，未确认作业情况。〔RUNTIME〕'; }
  function pageLink(raw, origin = ORIGIN) {
    const url = new URL(raw, origin);
    if (url.origin !== origin || url.pathname !== PAGE || url.hash || [...url.searchParams.keys()].some(key => key !== 'wlkcid')) {
      throw fail('LINK', '原作业链接不符合已核实的正常页面路径，已停止读取。');
    }
    const courseId = id(url.searchParams.get('wlkcid'));
    if (url.searchParams.getAll('wlkcid').length !== 1) throw fail('LINK', '课程标识重复，已停止读取。');
    return { courseId, url: url.href };
  }
  function findCourseSlots(doc, origin = ORIGIN) {
    const root = doc.getElementById('selfcourse');
    if (!root) return [];
    const slots = [];
    for (const card of root.querySelectorAll(':scope > .item')) {
      const marker = card.querySelector('ul.state.stu span.name.zuoye');
      const link = marker?.closest('a[href]'); const slot = link?.closest('li');
      if (!marker || !link || !slot || !card.contains(slot)) continue;
      try {
        const parsed = pageLink(link.getAttribute('href'), origin);
        const countText = link.querySelector('span.stud')?.textContent || '';
        const match = /\d+/.exec(countText);
        slots.push({ card, slot, marker, link, ...parsed, nativeCount: match ? Number(match[0]) : null });
      } catch { slots.push({ card, slot, marker, link, courseId: null, url: null, nativeCount: null }); }
    }
    return slots;
  }
  function normalizedHeader(text) { return text.replace(/[\s\u00a0]/g, '').replace(/（/g, '(').replace(/）/g, ')').toUpperCase(); }
  function columnsOf(table) {
    const headers = [...table.querySelectorAll('thead th')].map(node => normalizedHeader(node.textContent));
    const title = headers.indexOf('作业题目'); const deadline = headers.indexOf('截止日期(GMT+8)');
    if (title < 0 || deadline < 0) return null;
    return { title, deadline, completion: headers.indexOf('完成方式'), count: headers.length };
  }
  function isShown(node, win) {
    for (let current = node; current && current.nodeType === 1; current = current.parentElement) {
      const css = win.getComputedStyle(current);
      if (current.hidden || css.display === 'none' || css.visibility === 'hidden') return false;
    }
    return true;
  }
  function parseRows(rows, columns, courseId, source, start = 0) {
    const tasks = [];
    for (const row of rows) {
      const cells = [...row.cells];
      if (!cells.length || cells.some(cell => cell.classList.contains('dataTables_empty'))) continue;
      if (cells.length < columns.count || cells.some(cell => cell.colSpan > 1)) throw fail('ROWS', '表格行结构改变，未完整读取。');
      const title = cells[columns.title].textContent.trim();
      if (!title) throw fail('ROWS', '作业标题缺失，未完整读取。');
      tasks.push({ id: source + '-' + (start + tasks.length), courseId, title, status: source,
        deadline: parseDeadline(cells[columns.deadline].textContent.trim()),
        offline: false });
    }
    return tasks;
  }
  function readTotal(infoNode) {
    const text = (infoNode?.textContent || '').replace(/\s/g, '');
    const match = /共([\d,]+)条(?:数据)?/.exec(text);
    return match ? Number(match[1].replace(/,/g, '')) : null;
  }
  function dataTableApi(table, win) {
    const $ = win.jQuery;
    try {
      if ($?.fn?.dataTable?.isDataTable?.(table)) return $(table).DataTable();
    } catch {}
    return null;
  }
  function snapshot(doc, win, courseId, source) {
    const candidates = [...doc.querySelectorAll('table')].filter(table => table.tBodies.length && columnsOf(table) && isShown(table, win));
    const completed = candidates.filter(node => node.id !== 'wtj');
    const table = source === 'unsubmitted' ? candidates.find(node => node.id === 'wtj') : completed.length === 1 ? completed[0] : null;
    if (!table) return null;
    const columns = columnsOf(table); const api = dataTableApi(table, win);
    let info = null; let total = readTotal(doc.getElementById(table.id + '_info')); let allNodes = null; let confirmedEmpty = false;
    if (api) {
      try {
        info = api.page.info();
        if (!Number.isSafeInteger(info.recordsTotal) || info.recordsTotal < 0 || !Number.isSafeInteger(info.recordsDisplay) || info.recordsDisplay < 0) throw Error();
        total = info.recordsTotal;
        if (!info.serverSide) allNodes = api.rows({ page: 'all', search: 'none' }).nodes().toArray();
        // This is the native table's last RESPONSE getter, never a request or auth getter.
        const json = api.ajax?.json?.();
        confirmedEmpty = total === 0 && json?.result === 'success' && Array.isArray(json.object?.aaData) && json.object.aaData.length === 0;
      } catch { info = null; allNodes = null; }
    }
    const rows = [...table.tBodies[0].rows];
    const tasks = parseRows(rows, columns, courseId, source, info?.start || 0);
    const processing = [...doc.querySelectorAll('.dataTables_processing')].some(node => isShown(node, win));
    return { table, columns, api, info, total, allNodes, tasks, confirmedEmpty, processing,
      signature: table.id + '|' + total + '|' + (info?.page ?? '') + '|' + tasks.map(task => task.title + ':' + task.deadline.ms).join('|') };
  }
  function safePageCheck(doc, win, expectedId, origin) {
    try {
      if (win.location.protocol === 'about:') throw fail('FRAME', '正常页面未能嵌入，已停止读取；不改变浏览器安全设置。');
      if (win.location.origin !== origin || win.location.pathname !== PAGE) throw fail('LOGIN', '正常作业页面发生跳转，已停止读取，请在原站核对登录。');
      if (new URLSearchParams(win.location.search).get('wlkcid') !== expectedId) throw fail('COURSE', '页面课程标识不一致，已停止读取。');
    } catch (error) { if (error instanceof DataError) throw error; throw fail('FRAME', '无法读取同源正常页面，可能登录跳转或页面禁止嵌入。'); }
    const heading = (doc.title || '') + ' ' + (doc.querySelector('h1')?.textContent || '');
    if (/\b403\b|Access Denied|Forbidden/i.test(heading)) throw fail('ACCESS', '正常页面返回访问拒绝，已暂停；不会重试或绕过。');
    if (/您未登录|登录超时|登录失效/.test(heading)) throw fail('LOGIN', '正常页面提示登录失效，已暂停读取。');
  }
  const fatalCodes = new Set(['ACCESS', 'LOGIN', 'FRAME']);
  function createSession(doc, win, courseId, origin, options = {}) {
    const settings = { timeout: 20000, poll: 200, stable: 500, maxPages: 50, maxRows: 1500, ...options };
    const events = { epoch: 0, initialized: new Set(), error: null };
    let attached = false;
    function watch() {
      if (attached || !win.jQuery) return;
      attached = true; const $ = win.jQuery;
      $(doc).on('draw.dt.thuDDL', () => { events.epoch++; });
      $(doc).on('init.dt.thuDDL', event => { events.initialized.add(event.target); events.epoch++; });
      // Inspect status numbers only. No request URL/body/header or token access.
      $(doc).on('xhr.dt.thuDDL', (_event, _settings, _json, xhr) => {
        if (xhr?.status === 403 || xhr?.status === 401) events.error = fail(xhr.status === 403 ? 'ACCESS' : 'LOGIN', '原站正常列表请求被拒绝（HTTP ' + xhr.status + '），已暂停读取。');
      });
      $(doc).on('ajaxError.thuDDL', (_event, xhr) => {
        if (xhr?.status === 403 || xhr?.status === 401) events.error = fail(xhr.status === 403 ? 'ACCESS' : 'LOGIN', '原站正常页面请求被拒绝（HTTP ' + xhr.status + '），已暂停读取。');
        else events.error = fail('NETWORK', '原站正常页面请求失败，未完整读取。');
      });
    }
    const delay = ms => new Promise(resolve => win.setTimeout(resolve, ms));
    async function wait(source, after = null) {
      const until = Date.now() + settings.timeout; let previous = ''; let stableSince = 0; let last = null;
      while (Date.now() < until) {
        safePageCheck(doc, win, courseId, origin); watch(); if (events.error) throw events.error;
        const state = snapshot(doc, win, courseId, source);
        if (state) {
          last = state;
          const transitioned = !after || state.table.id !== after.id || events.epoch > after.epoch;
          const ready = state.tasks.length > 0 || state.confirmedEmpty || (state.total === 0 && events.initialized.has(state.table));
          if (transitioned && ready && !state.processing) {
            if (previous !== state.signature) { previous = state.signature; stableSince = Date.now(); }
            else if (Date.now() - stableSince >= settings.stable) return { ...state, confirmedEmpty: state.confirmedEmpty || (state.total === 0 && events.initialized.has(state.table)) };
          } else { previous = ''; stableSince = 0; }
        }
        await delay(settings.poll);
      }
      if (last?.total === 0 && !last.tasks.length) return { ...last, unconfirmedEmpty: true };
      throw fail('RENDER', '未等到原站表格完成渲染；不能把初始空表当成无作业。');
    }
    function statusButton(source) {
      return [...doc.querySelectorAll('a,button,li,span')].find(node => !node.closest('table') && isShown(node, win) && node.textContent.replace(/[\s|｜]/g, '') === STATES[source]);
    }
    async function select(source) {
      watch(); const current = [...doc.querySelectorAll('table')].find(table => columnsOf(table) && isShown(table, win));
      if (source === 'unsubmitted' && current?.id === 'wtj') return wait(source);
      const control = statusButton(source); if (!control) throw fail('STATUS', '原站状态标签未识别，此类作业未读取。');
      const before = { id: current?.id, epoch: events.epoch }; control.click();
      const state = await wait(source, before);
      if (source !== 'unsubmitted' && state.table.id === before.id) throw fail('STATUS', '状态切换未取得独立表格证据，未将旧记录当成新状态。');
      return state;
    }
    async function read(source, progress = () => {}) {
      let tasks = []; let total = null;
      try {
        let state = await select(source); total = state.total;
        if (state.unconfirmedEmpty) return { tasks, total, complete: false, warning: '列表显示 0 条，但未确认加载完成；不是无作业结论。' };
        if (state.confirmedEmpty && total === 0) return { tasks, total: 0, complete: true };
        if (state.allNodes) {
          const all = parseRows(state.allNodes, state.columns, courseId, source);
          if (all.length === total) return all.length <= settings.maxRows ? { tasks: all, total, complete: true } : {
            tasks: all.slice(0, settings.maxRows), total, complete: false, warning: '超过单类记录读取上限，未完整读取。'
          };
        }
        if (!state.api || !state.info) return { tasks: state.tasks, total, complete: false, warning: '仅当前页；未取得可靠分页元数据，未完整读取。' };
        if (state.info.recordsDisplay !== total) return { tasks: state.tasks, total, complete: false, warning: '原站列表存在筛选条件；未完整读取全部记录。' };
        const pages = state.info.pages;
        if (!Number.isSafeInteger(pages) || pages < 1) throw fail('PAGES', '分页总数无法确认，未完整读取。');
        for (let index = 0; index < pages && index < settings.maxPages; index++) {
          progress(STATES[source] + '：第 ' + (index + 1) + '/' + pages + ' 页');
          if (state.info.page !== index) {
            const before = { id: state.table.id, epoch: events.epoch };
            state.api.page(index).draw('page'); state = await wait(source, before);
          }
          if (state.info?.page !== index || state.total !== total || state.info.pages !== pages) throw fail('PAGES', '分页位置或总数发生变化，未完整读取。');
          tasks.push(...state.tasks);
          if (tasks.length > settings.maxRows) return { tasks: tasks.slice(0, settings.maxRows), total, complete: false, warning: '超过单类记录读取上限，未完整读取。' };
        }
        return { tasks, total, complete: tasks.length === total, warning: tasks.length === total ? '' : '读取数量与总数不一致或达到页数上限，未完整读取。' };
      } catch (error) {
        return { tasks, total, complete: false, warning: errorText(error), fatal: fatalCodes.has(error?.code), code: error?.code };
      }
    }
    return { read, close() { if (attached) win.jQuery(doc).off('.thuDDL'); } };
  }
  async function openPageReader(env, binding, options = {}) {
    const frame = env.document.createElement('iframe'); frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true'); frame.setAttribute('tabindex', '-1');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin'); frame.setAttribute('referrerpolicy', 'same-origin');
    frame.style.width = '1200px'; frame.style.height = '800px';
    let session;
    try {
      await new Promise((resolve, reject) => {
        const timer = env.setTimeout(() => reject(fail('FRAME', '正常作业页面加载超时或禁止嵌入，已停止读取。')), options.timeout || 20000);
        frame.addEventListener('load', () => { env.clearTimeout(timer); resolve(); }, { once: true });
        frame.addEventListener('error', () => { env.clearTimeout(timer); reject(fail('FRAME', '正常作业页面加载失败，已停止读取。')); }, { once: true });
        frame.src = pageLink(binding.url, options.origin || ORIGIN).url; env.document.body.append(frame);
      });
      let doc; let win;
      try { win = frame.contentWindow; doc = frame.contentDocument; if (!doc) throw Error(); }
      catch { throw fail('FRAME', '无法读取正常作业页面，可能登录跳转或嵌入受限。'); }
      safePageCheck(doc, win, binding.courseId, options.origin || ORIGIN);
      session = createSession(doc, win, binding.courseId, options.origin || ORIGIN, options);
      return { read: session.read, close() { session.close(); frame.remove(); } };
    } catch (error) { session?.close(); frame.remove(); throw error; }
  }
  function fit(binding, env) {
    const apply = () => {
      if (!binding.host.isConnected) return;
      // Reserve the full date label before letting the native title shrink.
      // Secondary notes can ellipsize; the options menu retains their full text.
      if (binding.heading && !binding.host.hidden) {
        const badge = binding.output.querySelector('.main-badge');
        const width = badge?.getBoundingClientRect().width || Math.min(binding.output.scrollWidth, 140);
        binding.host.style.minWidth = Math.ceil(width + 28) + 'px';
      }
      // Never resize the native status LI or its siblings. The state bar must
      // also fit when a site variant has a shorter fixed-height title/card.
      binding.card.style.minHeight = binding.baseMinHeight || '';
      if (binding.host.hidden) return;
      const inner = binding.host.getBoundingClientRect();
      const outer = binding.card.getBoundingClientRect();
      const stateBottom = binding.card.querySelector('ul.state.stu')?.getBoundingClientRect().bottom || 0;
      const bottom = Math.max(inner.bottom, stateBottom);
      if (outer.height && bottom > outer.bottom - 8) binding.card.style.minHeight = Math.ceil(bottom - outer.top + 12) + 'px';
    };
    if (env.requestAnimationFrame) env.requestAnimationFrame(() => { apply(); env.requestAnimationFrame(apply); });
  }
  function deadlineSummary(tasks, now) {
    let next = null; let sameDeadline = 0; let overdue = 0; let unknown = 0;
    for (const task of tasks) {
      if (task.status !== 'unsubmitted') continue;
      const ms = task.deadline?.ms;
      if (!Number.isFinite(ms)) { unknown++; continue; }
      const delta = ms - now;
      if (delta > 0) {
        if (next === null || ms < next) { next = ms; sameDeadline = 1; }
        else if (ms === next) sameDeadline++;
      } else if (delta >= -72 * HOUR) overdue++;
    }
    return { next, sameDeadline, overdue, unknown };
  }
  const compactDate = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric' });
  function deadlineLabel(ms, now) {
    const parts = value => Object.fromEntries(compactDate.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const target = parts(ms); const current = parts(now); const delta = ms - now;
    const date = (target.year === current.year ? '' : target.year + '年') + target.month + '月' + target.day + '日';
    const remaining = delta < HOUR ? '不足1小时' : delta <= 24 * HOUR ? '剩' + Math.floor(delta / HOUR) + '小时' : '剩' + Math.floor(delta / (24 * HOUR)) + '天';
    return date + ' · ' + remaining;
  }
  const core = { DataError, pageLink, findCourseSlots, parseDeadline, urgency, formatDeadline, visibleTasks,
    columnsOf, parseRows, readTotal, snapshot, safePageCheck, createSession, openPageReader, fit, errorText, deadlineSummary, deadlineLabel };
  if (typeof module === 'object' && module.exports && typeof document === 'undefined') { module.exports = core; return; }
  if (location.origin !== ORIGIN || location.pathname !== HOME || window.top !== window.self) return;
  const guard = Symbol.for('thu-ddl-normal-page-0.4'); if (window[guard]) return; window[guard] = true;
  document.getElementById('thu-ddl-home-panel')?.remove();
  const bindings = new Map(); const queue = []; let running = false; let paused = false; let syncPending = false;
  function node(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; }
  const headingStyle = node('style', `
    #selfcourse > .item .hdtitle[data-thu-ddl-heading] {
      display:flex!important; align-items:center!important; flex-wrap:nowrap!important;
      column-gap:10px; overflow:visible!important;
    }
    #selfcourse > .item .hdtitle[data-thu-ddl-heading] > :not([data-thu-ddl-inline]) {
      flex:0 1 auto; min-width:0!important; float:none!important;
      max-height:100%; box-sizing:border-box; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    #selfcourse > .item .hdtitle[data-thu-ddl-heading]::before,
    #selfcourse > .item .hdtitle[data-thu-ddl-heading]::after { display:none!important; }
  `);
  headingStyle.id = 'thu-ddl-heading-style'; document.head.append(headingStyle);
  function render(binding) {
    binding.output.replaceChildren();
    const result = binding.results.unsubmitted;
    const summary = deadlineSummary(result?.tasks || [], Date.now());
    if (summary.next !== null) {
      const [date, remaining] = deadlineLabel(summary.next, Date.now()).split(' · ');
      const badge = node('span'); badge.className = 'main-badge ' + urgency(summary.next, Date.now()).level;
      const dateText = node('span', date); dateText.className = 'badge-date';
      const separator = node('span', ' · '); separator.className = 'separator';
      const countdown = node('span', remaining); countdown.className = 'badge-remaining';
      badge.append(dateText, separator, countdown);
      badge.setAttribute('data-deadline', String(summary.next)); badge.title = formatDeadline(summary.next);
      binding.output.append(badge);
      if (summary.sameDeadline > 1) { const count = node('span', summary.sameDeadline + '项同截止'); count.className = 'small-note'; binding.output.append(count); }
    }
    if (summary.overdue) { const count = node('span', '逾期' + summary.overdue + '项'); count.className = 'overdue-count'; binding.output.append(count); }
    if (summary.unknown) { const note = node('span', summary.unknown + '项日期待核对'); note.className = 'small-note'; binding.output.append(note); }
    if (result && !result.complete) { const note = node('span', result.tasks.length ? '未完整读取' : 'DDL读取失败：' + (result.warning || '未能确认列表加载完成。')); note.className = 'small-note'; note.title = result.warning || '已读记录不能代表全部作业。'; binding.output.append(note); }
    if (binding.progress && !result) { const note = node('span', 'DDL读取中…'); note.className = 'small-note'; binding.output.append(note); }
    if (!result && !binding.progress && binding.nativeCount !== 0 && paused) { const note = node('span', 'DDL读取已暂停'); note.className = 'small-note'; binding.output.append(note); }
    binding.host.hidden = binding.output.childNodes.length === 0;
    binding.heading?.toggleAttribute('data-thu-ddl-heading', !binding.host.hidden);
    const details = [...binding.output.children].map(item => item.textContent + (item.title ? '（' + item.title + '）' : '')).join('；');
    binding.output.title = details;
    binding.menuStatus.textContent = details;
    if (binding.host.hidden) binding.tools.open = false;
    binding.refresh.disabled = running || paused;
    fit(binding, globalThis);
  }
  function enqueue(binding, force = false) {
    if (!binding.url || binding.pending || paused) return;
    if (force && Date.now() - binding.lastAttempt < 60000) { binding.progress = '请间隔至少 60 秒再刷新。'; render(binding); return; }
    if (force) binding.results = {};
    const sources = binding.show.checked ? Object.keys(STATES) : ['unsubmitted'];
    if (!sources.some(source => !binding.results[source])) { render(binding); return; }
    if (!force && !binding.show.checked && binding.nativeCount === 0) { render(binding); return; }
    binding.pending = true; queue.push(binding); void drain();
  }
  async function drain() {
    if (running) return; running = true;
    while (queue.length && !paused) {
      const binding = queue.shift(); binding.lastAttempt = Date.now(); binding.progress = '正在打开原站正常作业页……'; render(binding);
      let reader;
      try {
        reader = await openPageReader(globalThis, binding);
        for (const source of Object.keys(STATES)) {
          if (source !== 'unsubmitted' && !binding.show.checked) continue;
          if (binding.results[source]) continue;
          const result = await reader.read(source, text => { binding.progress = text; render(binding); });
          binding.results[source] = result;
          if (result.fatal) { paused = true; break; }
        }
      } catch (error) {
        binding.results.unsubmitted = { tasks: [], complete: false, warning: errorText(error) };
        if (fatalCodes.has(error?.code)) paused = true;
      } finally { reader?.close(); binding.pending = false; binding.progress = ''; render(binding); }
    }
    if (paused) { for (const binding of queue.splice(0)) { binding.pending = false; render(binding); } }
    running = false; for (const binding of bindings.values()) render(binding);
  }
  function sync() {
    for (const slot of findCourseSlots(document)) {
      if (bindings.has(slot.link)) continue;
      const host = node('span'); host.setAttribute('data-thu-ddl-inline', '0.4.0-title-inline'); const shadow = host.attachShadow({ mode: 'closed' });
      const style = node('style', `
        :host { display:flex!important; flex:0 1 auto; flex-wrap:nowrap; align-items:center; gap:4px; position:relative!important; float:none!important; clear:none; width:auto!important; min-width:0; max-width:65%; margin:0 0 0 auto!important; padding:0!important; border:0!important; background:none!important; color:#536779; font:12px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif; text-align:left; }
        :host([data-fallback]) { max-width:100%; margin:5px 0 0!important; }
        :host([hidden]) { display:none!important; }
        * { box-sizing:border-box; } .output { display:flex; flex:0 1 auto; flex-wrap:nowrap; align-items:center; gap:6px; min-width:0; overflow:hidden; white-space:nowrap; }
        .main-badge { display:inline-flex; flex:none; align-items:baseline; padding:0 8px; border:1px solid #dce7f0; border-radius:6px; font-size:13px; line-height:22px; color:#42647e; background:#f0f5f9; font-variant-numeric:tabular-nums; white-space:nowrap; }
        .badge-date { font-weight:500; } .badge-remaining { font-weight:650; } .separator { padding:0 4px; opacity:.5; }
        .red { color:#b42318; background:#fff0ed; border-color:#f5c9c1; } .orange { color:#9a4d0b; background:#fff3e7; border-color:#f5d4b0; } .yellow { color:#80610b; background:#fff9e5; border-color:#eddfac; }
        .overdue-count,.small-note { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; font-size:11px; }
        .overdue-count { color:#b42318; } .small-note { color:#80610b; }
        .tools { flex:none; position:relative; margin:0; color:#8393a1; font-size:12px; line-height:20px; }
        :host([data-fallback]) .tools { margin-left:auto; }
        .tools summary { display:block; width:22px; height:24px; line-height:22px; border-radius:5px; text-align:center; cursor:pointer; list-style:none; font-size:18px; }
        .tools summary:hover,.tools[open] summary { background:#edf3f8; color:#42647e; }
        .tools summary::-webkit-details-marker { display:none; }
        .menu { position:absolute; z-index:1000; top:calc(100% + 6px); right:0; width:260px; max-width:calc(100vw - 48px); padding:12px; border:1px solid #dce7f0; border-radius:8px; background:#fff; color:#536779; box-shadow:0 6px 20px #233d561c; white-space:normal; overflow-wrap:anywhere; }
        .menu-status { margin:0 0 10px; font-size:12px; line-height:1.6; }
        .help { display:block; margin-top:8px; color:#7b8793; font-size:11px; line-height:1.5; }
        button { font:inherit; padding:3px 9px; border:1px solid #cbdbe8; border-radius:5px; background:#f5f9fc; color:#315c7c; cursor:pointer; }
        button:hover:enabled { background:#e9f2f9; } button:disabled { opacity:.5; cursor:default; }
        summary:focus-visible,button:focus-visible { outline:2px solid #168fe5; outline-offset:2px; }
      `);
      const output = node('span'); output.className = 'output'; output.setAttribute('role', 'status');
      const tools = node('details'); tools.className = 'tools'; tools.open = false;
      const menu = node('summary', '⋯'); menu.setAttribute('aria-label', '作业提醒选项'); tools.append(menu);
      const show = { checked: false };
      const refresh = node('button', '刷新'); refresh.type = 'button'; refresh.setAttribute('aria-label', '刷新本课程作业截止时间');
      const menuPanel = node('div'); menuPanel.className = 'menu';
      const menuStatus = node('p'); menuStatus.className = 'menu-status';
      const help = node('span', '仅显示最近未来未交 DDL；逾期超过 72 小时隐藏。'); help.className = 'help';
      menuPanel.append(menuStatus, refresh, help); tools.append(menuPanel); shadow.append(style, output, tools);
      const heading = slot.card.querySelector('.hdtitle');
      const binding = { ...slot, host, output, show, refresh, heading, tools, menuStatus, baseMinHeight: slot.card.style.minHeight, results: {}, pending: false, progress: '', lastAttempt: -Infinity };
      bindings.set(slot.link, binding);
      if (heading) {
        // Keep existing elements, event handlers and direct-child selectors.
        // Only bare text needs a shrinkable element in a flex title row.
        for (const child of [...heading.childNodes]) {
          if (child.nodeType !== 3 || !child.textContent.trim()) continue;
          const text = node('span'); child.replaceWith(text); text.append(child);
        }
        for (const child of heading.children) if (!child.hasAttribute('title')) child.title = child.textContent.trim();
        heading.append(host);
      } else {
        host.setAttribute('data-fallback', '');
        const stateBar = slot.link.closest('ul.state.stu');
        slot.card.insertBefore(host, stateBar?.parentElement === slot.card ? stateBar.nextSibling : null);
      }
      tools.addEventListener('toggle', () => {
        if (tools.open) for (const other of bindings.values()) if (other !== binding) other.tools.open = false;
        fit(binding, globalThis);
      });
      tools.addEventListener('keydown', event => { if (event.key === 'Escape') { tools.open = false; menu.focus(); } });
      refresh.addEventListener('click', () => enqueue(binding, true));
      if (!slot.url) binding.results.unsubmitted = { tasks: [], complete: false, warning: '原作业链接未通过安全检查，未读取。' };
      render(binding); enqueue(binding);
    }
  }
  function scheduleSync() { if (syncPending) return; syncPending = true; globalThis.setTimeout(() => { syncPending = false; sync(); }, 200); }
  if (document.documentElement && typeof MutationObserver === 'function') new MutationObserver(scheduleSync).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', sync, { once: true }); sync();
  document.addEventListener('pointerdown', event => {
    for (const binding of bindings.values()) if (binding.tools.open && !event.composedPath().includes(binding.host)) binding.tools.open = false;
  });
  globalThis.addEventListener('resize', () => { for (const binding of bindings.values()) fit(binding, globalThis); });
  function tick() { globalThis.setTimeout(() => { if (!document.hidden) for (const binding of bindings.values()) render(binding); tick(); }, 60000); } tick();
})();
