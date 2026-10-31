/* Localizes the graphics realm without touching song metadata, archive names or input values. */
(function () {
  var copy, locale = 'en', observer, originals = new WeakMap(), attributes = new WeakMap();
  var roots = '#fx-panel,#fx-fab,#fx-fab-hide-btn,#bottom-bar,#toast';
  var content = '.user-archive-name,.user-archive-input,#user-archive-share-input,#control-title,#control-artist,#stage-title,#stage-artist,textarea,script,style';
  function text(value) {
    if (!copy) return value;
    var trimmed = value.trim(), translated = copy.strings[trimmed];
    if (!translated && trimmed.indexOf(' › ') >= 0) translated = trimmed.split(' › ').map(text).join(' › ');
    if (!translated && /^没有找到“.*”$/.test(trimmed)) translated = copy.noResults.replace('{query}', trimmed.slice(5, -1));
    if (!translated && /^\d+ 项参数$/.test(trimmed)) translated = copy.parameterCount.replace('{count}', trimmed.split(' ')[0]);
    if (!translated && /^封面 #[\da-f]{6}$/i.test(trimmed)) translated = (copy.strings['封面'] || '封面') + trimmed.slice(2);
    return translated ? value.replace(trimmed, translated) : value;
  }
  function translateNode(node) {
    if (node.nodeType === 3) {
      if (!node.parentElement || node.parentElement.closest(content)) return;
      var previous = originals.get(node), source = previous && node.nodeValue === previous.rendered ? previous.source : node.nodeValue;
      var rendered = text(source);
      originals.set(node, { source: source, rendered: rendered });
      if (node.nodeValue !== rendered) node.nodeValue = rendered;
      return;
    }
    if (node.nodeType !== 1 || node.closest(content)) return;
    var saved = attributes.get(node) || {};
    ['title', 'aria-label', 'placeholder', 'data-fx-console-title'].forEach(function (name) {
      if (!node.hasAttribute(name)) return;
      var value = node.getAttribute(name), prior = saved[name], source = prior && value === prior.rendered ? prior.source : value;
      var rendered = text(source);
      saved[name] = { source: source, rendered: rendered };
      if (value !== rendered) node.setAttribute(name, rendered);
    });
    attributes.set(node, saved);
    Array.from(node.childNodes).forEach(translateNode);
  }
  function refresh() {
    if (!copy) return;
    if (observer) observer.disconnect();
    document.querySelectorAll(roots).forEach(translateNode);
    document.querySelectorAll('[data-stage-copy]').forEach(function (node) { node.textContent = copy[node.dataset.stageCopy]; });
    document.querySelectorAll('[data-stage-close]').forEach(function (node) { node.setAttribute('aria-label', copy.closeConsole); });
    document.querySelectorAll('[data-stage-unavailable]').forEach(function (node) { node.title = copy[node.dataset.stageUnavailable] || copy.unavailable; });
    if (observer) document.querySelectorAll(roots).forEach(function (root) { observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] }); });
  }
  function disable(node, reason) {
    node.dataset.stageUnavailable = reason || 'unavailable';
    ['onclick', 'oninput', 'onchange'].forEach(function (name) { node.removeAttribute(name); });
    node.setAttribute('aria-disabled', 'true');
    node.setAttribute('tabindex', '-1');
    node.classList.add('stage-unavailable');
    if ('disabled' in node) node.disabled = true;
  }
  function hide(node) {
    if (!node) return;
    node.hidden = true;
    node.setAttribute('aria-hidden', 'true');
    node.querySelectorAll('button,input,select,textarea,.fx-toggle').forEach(function (control) { disable(control); });
  }
  function bindCapabilities(command, rangeKeys) {
    document.querySelectorAll('#fx-panel .fx-console-group').forEach(function (group) {
      var tab = group.dataset.fxConsoleTab, key = group.dataset.fxConsoleGroup;
      if (key === 'desktop' || key === 'camera' || tab === 'system' && /^(memory|experimental|other)$/.test(key) || tab === 'interface' && key === 'glass') {
        hide(group);
        if (key === 'memory') group.querySelectorAll('input,button,.fx-toggle').forEach(function (control) { disable(control, 'windowsMemory'); });
      } else if (tab === 'system' && /^(startup|output|performance|cache)$/.test(key)) {
        var body = group.querySelector('.fx-console-group-body') || group;
        Array.from(body.children).forEach(hide);
        var note = document.createElement('p'); note.dataset.stageCopy = 'hostManaged';
        var link = document.createElement('button'); link.type = 'button'; link.className = 'fx-mini-btn'; link.dataset.stageHostSettings = ''; link.dataset.stageCopy = 'hostSettings';
        link.addEventListener('click', function () { command('openSettings'); });
        body.append(note, link);
      }
    });
    ['home-accent-picker', 'home-icon-picker', 'visual-icon-picker', 'bg-media-preview', 'wallpaper-engine-value', 'bg-color-picker', 'lyric-source-seg', 'sonic-audio-monitor-toggle', 't-sonicAudioMonitorEnabled', 't-sonicAudioAutoTrack', 't-shelfShowPodcasts', 't-shelfMergeCollections'].forEach(function (id) {
      var node = document.getElementById(id);
      hide(node && (node.closest('[data-fx-console-entry]') || node));
    });
    document.querySelectorAll('input[type=range]').forEach(function (node) {
      if (node.id !== 'volume-slider' && !rangeKeys[node.id]) disable(node, /memory/i.test(node.id) ? 'windowsMemory' : 'unavailable');
    });
    document.querySelectorAll('[id*="desktop"],[id*="wallpaper"],[id*="gesture"],#cam-seg').forEach(function (node) {
      if (node.closest('#fx-panel')) { disable(node); node.querySelectorAll('button,input,.fx-toggle').forEach(function (control) { disable(control); }); }
    });
    var page = document.querySelector('[data-fx-page="system"]');
    if (page) { var summary = document.createElement('p'); summary.dataset.stageCopy = 'unavailableSummary'; page.prepend(summary); }
    refresh();
  }
  window.MineradioConsole = {
    apply: function (nextLocale, nextCopy) {
      if (!nextCopy || !nextCopy.strings) return;
      locale = nextLocale; copy = nextCopy;
      document.documentElement.lang = locale;
      document.title = copy.stageTitle;
      if (!observer) observer = new MutationObserver(refresh);
      refresh();
    },
    bindCapabilities: bindCapabilities,
    translate: text,
    dispose: function () { if (observer) observer.disconnect(); observer = null; },
  };
})();
