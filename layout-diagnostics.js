(function () {
  if (!new URLSearchParams(location.search).has('diagnose')) return;
  const history = [];
  const targets = {
    html: 'html', body: 'body',
    app: '#ink-app, #root', workspace: '#ink-workspace, .workspace',
    settings: '#ink-settings, .side-panel', stage: '#ink-stage, .stage',
    sidebarContent: '#ink-controls-scroll, #sidebar-scroll', sourceCard: '#source-card',
    textSource: '#text-source', textInput: '#text-input', topbar: '#ink-topbar, .topbar',
    tabs: '#ink-tabs, .sidebar-tabs', editPanel: '#edit-panel',
    viewport: '#viewport', canvas: '#canvas-wrap', artwork: '#artwork'
  };
  function state() {
    const layout = {};
    for (const [name, selector] of Object.entries(targets)) {
      const element = document.querySelector(selector);
      if (!element) { layout[name] = { missing: true }; continue; }
      const style = getComputedStyle(element), rect = element.getBoundingClientRect();
      layout[name] = {
        tag: element.tagName, id: element.id, class: element.className,
        display: style.display, visibility: style.visibility, position: style.position,
        overflow: style.overflow, columns: style.gridTemplateColumns,
        zIndex: style.zIndex, transform: style.transform, filter: style.filter,
        opacity: style.opacity, zoom: style.zoom, contentVisibility: style.contentVisibility,
        width: Math.round(rect.width), height: Math.round(rect.height),
        x: Math.round(rect.x), y: Math.round(rect.y), inlineStyle: element.getAttribute('style')
      };
    }
    const stage = document.querySelector(targets.stage)?.getBoundingClientRect();
    const covering = stage ? document.elementsFromPoint(Math.min(innerWidth - 1, stage.x + stage.width / 2), Math.min(innerHeight - 1, stage.y + stage.height / 2)).slice(0,8).map(e=>({tag:e.tagName,id:e.id,class:typeof e.className==='string'?e.className:''})) : [];
    return { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, layout, coveringStageCenter: covering };
  }
  function sample(reason) {
    const current = state(), signature = JSON.stringify(current);
    if (signature === sample.previous && reason !== 'copy') return;
    sample.previous = signature;
    history.push({ ms: Math.round(performance.now()), reason, ...current });
    if (history.length > 8) history.splice(1, 1);
  }
  function matchingRules() {
    const rules = [], props = ['display', 'visibility', 'position', 'height', 'width', 'max-width', 'grid-template-columns', 'overflow', 'inset', 'top', 'left', 'right', 'bottom', 'z-index', 'transform', 'opacity'];
    function walk(list, source) {
      for (const rule of list) {
        if (rule.conditionText && rule.type === CSSRule.MEDIA_RULE && !matchMedia(rule.conditionText).matches) continue;
        if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules, source); continue; }
        if (!rule.selectorText || !rule.style) continue;
        const matched = Object.entries(targets).filter(([, selector]) => { try { return document.querySelector(selector)?.matches(rule.selectorText); } catch { return false; } }).map(([name]) => name);
        const legacyControlSelector = /\.sidebar-content\b|#sidebar-scroll\b/.test(rule.selectorText);
        if (!matched.length && !legacyControlSelector) continue;
        const declarations = {};
        for (const property of props) { const value = rule.style.getPropertyValue(property); if (value) declarations[property] = value + (rule.style.getPropertyPriority(property) ? ' !important' : ''); }
        if (Object.keys(declarations).length) rules.push({ source, selector: rule.selectorText, matched, legacyControlSelector, declarations });
      }
    }
    [...document.styleSheets].forEach((sheet, index) => {
      let source = 'inline:' + index;
      if (sheet.href) { try { const url = new URL(sheet.href); source = url.origin + url.pathname; } catch { source = 'external'; } }
      try { walk(sheet.cssRules, source); } catch { rules.push({ source, inaccessible: true }); }
    });
    return rules.slice(-100);
  }
  function report() {
    sample('copy');
    return {
      tool: 'rolling-ink', diagnosticVersion: 2, browser: navigator.userAgent,
      engineFeatures: { grid: CSS.supports('display', 'grid'), dvh: CSS.supports('height', '100dvh'), resizeObserver: typeof ResizeObserver === 'function' },
      sheets: [...document.styleSheets].map((sheet, index) => ({ index, disabled: sheet.disabled, external: !!sheet.href, owner:{tag:sheet.ownerNode?.tagName,id:sheet.ownerNode?.id,class:sheet.ownerNode?.className} })),
      history, matchingLayoutRules: matchingRules()
    };
  }
  function start() {
    // Diagnostics stay on this page. No artwork, typed text, uploads or network telemetry.
    window.__rollingInkLayoutDiagnostics = { report };
    sample('ready');
    const host = document.createElement('div'); host.id = 'ink-layout-diagnostic';
    host.style.cssText = 'position:fixed!important;right:12px!important;bottom:12px!important;z-index:2147483647!important;display:block!important;max-width:360px!important';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<style>:host{all:initial}button{font:700 13px/1.5 system-ui,sans-serif;background:#252017;color:#fff9ea;border:1px solid #fff9ea;padding:10px 14px;cursor:pointer}textarea{display:block;width:330px;height:180px;background:white;color:black;font:11px monospace}</style><button type="button">复制布局诊断</button>';
    shadow.querySelector('button').onclick = async function () {
      const text = JSON.stringify(report(), null, 2);
      try { await navigator.clipboard.writeText(text); this.textContent = '已复制，粘贴回对话即可'; }
      catch { let area = shadow.querySelector('textarea'); if (!area) { area = document.createElement('textarea'); area.readOnly = true; shadow.append(area); } area.value = text; area.focus(); area.select(); this.textContent = '按 Ctrl＋C 复制诊断'; }
    };
    document.body.append(host);
    const observer = new MutationObserver(() => { clearTimeout(observer.timer); observer.timer = setTimeout(() => sample('page-change'), 80); });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true, attributes: true });
    for (const selector of Object.values(targets)) { const element = document.querySelector(selector); if (element) observer.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'id'] }); }
    const timer = setInterval(() => sample('check'), 1000);
    setTimeout(() => { clearInterval(timer); sample('after-60s'); }, 60000);
    addEventListener('resize', () => sample('resize'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
