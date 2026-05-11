'use strict';

const MapModule = (() => {

  let map = null;

  const TILE_SIZE = 512;
  const MAX_ZOOM = 7;

  let moveTimeout = null;

  let activePopup = null;

  let regionsLayer = null;
  let labelsLayer  = null;

  let allMarkers = [];
  let locMarkers = [];
  let arcMarkers = [];
  let artMarkers = [];

  const layerVisible = { loc: true, arc: true, art: true };

  function init() {

    const CENTER = [-TILE_SIZE / 2, TILE_SIZE / 2];

    map = L.map('leaflet-map', {
      crs: L.CRS.Simple,
      minZoom: 0,
      maxZoom: MAX_ZOOM,
      zoom: 1,
      center: CENTER,
      zoomControl: false,
      attributionControl: false,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
      preferCanvas: true,
      updateWhenIdle: true,
      updateWhenZooming: false,
      inertia: true,
      inertiaDeceleration: 3000,
      inertiaMaxSpeed: 3000,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 120,
    });

    map.getContainer().style.background = '#0a0c0a';

    const tileLayer = L.GridLayer.extend({
      createTile: function (coords) {
        const tile = document.createElement('img');
        const { x, y, z } = coords;
        tile.style.width = TILE_SIZE + 'px';
        tile.style.height = TILE_SIZE + 'px';
        tile.draggable = false;
        tile.onload = () => {};
        tile.onerror = () => tile.style.display = 'none';
        tile.src = `map.jpg/tiles/${z}/${x}/${y}.jpg`;
        return tile;
      }
    });

    new tileLayer({
      tileSize: TILE_SIZE,
      keepBuffer: 3,
      updateWhenIdle: true,
      updateWhenZooming: false,
      noWrap: true,
    }).addTo(map);

    map.on('click', (e) => {
      if (editMode) { _onMapClickEdit(e); return; }
      closePopup();
    });

    map.on('move', () => {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {}, 60);
    });

    buildRegionLayers();

    map.on('zoomend', updateLabelVisibility);
    map.on('zoomend', updateMarkersVisibility);

    buildArchoMarkers();
    buildArtifactMarkers();
    buildLocationMarkers();

    updateMarkersVisibility();

    const archo = (window.APP_DATA && window.APP_DATA.archanomaly) || [];
    const arts  = (window.APP_DATA && window.APP_DATA.artifacts)   || [];
    const locs  = (window.APP_DATA && window.APP_DATA.locations)   || [];
  }

  // ─────────────────────────────────────────────
  //  ВИДИМІСТЬ МАРКЕРІВ
  // ─────────────────────────────────────────────
  function updateMarkersVisibility() {
    if (!map) return;
    const zoom = map.getZoom();
    const hideAll = zoom <= 1;

    const applyVisibility = (markers, type) => {
      markers.forEach(m => {
        const el = m.getElement && m.getElement();
        if (!el) return;
        el.style.display = (hideAll || !layerVisible[type]) ? 'none' : '';
      });
    };

    applyVisibility(locMarkers, 'loc');
    applyVisibility(arcMarkers, 'arc');
    applyVisibility(artMarkers, 'art');
  }

  function toggleMarkerLayer(type) {
    layerVisible[type] = !layerVisible[type];
    updateMarkersVisibility();
  }

  // ─────────────────────────────────────────────
  //  РЕГІОНИ
  // ─────────────────────────────────────────────

  const REGION_COLORS = {
    CNPP:             '#cc1100',
    red_forest:       '#cc1100',
    cooling_towers:   '#cc1100',
    generators:       '#cc1100',
    prypiat:          '#ff8800',
    iron_forest:      '#ff8800',
    duga:             '#ff8800',
    wild_island:      '#ff8800',
    jupiter:          '#ff8800',
    yanov:            '#ff8800',
    lesser_zone:      '#ff8800',
    zaton:            '#ff8800',
    cement_factory:   '#ff8800',
    garbage:          '#00cc66',
    rostok:           '#00cc66',
    chemical_plant:   '#00cc66',
    burnt_forest:     '#00cc66',
    yantar:           '#00cc66',
    malachite:        '#00cc66',
    swamp:            '#00cc66',
    sircaa:           '#00cc66',
    cordon:           '#00cc66',
  };

  const REGION_DANGER = {
    CNPP:           { level: 'СМЕРТЕЛЬНО НЕБЕЗПЕЧНА', desc: 'Максимальна радіація. Вхід без захисного спорядження — неминуча смерть.' },
    red_forest:     { level: 'СМЕРТЕЛЬНО НЕБЕЗПЕЧНА', desc: 'Аномальна радіоактивна зона. Сильні мутації флори та фауни.' },
    cooling_towers: { level: 'СМЕРТЕЛЬНО НЕБЕЗПЕЧНА', desc: 'Аномалії вищої концентрації. Смертоносне випромінювання.' },
    generators:     { level: 'СМЕРТЕЛЬНО НЕБЕЗПЕЧНА', desc: 'Надзвичайно небезпечна зона з потужними аномаліями.' },
    prypiat:        { level: 'НЕБЕЗПЕЧНА', desc: 'Покинуте місто з активними угрупуваннями та важкими аномаліями.' },
    iron_forest:    { level: 'НЕБЕЗПЕЧНА', desc: 'Щільні аномальні поля. Часті зустрічі з небезпечними мутантами.' },
    duga:           { level: 'НЕБЕЗПЕЧНА', desc: 'Радіолокаційна станція. Потужне електромагнітне випромінювання.' },
    wild_island:    { level: 'НЕБЕЗПЕЧНА', desc: 'Ізольована зона з непередбачуваними аномаліями.' },
    jupiter:        { level: 'НЕБЕЗПЕЧНА', desc: 'Промисловий комплекс. Активні аномалії та ворожі сталкери.' },
    yanov:          { level: 'НЕБЕЗПЕЧНА', desc: 'Залізнична станція. Конфлікти між угрупуваннями.' },
    lesser_zone:    { level: 'НЕБЕЗПЕЧНА', desc: 'Нестабільна зона з активними аномальними полями.' },
    zaton:          { level: 'НЕБЕЗПЕЧНА', desc: 'Затоплена промзона. Підводні аномалії та мутанти.' },
    cement_factory: { level: 'НЕБЕЗПЕЧНА', desc: 'Заводська зона з активними угрупуваннями.' },
    garbage:        { level: 'БЕЗПЕЧНА', desc: 'Звалище техніки. Численні сутички між сталкерами.' },
    rostok:         { level: 'БЕЗПЕЧНА', desc: 'Завод "Росток". Контролюється угрупуванням Борг.' },
    chemical_plant: { level: 'БЕЗПЕЧНА', desc: 'Хімічний завод з токсичними аномаліями.' },
    burnt_forest:   { level: 'БЕЗПЕЧНА', desc: 'Горілий ліс з помірними аномаліями та мутантами.' },
    yantar:         { level: 'БЕЗПЕЧНА', desc: 'Лабораторія Янтар. Науковий форпост у Зоні.' },
    malachite:      { level: 'БЕЗПЕЧНА', desc: 'Промисловий район з аномальною активністю.' },
    swamp:          { level: 'БЕЗПЕЧНА', desc: 'Болотиста місцевість з хімічними аномаліями.' },
    sircaa:         { level: 'БЕЗПЕЧНА', desc: 'Хімічне підприємство. Токсичне середовище.' },
    cordon:         { level: 'БЕЗПЕЧНА', desc: 'Початкова зона для новачків. Патрулюється військовими.' },
  };

  function buildRegionLayers() {
    if (!map || typeof REGIONS_DATA === 'undefined') return;

    regionsLayer = L.layerGroup().addTo(map);
    labelsLayer  = L.layerGroup().addTo(map);

    REGIONS_DATA.forEach(region => {
      const color = REGION_COLORS[region.id] || '#ffffff';

      const polygon = L.polygon(region.coords, {
        color:       color,
        weight:      0,
        opacity:     0,
        fillColor:   color,
        fillOpacity: 0,
        className:   'region-polygon',
      });

      polygon.on('mouseover', function () {
        if (map.getZoom() <= 1) {
          this.setStyle({ fillColor: '#ffffff', fillOpacity: 0.12, color: '#ffffff', weight: 1.5, opacity: 0.6 });
        }
      });
      polygon.on('mouseout', function () {
        this.setStyle({ fillOpacity: 0, weight: 0, opacity: 0 });
      });

      polygon.addTo(regionsLayer);

      const label = L.marker(region.center, {
        icon: L.divIcon({
          className: 'region-label',
          html: `<span class="region-label-text" data-region-id="${region.id}" style="font-size:8px;color:#ffffff;white-space:nowrap;display:inline-block;transform:translate(-50%,-50%);text-shadow:0 0 8px ${color}88,0 1px 3px #000c;border-bottom:1px dashed ${color}66;cursor:pointer">${region.name}</span>`,
          iconSize:   [0, 0],
          iconAnchor: [0, 0],
        }),
        interactive: true,
        zIndexOffset: 100,
      });

      label._regionColor = color;
      label._regionName  = region.name;

      label.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        closePopup();
        const danger   = REGION_DANGER[region.id] || null;
        const foundKey = `found_region_${region.id}`;

        const popup = L.popup({
          className: 'archo-popup region-popup',
          maxWidth: 480,
          closeButton: true,
          autoClose: true,
        });
        popup.setLatLng(region.center);

        const buildContent = (found) => `
          <div class="region-popup-wrapper">
            ${region.image ? `
            <div class="region-popup-img-wrap">
              <img src="images/regions/${region.image}" alt="${region.name}" onerror="this.parentElement.style.display='none'" class="region-popup-img">
            </div>` : ''}
            <div class="archo-popup-inner">
              <div class="archo-popup-badge" style="background:${color}22;color:${color};border-color:${color}55">
                <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:5px;vertical-align:middle;box-shadow:0 0 6px ${color}"></span>Регіон
              </div>
              <div class="archo-popup-title">${region.name}</div>
              ${danger ? `
                <div class="archo-popup-danger" style="color:${color};margin-top:6px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${danger.level}</div>
                <div class="archo-popup-desc" style="margin-top:5px">${danger.desc}</div>
              ` : ''}
            </div>
          </div>
        `;

        popup.setContent(buildContent(localStorage.getItem(foundKey) === '1'));
        popup.openOn(map);
        activePopup = popup;

        popup.on('add', () => {
          const btn = document.getElementById(`region-found-btn-${region.id}`);
          if (!btn) return;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowFound = localStorage.getItem(foundKey) === '1';
            if (nowFound) localStorage.removeItem(foundKey);
            else localStorage.setItem(foundKey, '1');
            popup.setContent(buildContent(!nowFound));
            popup.fire('add');
          });
        });
      });

      polygon._label = label;
      label.addTo(labelsLayer);
    });

    updateLabelVisibility();
  }

  function updateLabelVisibility() {
    if (!map || !labelsLayer) return;

    const zoom = map.getZoom();

    const fontSize = zoom <= 1 ? 8
                   : zoom <= 2 ? 10
                   : zoom <= 3 ? 12
                   : zoom <= 4 ? 15
                   : 18;

    labelsLayer.eachLayer(l => {
      const el = l.getElement && l.getElement();
      if (!el) return;
      el.style.display = '';
      const span = el.querySelector('.region-label-text');
      if (span) span.style.fontSize = fontSize + 'px';
    });

    if (regionsLayer) {
      regionsLayer.eachLayer(p => {
        if (p.setStyle) p.setStyle({ fillOpacity: 0, weight: 0, opacity: 0 });
      });
    }

    updateMarkersVisibility();
  }

  // ─────────────────────────────────────────────
  //  ІКОНКА АРХО-АНОМАЛІЇ
  // ─────────────────────────────────────────────
  const ARCHO_ICON_URL = 'images/Archanomaly/Texture_Archianomaly_NotActive_General_Shadow.png';

  function createArchoIcon(item) {
    const tooltip = item ? buildHoverTooltip('arc', 'Архіаномалія', item.name, item.zone) : '';
    const html = `<div class="map-marker-wrap map-marker-wrap--arc" style="position:relative;width:36px;height:36px;cursor:pointer">${tooltip}<img src="${ARCHO_ICON_URL}" alt="" style="width:36px;height:36px;object-fit:contain;display:block;"></div>`;
    return L.divIcon({
      html,
      className:   'archo-marker-icon',
      iconSize:    [36, 36],
      iconAnchor:  [18, 18],
      popupAnchor: [0, -22],
    });
  }

  // ─────────────────────────────────────────────
  //  ПОБУДОВА МАРКЕРІВ
  // ─────────────────────────────────────────────

  function buildArtifactMarkers() {
    if (!map) return;
    const data = (window.APP_DATA && window.APP_DATA.artifacts) || [];
    if (!data.length) return;
    data.forEach(item => {
      const marker = L.marker(item.coords, { icon: createArtifactIcon(item), zIndexOffset: 900 });
      marker.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        closePopup();
        showArtifactPopup(item, marker.getLatLng());
      });
      marker.addTo(map);
      allMarkers.push(marker);
      artMarkers.push(marker);
    });
  }

  function buildLocationMarkers() {
    if (!map) return;
    const data = (window.APP_DATA && window.APP_DATA.locations) || [];
    if (!data.length) return;
    data.forEach(item => {
      const marker = L.marker(item.coords, { icon: createLocationIcon(item), zIndexOffset: 800 });
      marker.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        closePopup();
        showLocationPopup(item, marker.getLatLng());
      });
      marker.addTo(map);
      allMarkers.push(marker);
      locMarkers.push(marker);
    });
  }

  function buildArchoMarkers() {
    if (!map) return;
    const data = (window.APP_DATA && window.APP_DATA.archanomaly) || [];
    if (!data.length) return;
    data.forEach(item => {
      const icon = createArchoIcon(item);
      const marker = L.marker(item.coords, { icon, zIndexOffset: 1000 });
      marker.on('click', function(e) {
        L.DomEvent.stopPropagation(e);
        closePopup();
        showPopup(item, marker.getLatLng());
      });
      marker.addTo(map);
      allMarkers.push(marker);
      arcMarkers.push(marker);
    });
  }

  // ─────────────────────────────────────────────
  //  ПОПАПИ
  // ─────────────────────────────────────────────

  function showPopup(item, latlng) {
    const popup = L.popup({
      className: 'archo-popup',
      maxWidth: 460,
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
    });

    const imgHtml = item.image
      ? `<div class="archo-popup-img-wrap">
           <img src="images/Archanomaly/${item.image}" alt="${item.name}" class="archo-popup-img" onerror="this.parentElement.style.display='none'">
         </div>`
      : '';

    popup.setLatLng(latlng);
    const arcColor = '#ee5a24';
    popup.setContent(`
      <div class="archo-popup-wrapper">
        ${imgHtml}
        <div class="archo-popup-inner">
          <div class="archo-popup-badge" style="background:${arcColor}22;color:${arcColor};border-color:${arcColor}55;display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border:1px solid;border-radius:2px;font-size:10px;letter-spacing:2px;text-transform:uppercase;">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${arcColor};box-shadow:0 0 6px ${arcColor}"></span>Архіаномалія
          </div>
          <div class="archo-popup-title" style="color:#f87171">${item.name}</div>
          ${item.zone ? `<div class="archo-popup-danger" style="color:${arcColor};margin-top:4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${item.zone}</div>` : ''}
          ${item.description ? `<div class="archo-popup-desc" style="margin-top:6px">${item.description}</div>` : ''}
        </div>
      </div>
    `);

    popup.openOn(map);
    activePopup = popup;
  }

  function closePopup() {
    if (activePopup) {
      map.closePopup(activePopup);
      activePopup = null;
    }
  }

  function showLocationPopup(item, latlng) {
    const color    = '#60a5fa';
    const imgFile  = item.image || null;
    const imgDir   = 'images/Locations/';
    const foundKey = `found_location_${item.id}`;

    const popup = L.popup({
      className: 'archo-popup location-popup',
      maxWidth: 480,
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
    });
    popup.setLatLng(latlng);

    const buildContent = (found) => `
      <div class="location-popup-wrapper">
        ${imgFile ? `
        <div class="region-popup-img-wrap">
          <img src="${imgDir}${imgFile}" alt="${item.name || ''}" onerror="this.parentElement.style.display='none'" class="region-popup-img">
        </div>` : ''}
        <div class="archo-popup-inner">
          <div class="archo-popup-badge" style="background:${color}22;color:${color};border-color:${color}55;display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border:1px solid;border-radius:2px;font-size:10px;letter-spacing:2px;text-transform:uppercase;">
            <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};box-shadow:0 0 6px ${color}"></span>Локація
          </div>
          <div class="archo-popup-title" style="color:#93c5fd">${item.name}</div>
          ${item.zone ? `<div class="archo-popup-danger" style="color:${color};margin-top:4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${item.zone}</div>` : ''}
          ${item.description ? `<div class="archo-popup-desc" style="margin-top:6px">${item.description}</div>` : ''}
        </div>
      </div>
    `;

    popup.setContent(buildContent(localStorage.getItem(foundKey) === '1'));
    popup.openOn(map);
    activePopup = popup;

    popup.on('add', () => {
      const btn = document.getElementById(`location-found-btn-${item.id}`);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowFound = localStorage.getItem(foundKey) === '1';
        if (nowFound) localStorage.removeItem(foundKey);
        else localStorage.setItem(foundKey, '1');
        popup.setContent(buildContent(!nowFound));
        popup.fire('add');
      });
    });
  }

  function showArtifactPopup(item, latlng) {
    const glow = '#f59e0b';
    const imgSrc = item.image
      ? `images/artifacts/${item.image}`
      : item.icon && item.icon !== 'T_reward_icon_artifact.png'
      ? `images/artifacts/${item.icon}`
      : null;
    const foundKey = `found_artifact_${item.id}`;
    const isFound = localStorage.getItem(foundKey) === '1';

    const popup = L.popup({ className: 'archo-popup artifact-popup', maxWidth: 300, closeButton: true, autoClose: true, closeOnClick: false });
    popup.setLatLng(latlng);

    const buildContent = (found) => `
      <div class="archo-popup-inner">
        <div class="archo-popup-badge" style="background:${glow}22;color:${glow};border-color:${glow}55;display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border:1px solid;border-radius:2px;font-size:10px;letter-spacing:2px;text-transform:uppercase;">
          <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${glow};box-shadow:0 0 6px ${glow}"></span>${item.type || 'Артефакт'}
        </div>
        <div class="archo-popup-title" style="color:#fcd34d">${item.name}</div>
        ${imgSrc ? `
        <div class="artifact-popup-img-wrap">
          <img src="${imgSrc}" alt="${item.name}" onerror="this.style.display='none';this.parentElement.style.display='none'" class="artifact-popup-img">
        </div>` : ''}
        ${item.zone ? `<div class="archo-popup-danger" style="color:${glow};margin-top:4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">${item.zone}</div>` : ''}
        ${item.description ? `<div class="archo-popup-desc" style="margin-top:6px">${item.description}</div>` : ''}
        ${item.rarity ? `<div class="archo-popup-danger" style="color:${glow};margin-top:4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase">Рідкість: ${item.rarity}</div>` : ''}
      </div>
    `;

    popup.setContent(buildContent(isFound));
    popup.openOn(map);
    activePopup = popup;

    popup.on('add', () => {
      const btn = document.getElementById(`artifact-found-btn-${item.id}`);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const nowFound = localStorage.getItem(foundKey) === '1';
        if (nowFound) localStorage.removeItem(foundKey);
        else localStorage.setItem(foundKey, '1');
        popup.setContent(buildContent(!nowFound));
        popup.fire('add');
      });
    });
  }

  // ─────────────────────────────────────────────
  //  ЗУМ / НАВІГАЦІЯ
  // ─────────────────────────────────────────────

  function smoothZoom(targetZoom) {
    if (!map) return;
    const current = map.getZoom();
    const step = targetZoom > current ? 0.25 : -0.25;
    function animate() {
      const z = map.getZoom();
      if ((step > 0 && z >= targetZoom) || (step < 0 && z <= targetZoom)) {
        map.setZoom(targetZoom); return;
      }
      map.setZoom(z + step, { animate: false });
      requestAnimationFrame(animate);
    }
    animate();
  }

  function zoom(factor) {
    if (!map) return;
    if (factor > 1) {
      map.zoomIn(1, { animate: true });
    } else {
      map.zoomOut(1, { animate: true });
    }
  }

  function resetView() {
    if (!map) return;
    map.setView([-TILE_SIZE / 2, TILE_SIZE / 2], 1, { animate: true, duration: 0.5 });
  }

  function panToMarker(coords, item) {
    if (!map) return;

    map.setView(coords, 5, { animate: true, duration: 0.6 });

    const pulseIcon = L.divIcon({
      className: 'map-focus-pulse',
      html: '<div class="map-focus-pulse-inner"></div>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });

    const pulseMarker = L.marker(coords, {
      icon: pulseIcon,
      interactive: false,
      zIndexOffset: 9999
    }).addTo(map);

    setTimeout(() => map.removeLayer(pulseMarker), 2200);

    setTimeout(() => {
      const t = (item.type || '').toLowerCase();
      if (t === 'артефакт' || t === 'artifact') {
        showArtifactPopup(item, coords);
      } else if (t === 'локація' || t === 'location') {
        showLocationPopup(item, coords);
      } else {
        showPopup(item, coords);
      }
    }, 650);
  }

  // ─────────────────────────────────────────────
  //  ПОШУК
  // ─────────────────────────────────────────────

  function setSearch(q) {
    if (!q || !window.APP_DATA) return;
    const all = [
      ...(window.APP_DATA.locations   || []),
      ...(window.APP_DATA.archanomaly || []),
      ...(window.APP_DATA.artifacts   || []),
    ];
    const found = all.find(d => d.name.toLowerCase().includes(q.toLowerCase()));
    if (found && found.coords) panToMarker(found.coords, found);
  }

  // ─────────────────────────────────────────────
  //  РЕЖИМ РОЗМІЩЕННЯ МІТОК
  // ─────────────────────────────────────────────

  let editMode      = false;
  let editNextId    = 100;
  let pendingLatLng = null;
  let previewMarker = null;

  function toggleEditMode() {
    editMode = !editMode;
    const btn    = document.getElementById('edit-toggle-btn');
    const banner = document.getElementById('edit-mode-banner');
    const mapEl  = document.getElementById('leaflet-map');
    if (editMode) {
      btn.classList.add('active');
      banner.style.display = '';
      mapEl.style.cursor = 'crosshair';
    } else {
      btn.classList.remove('active');
      banner.style.display = 'none';
      mapEl.style.cursor = '';
      _pmCancel();
    }
  }

  function _onMapClickEdit(e) {
    pendingLatLng = e.latlng;
    if (previewMarker) map.removeLayer(previewMarker);
    previewMarker = L.circleMarker(pendingLatLng, {
      radius: 8, color: '#f59e0b', fillColor: '#f59e0b',
      fillOpacity: 0.5, weight: 2,
    }).addTo(map);
    document.getElementById('pm-coords').textContent =
      `coords: [${pendingLatLng.lat.toFixed(2)}, ${pendingLatLng.lng.toFixed(2)}]`;
    _pmUpdateJson();
    document.getElementById('placement-modal').style.display = '';
  }

  function _pmTypeChange() {
    const type = document.getElementById('pm-type').value;
    document.getElementById('pm-artifact-fields').style.display = type === 'artifact' ? '' : 'none';
    _pmUpdateJson();
  }

  function _pmUpdateJson() {
    if (!pendingLatLng) return;
    const type   = document.getElementById('pm-type').value;
    const name   = document.getElementById('pm-name').value   || 'Нова мітка';
    const zone   = document.getElementById('pm-zone').value   || '';
    const desc   = document.getElementById('pm-desc').value   || '';
    const rarity = document.getElementById('pm-rarity').value || '';
    const icon   = document.getElementById('pm-icon').value   || '';
    const coords = [
      parseFloat(pendingLatLng.lat.toFixed(2)),
      parseFloat(pendingLatLng.lng.toFixed(2)),
    ];
    let obj;
    if (type === 'artifact') {
      obj = { id: editNextId, name, type: 'Артефакт', zone, rarity, description: desc, icon, coords };
      if (!rarity) delete obj.rarity;
      if (!icon)   delete obj.icon;
    } else if (type === 'location') {
      obj = { id: editNextId, name, type: 'Локація', zone, description: desc, coords };
    } else {
      obj = { id: editNextId, name, type: 'архо-аномалія', zone, description: desc, coords,
              sid: Math.random().toString(16).slice(2,34).toUpperCase() };
    }
    if (!zone) delete obj.zone;
    if (!desc) delete obj.description;
    document.getElementById('pm-json').value = JSON.stringify(obj, null, 2);
  }

  function _pmCopy() {
    const ta = document.getElementById('pm-json');
    ta.select();
    document.execCommand('copy');
    const btn = document.querySelector('.pm-btn-copy');
    btn.textContent = '✓ Скопійовано!';
    setTimeout(() => btn.textContent = 'Копіювати JSON', 1500);
  }

  function _pmPlace() {
    if (!pendingLatLng) return;
    const type = document.getElementById('pm-type').value;
    const name = document.getElementById('pm-name').value || 'Нова мітка';
    const zone = document.getElementById('pm-zone').value || '';
    const desc = document.getElementById('pm-desc').value || '';
    if (type === 'artifact') {
      const rarity = document.getElementById('pm-rarity').value || '';
      const icon   = document.getElementById('pm-icon').value   || '';
      const item   = { id: editNextId++, name, type: 'Артефакт', zone, rarity, description: desc, icon,
                       coords: [pendingLatLng.lat, pendingLatLng.lng] };
      const marker = L.marker(pendingLatLng, { icon: createArtifactIcon(item), zIndexOffset: 900 });
      marker.on('click', function(e) { L.DomEvent.stopPropagation(e); closePopup(); showArtifactPopup(item, marker.getLatLng()); });
      marker.addTo(map);
      allMarkers.push(marker);
      artMarkers.push(marker);
    } else if (type === 'location') {
      const item = { id: editNextId++, name, type: 'Локація', zone, description: desc,
                     coords: [pendingLatLng.lat, pendingLatLng.lng] };
      const marker = L.marker(pendingLatLng, { icon: createLocationIcon(item), zIndexOffset: 800 });
      marker.on('click', function(e) { L.DomEvent.stopPropagation(e); closePopup(); showLocationPopup(item, marker.getLatLng()); });
      marker.addTo(map);
      allMarkers.push(marker);
      locMarkers.push(marker);
    } else {
      const item = { id: editNextId++, name, type: 'архо-аномалія', zone, description: desc,
                     coords: [pendingLatLng.lat, pendingLatLng.lng] };
      const marker = L.marker(pendingLatLng, { icon: createArchoIcon(item), zIndexOffset: 1000 });
      marker.on('click', function(e) { L.DomEvent.stopPropagation(e); closePopup(); showPopup(item, marker.getLatLng()); });
      marker.addTo(map);
      allMarkers.push(marker);
      arcMarkers.push(marker);
    }
    _pmCancel();
  }

  function _pmCancel() {
    document.getElementById('placement-modal').style.display = 'none';
    if (previewMarker) { map.removeLayer(previewMarker); previewMarker = null; }
    pendingLatLng = null;
    ['pm-name','pm-zone','pm-desc','pm-rarity','pm-icon'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('pm-json').value = '';
  }

  // ─────────────────────────────────────────────
  //  ІКОНКИ
  // ─────────────────────────────────────────────

  const LOCATION_ICON_URL = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="38" viewBox="0 0 32 38"><defs><radialGradient id="lg" cx="50%" cy="40%" r="50%"><stop offset="0%" stop-color="#60a5fa"/><stop offset="60%" stop-color="#2563eb"/><stop offset="100%" stop-color="#1e3a8a" stop-opacity="0.85"/></radialGradient></defs><path d="M16 2 C8.27 2 2 8.27 2 16 C2 25 16 36 16 36 C16 36 30 25 30 16 C30 8.27 23.73 2 16 2Z" fill="url(#lg)" stroke="#60a5fa" stroke-width="1.5"/><rect x="10" y="10" width="12" height="9" rx="1" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.9"/><line x1="13" y1="19" x2="13" y2="22" stroke="#fff" stroke-width="1.5" opacity="0.9"/><line x1="19" y1="19" x2="19" y2="22" stroke="#fff" stroke-width="1.5" opacity="0.9"/><line x1="11" y1="22" x2="21" y2="22" stroke="#fff" stroke-width="1.5" opacity="0.9"/></svg>`);

  function createLocationIcon(item) {
    const iconUrl  = (item && item.icon) ? 'images/Locations/' + item.icon : LOCATION_ICON_URL;
    const isCustom = item && item.icon;
    const sz = isCustom ? 40 : 32;
    const h  = isCustom ? 40 : 38;
    const tooltip = buildHoverTooltip('loc', 'Локація', item ? item.name : '', item ? item.zone : '');
    const html = `<div class="map-marker-wrap" style="position:relative;width:${sz}px;cursor:pointer">${tooltip}<img src="${iconUrl}" alt="" style="width:${sz}px;height:${h}px;object-fit:contain;display:block;"></div>`;
    return L.divIcon({
      html,
      className:   '',
      iconSize:    [sz, h],
      iconAnchor:  isCustom ? [20, 40] : [16, 36],
      popupAnchor: [0, isCustom ? -42 : -38],
    });
  }

  function createArtifactIcon(item) {
    const img = item.icon ? `images/artifacts/${item.icon}` : 'images/T_reward_icon_artifact.png';
    const rarityHtml = item.rarity
      ? `<span class="mtt-zone">Рідкість: ${item.rarity}</span>`
      : '';
    const html = `
      <div class="map-marker-wrap" style="position:relative;width:36px;height:36px;cursor:pointer">
        <div class="map-hover-tooltip">
          <div class="mtt-type mtt-type--art"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#f59e0b;box-shadow:0 0 5px #f59e0b;margin-right:5px;vertical-align:middle"></span>Артефакт</div>
          <div class="mtt-name">${item.name}</div>
          ${item.zone ? `<div class="mtt-zone">Регіон: ${item.zone}</div>` : ''}
          ${rarityHtml}
        </div>
        <img src="${img}" alt="${item.name}" onerror="this.src='images/T_reward_icon_artifact.png'" style="width:36px;height:36px;object-fit:contain;display:block;">
      </div>`;
    return L.divIcon({ html, className: '', iconSize: [36, 36], iconAnchor: [18, 18], popupAnchor: [0, -22] });
  }

  function buildHoverTooltip(type, label, name, zone, extra) {
    const typeClass = { loc: 'mtt-type--loc', arc: 'mtt-type--arc', art: 'mtt-type--art' }[type] || '';
    const dotColor  = { loc: '#60a5fa', arc: '#ee5a24', art: '#f59e0b' }[type] || '#ffffff';
    const zoneHtml  = zone  ? `<div class="mtt-zone">Регіон: ${zone}</div>` : '';
    const extraHtml = extra ? `<div class="mtt-zone">${extra}</div>` : '';
    return `
      <div class="map-hover-tooltip">
        <div class="mtt-type ${typeClass}"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dotColor};box-shadow:0 0 5px ${dotColor};margin-right:5px;vertical-align:middle"></span>${label}</div>
        <div class="mtt-name">${name}</div>
        ${zoneHtml}${extraHtml}
      </div>`;
  }

  function toggleLayer() {}
  function toggleDanger() {}

  return {
    init, zoom, resetView, panToMarker,
    toggleLayer, toggleDanger, setSearch,
    toggleEditMode, _pmTypeChange, _pmUpdateJson, _pmCopy, _pmPlace, _pmCancel,
    toggleMarkerLayer,
  };

})();