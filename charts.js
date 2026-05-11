/* =============================================
   STALKER 2 — charts.js
   Логіка вкладок Список і Статистика
   ============================================= */

'use strict';

const ChartsModule = (() => {

  let listTypeFilter = 'all';
  let listZoneFilter = 'all';

  const all = () => {
    const d = window.APP_DATA;
    if (!d) return [];
    return [
      ...(d.locations   || []),
      ...(d.artifacts   || []),
      ...(d.archanomaly || []),
    ];
  };

  const typeKey = t => ({
    'локація':       'loc',
    'локація':       'loc',
    'артефакт':      'art',
    'архо-аномалія': 'arc',
    'Локація':       'loc',
    'Артефакт':      'art',
    'Архо-аномалія': 'arc',
    'архіаномалія':  'arc',
    'Архіаномалія':  'arc',
  })[(t||'').trim()] || 'loc';

  const typeLabel = d => ({
    'локація':       'Локація',
    'Локація':       'Локація',
    'артефакт':      'Артефакт',
    'Артефакт':      'Артефакт',
    'архо-аномалія': 'Архіаномалія',
    'Архо-аномалія': 'Архіаномалія',
  })[(d.type||'').trim()] || d.type;

  const typeColor = k => ({
    loc: '#60a5fa',
    art: '#f59e0b',
    arc: '#ee5a24',
  })[k] || '#60a5fa';

  const getAllZones = () => {
    const zones = new Set();
    all().forEach(d => { if (d.zone) zones.add(d.zone); });
    return Array.from(zones).sort();
  };

  function renderZoneFilter() {
    const container = document.getElementById('zone-filter-bar');
    if (!container) return;
    const zones = getAllZones();
    if (!zones.length) { container.innerHTML = ''; return; }
    const btns = zones.map(z => {
      const active = listZoneFilter === z ? ' active' : '';
      return '<button class="zone-btn' + active + '" onclick="ChartsModule.setZoneFilter(\'' + z.replace(/'/g, "\\'") + '\')">' + z + '</button>';
    }).join('');
    container.innerHTML =
      '<button class="zone-btn' + (listZoneFilter === 'all' ? ' active' : '') + '" onclick="ChartsModule.setZoneFilter(\'all\')">Всі зони</button>' +
      btns;
  }

  function renderList(query) {
    if (query === undefined) query = '';
    renderZoneFilter();
    const grid = document.getElementById('list-grid');
    if (!grid) return;
    const q = query.toLowerCase().trim();
    const items = all().filter(function(d) {
      if (listTypeFilter !== 'all' && typeKey(d.type) !== listTypeFilter) return false;
      if (listZoneFilter !== 'all' && d.zone !== listZoneFilter) return false;
      if (q && !d.name.toLowerCase().includes(q) && !(d.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
    if (!items.length) {
      grid.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:20px 0;">Нічого не знайдено</div>';
      return;
    }
    grid.innerHTML = items.map(function(d) {
      const k   = typeKey(d.type);
      const col = typeColor(k);
      const hasCoords = d.coords && d.coords.length === 2;
      const mapBtn = hasCoords
        ? '<button class="card-map-btn" onclick="event.stopPropagation();ChartsModule.selectOnMap(' + d.id + ')" title="Показати на мапі">🗺 На мапу</button>'
        : '';
      const price = d.price
        ? '<div class="card-price">Ціна: ' + d.price.toLocaleString() + ' руб.</div>'
        : '';
      const clickable = hasCoords ? ' list-card--clickable' : '';
      const clickHandler = hasCoords ? ' onclick="ChartsModule.selectOnMap(' + d.id + ')"' : '';

      // Визначаємо шлях до фото залежно від типу
      let imgSrc = '';
      let imgWrapClass = 'card-img-wrap';
      if (k === 'loc') {
        if (d.image) imgSrc = 'images/Locations/' + d.image;
      } else if (k === 'arc') {
        if (d.image) imgSrc = 'images/Archanomaly/' + d.image;
      } else if (k === 'art') {
        if (d.image) imgSrc = 'images/artifacts/' + d.image;
        else if (d.icon) { imgSrc = 'images/artifacts/' + d.icon; imgWrapClass = 'card-img-wrap card-img-wrap--icon'; }
      }
      const imgHtml = imgSrc
        ? '<div class="' + imgWrapClass + '"><img class="card-img" src="' + imgSrc + '" alt="' + d.name + '" loading="lazy" onerror="this.parentElement.style.display=\'none\'"></div>'
        : '';

      return '<div class="list-card list-card--' + k + clickable + '"' + clickHandler + '>' +
        imgHtml +
        '<div class="card-body">' +
          '<div class="card-header">' +
            '<div class="card-name" style="color:' + col + '">' + d.name + '</div>' +
            mapBtn +
          '</div>' +
          '<div class="card-type">' + typeLabel(d) + '</div>' +
          '<div class="card-desc">' + (d.description || '') + '</div>' +
          price +
        '</div>' +
        '</div>';
    }).join('');
  }

  function setListFilter(type) {
    listTypeFilter = type;
    document.querySelectorAll('.type-btn').forEach(function(b) { b.classList.remove('active'); });
    const btn = document.querySelector('.type-btn[data-type="' + type + '"]');
    if (btn) btn.classList.add('active');
    renderList(document.getElementById('list-search') ? document.getElementById('list-search').value : '');
  }

  function setZoneFilter(zone) {
    listZoneFilter = zone;
    renderList(document.getElementById('list-search') ? document.getElementById('list-search').value : '');
  }

  function selectOnMap(id) {
    const item = all().find(function(d) { return d.id === id; });
    if (!item || !item.coords) return;
    switchPane('map');
    setTimeout(function() { MapModule.panToMarker(item.coords, item); }, 100);
  }

  function goToZone(zone) {
    listZoneFilter = zone;
    listTypeFilter = 'all';
    switchPane('list');
    setTimeout(function() { renderList(''); }, 50);
  }

  function renderStats() {
    const data  = all();
    const total = data.length;
    const locs = data.filter(function(d) { return typeKey(d.type) === 'loc'; }).length;
    const arts = data.filter(function(d) { return typeKey(d.type) === 'art'; }).length;
    const arcs = data.filter(function(d) { return typeKey(d.type) === 'arc'; }).length;

    const cards = document.getElementById('stat-cards');
    if (cards) {
      cards.innerHTML =
        '<div class="stat-card"><div class="stat-value">' + total + '</div><div class="stat-label">Всього об\'єктів</div></div>' +
        '<div class="stat-card"><div class="stat-value" style="color:#60a5fa">' + locs + '</div><div class="stat-label">Локацій</div></div>' +
        '<div class="stat-card"><div class="stat-value" style="color:#ee5a24">' + arcs + '</div><div class="stat-label">Архіаномалій</div></div>' +
        '<div class="stat-card"><div class="stat-value" style="color:#f59e0b">' + arts + '</div><div class="stat-label">Артефактів</div></div>';
    }

    const bars = document.getElementById('stat-bars');
    if (!bars) return;

    // ── Підрахунок об'єктів по зонах ──
    const zoneMap = {};
    data.forEach(function(d) {
      if (!d.zone) return;
      zoneMap[d.zone] = (zoneMap[d.zone] || 0) + 1;
    });
    const zoneSorted = Object.entries(zoneMap).sort(function(a, b) { return b[1] - a[1]; });
    const maxZoneVal = zoneSorted.length ? zoneSorted[0][1] : 1;

    // ── SVG стовпчастий графік ──
    const chartW = 520;
    const chartH = 200;
    const padL = 36;  // вісь Y
    const padB = 72;  // вісь X (підписи)
    const padT = 36;
    const padR = 16;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const n = zoneSorted.length;
    const barW = Math.max(8, Math.floor(plotW / n) - 4);
    const gap  = Math.floor(plotW / n);

    // Сітка Y
    const yTicks = 4;
    let gridLines = '';
    let yLabels = '';
    for (let i = 0; i <= yTicks; i++) {
      const v = Math.round(maxZoneVal * i / yTicks);
      const y = padT + plotH - Math.round(plotH * i / yTicks);
      gridLines += '<line x1="' + padL + '" y1="' + y + '" x2="' + (padL + plotW) + '" y2="' + y + '" stroke="#1e2d1e" stroke-width="1"/>';
      yLabels   += '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="#5a7a5a" font-size="9">' + v + '</text>';
    }

    // Стовпчики + підписи X
    let barsHtml = '';
    let xLabels  = '';
    zoneSorted.forEach(function(entry, i) {
      const zone = entry[0];
      const val  = entry[1];
      const bh   = Math.max(2, Math.round(plotH * val / maxZoneVal));
      const x    = padL + i * gap + Math.floor((gap - barW) / 2);
      const y    = padT + plotH - bh;
      // колір — чергуємо
      const col  = ['#60a5fa','#f59e0b','#ee5a24','#3a6ea8','#c87a08'][i % 5];
      barsHtml += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + bh + '" fill="' + col + '" rx="2" opacity="0.85"/>';
      // значення над стовпчиком
      barsHtml += '<text x="' + (x + barW/2) + '" y="' + (y - 4) + '" text-anchor="middle" fill="#a0c8a0" font-size="9">' + val + '</text>';
      // підпис X — похилий
      const lx = x + barW / 2;
      const ly = padT + plotH + 8;
      xLabels += '<text transform="translate(' + lx + ',' + ly + ') rotate(40)" text-anchor="start" fill="#7c9f76" font-size="9">' + zone + '</text>';
    });

    // Осі
    const axes =
      '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (padT+plotH) + '" stroke="#2d4a2d" stroke-width="1.5"/>' +
      '<line x1="' + padL + '" y1="' + (padT+plotH) + '" x2="' + (padL+plotW) + '" y2="' + (padT+plotH) + '" stroke="#2d4a2d" stroke-width="1.5"/>';

    // Підписи осей
    const axisLabels =
      '<text x="' + (padL + plotW/2) + '" y="' + (chartH - 2) + '" text-anchor="middle" fill="#5a7a5a" font-size="10">Зона</text>' +
      '<text transform="translate(10,' + (padT + plotH/2) + ') rotate(-90)" text-anchor="middle" fill="#5a7a5a" font-size="10">Кількість об\'єктів</text>';

    // Назва графіка
    const title = '<text x="' + (chartW/2) + '" y="18" text-anchor="middle" fill="#7c9f76" font-size="11" letter-spacing="1.5">ОБ\'ЄКТИ ПО ЗОНАХ</text>';

    const svg =
      '<svg class="zone-chart-svg" viewBox="0 0 ' + chartW + ' ' + chartH + '" xmlns="http://www.w3.org/2000/svg">' +
        title + gridLines + yLabels + axes + barsHtml + xLabels + axisLabels +
      '</svg>';

    bars.innerHTML =
      '<div class="pane-title" style="margin-top:4px">Типи об\'єктів</div>' +
      '<div class="bar-section">' +
        (total ? barRow('Локації',      locs, total, '#60a5fa') : '') +
        (total ? barRow('Архіаномалії', arcs, total, '#ee5a24') : '') +
        (total ? barRow('Артефакти',    arts, total, '#f59e0b') : '') +
      '</div>' +
      '<div class="zone-chart-wrap">' +
        '<div class="zone-chart-title">Розподіл по зонах</div>' +
        svg +
      '</div>';
  }

  function barRow(label, value, total, color) {
    const pct = total > 0 ? Math.round(value / total * 100) : 0;
    return '<div class="bar-row">' +
      '<div class="bar-label"><span>' + label + '</span><span style="color:' + color + '">' + value + ' (' + pct + '%)</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
      '</div>';
  }

  return { renderList, renderStats, setListFilter, setZoneFilter, selectOnMap, goToZone };
})();
