'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../thu-homework-deadlines.user.js');
const {parseDeadline,urgency,visibleTasks}=core;
const HOUR=3600000; const NOW=Date.UTC(2026,9,14);
const task=(ms,status='unsubmitted')=>({status,deadline:{ms}});

test('摘要取最近未来未交DDL，旧逾期和已交不挡住未来，多项同截止计数',()=>{
  const input=[task(NOW-1000*HOUR),task(NOW+100*HOUR),task(NOW+10*HOUR),task(NOW+10*HOUR),task(NOW+HOUR,'submitted'),task(NOW+HOUR,'graded'),task(NOW+HOUR,'unknown')];
  assert.deepEqual(core.deadlineSummary(input,NOW),{next:NOW+10*HOUR,sameDeadline:2,overdue:0,unknown:0});
  assert.equal(input.length,7);
});
test('逾期72小时包含边界，超过1毫秒隐藏且不计数，恰好截止归逾期',()=>{
  assert.deepEqual(core.deadlineSummary([task(NOW-72*HOUR),task(NOW-72*HOUR-1),task(NOW),task(NOW-1)],NOW),{next:null,sameDeadline:0,overdue:3,unknown:0});
});
test('只有旧逾期时摘要为空，空数据及未知日期分别处理',()=>{
  const empty={next:null,sameDeadline:0,overdue:0,unknown:0};
  assert.deepEqual(core.deadlineSummary([],NOW),empty);
  assert.deepEqual(core.deadlineSummary([task(NOW-73*HOUR)],NOW),empty);
  assert.deepEqual(core.deadlineSummary([task(null),task(NaN),task(undefined),task(null,'submitted')],NOW),{...empty,unknown:3});
});
test('紧凑标签固定北京时间，小时和天数向下取整，跨年保留年份',()=>{
  assert.equal(core.deadlineLabel(NOW+HOUR-1,NOW),'10月14日 · 不足1小时');
  assert.equal(core.deadlineLabel(NOW+HOUR,NOW),'10月14日 · 剩1小时');
  assert.equal(core.deadlineLabel(NOW+24*HOUR,NOW),'10月15日 · 剩24小时');
  assert.equal(core.deadlineLabel(NOW+24*HOUR+1,NOW),'10月15日 · 剩1天');
  assert.equal(core.deadlineLabel(NOW+49*HOUR,NOW),'10月16日 · 剩2天');
  assert.equal(core.deadlineLabel(Date.UTC(2027,0,1),NOW).startsWith('2027年1月1日 · '),true);
  assert.equal(core.deadlineLabel(Date.UTC(2026,9,14,16),NOW),'10月15日 · 剩16小时');
});
test('截止阈值：逾期、当前时刻与 24/72/168 小时边界', () => {
  const cases = [[-1, 'red'], [0, 'red'], [24 * HOUR, 'red'], [24 * HOUR + 1, 'orange'],
    [72 * HOUR, 'orange'], [72 * HOUR + 1, 'yellow'], [168 * HOUR, 'yellow'], [168 * HOUR + 1, 'normal']];
  for (const [delta, level] of cases) assert.equal(urgency(NOW + delta, NOW).level, level, String(delta));
  assert.equal(urgency(NOW - 1, NOW).text, '已逾期');
  assert.equal(urgency(NOW, NOW).text, '已到截止时间');
  for (const unknown of [null, undefined, NaN, Infinity]) assert.equal(urgency(unknown, NOW).level, 'unknown');
});


test('日期解析：无时区按 UTC+8，显式 Z/偏移代表同一时刻', () => {
  for (const value of ['2026-10-14 08:00:00', '2026/10/14 08:00', '2026-10-14T08:00:00+08:00',
    '2026-10-14T08:00:00+0800', '2026-10-14T00:00:00Z', '2026-10-13T20:00:00-04:00']) {
    assert.equal(parseDeadline(value).ms, NOW, value);
  }
  assert.equal(parseDeadline('2026-10-14 08:00:00').zone, 'assumed-Asia/Shanghai');
  assert.equal(parseDeadline('2026-10-14T08:00:00.12+08:00').ms, NOW + 120);
});


test('日期解析：闰年、无效日、非法时分秒与非法时区', () => {
  assert.notEqual(parseDeadline('2024-02-29 23:59:59').ms, null);
  for (const value of ['2026-02-29 12:00:00', '2026-04-31 12:00:00', '2026-13-01 12:00:00',
    '2026-01-00 12:00:00', '2026-10-14 24:00:00', '2026-10-14 08:60:00', '2026-10-14 08:00:60',
    '2026-10-14T08:00:00+15:00', '2026-10-14T08:00:00+14:01', '2026-10-14T08:00:00+08:99']) {
    assert.equal(parseDeadline(value).ms, null, value);
  }
});


test('日期缺失、纯日期、非约定类型不会猜测截止时刻', () => {
  for (const value of [null, undefined, '', '2026-10-14', '2026/10/14', '明天晚上', {}, true, '1760486400', 1760486400]) {
    const result = parseDeadline(value); assert.equal(result.ms, null); assert.ok(result.reason);
  }
  assert.equal(parseDeadline(NOW).ms, NOW);
  assert.equal(parseDeadline(String(NOW)).ms, NOW);
});


test('显示时间固定北京时间，午夜没有 24 点偏移', () => {
  assert.match(core.formatDeadline(NOW), /08:00:00/);
  assert.match(core.formatDeadline(Date.UTC(2026, 9, 13, 16)), /00:00:00/);
  assert.match(core.formatDeadline(NOW), /北京时间/);
});


test('默认过滤已交/已批，保留状态不确定，日期未知排末尾', () => {
  const tasks = [
    { title: '未知日期', status: 'unsubmitted', deadline: { ms: null } },
    { title: '晚', status: 'unsubmitted', deadline: { ms: NOW + HOUR } },
    { title: '已批', status: 'graded', deadline: { ms: NOW - HOUR } },
    { title: '已交', status: 'submitted', deadline: { ms: NOW - HOUR } },
    { title: '早', status: 'unknown', deadline: { ms: NOW } }
  ];
  assert.deepEqual(visibleTasks(tasks, false).map(x => x.title), ['早', '晚', '未知日期']);
  assert.equal(visibleTasks(tasks, true).length, 5);
  assert.equal(tasks[0].title, '未知日期'); // Input is not mutated.
});
