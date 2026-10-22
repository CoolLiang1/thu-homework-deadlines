/* 手动选择一门课程块或作业表后运行。只输出标签、class、已知列头。
 * 排除 script/style、表单字段、隐藏元素；不读链接、事件、凭据或存储。
 * 不发送请求、不改页面、不自动执行；最多 60 个节点、4 层深度。
 */
(() => {
  if (typeof $0 === 'undefined' || !$0 || $0.nodeType !== 1 || /^(BODY|HTML)$/.test($0.tagName)) {
    return '请选中一门课程块或作业表，不能选整个页面。';
  }
  const knownHeaders = ['序号', '作业题目', '发布对象', '完成方式', '生效日期', '截止日期(GMT+8)', '截止倒计时', '操作'];
  let count = 0;
  const shape = (element, depth = 0) => {
    if (depth > 3 || count >= 60 || element.hidden || /^(SCRIPT|STYLE|INPUT|TEXTAREA|SELECT|IFRAME|OBJECT|EMBED)$/.test(element.tagName)) return null;
    const css = getComputedStyle(element);
    if (css.display === 'none' || css.visibility === 'hidden') return null;
    count++;
    return { tag: element.tagName, classes: [...element.classList].slice(0, 8),
      children: [...element.children].slice(0, 8).map(child => shape(child, depth + 1)).filter(Boolean) };
  };
  const columns = [...$0.querySelectorAll('thead th,thead td,[role="columnheader"]')].slice(0, 12).map(header => {
    const label = header.textContent.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')');
    return knownHeaders.includes(label) ? label : '未识别列头';
  });
  return JSON.stringify({ structure: shape($0), columns }, null, 2);
})();
