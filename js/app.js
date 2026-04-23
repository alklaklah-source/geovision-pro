/* ============================================================
   GIS SaaS Platform — Core Application Logic
   ============================================================ */

'use strict';

// ─── State ────────────────────────────────────────────────
const STATE = {
  currentPage: 'dashboard',
  sidebarCollapsed: false,
  rtl: true,
  basemap: 'dark',
  layers: [
    { id: 'roads',     name: 'شبكة الطرق',        color: '#3B82F6', visible: true,  count: 1842 },
    { id: 'buildings', name: 'المباني',             color: '#10B981', visible: true,  count: 5621 },
    { id: 'parcels',   name: 'قطع الأراضي',        color: '#F59E0B', visible: false, count: 3108 },
    { id: 'rivers',    name: 'المجاري المائية',     color: '#06B6D4', visible: true,  count: 287  },
    { id: 'zones',     name: 'مناطق التخطيط',      color: '#8B5CF6', visible: false, count: 94   },
  ],
  uploadedLayers: [],   // layers added by user upload
  activeTool: null,
  maps: {},
  charts: {},
  selectedFeatures: [],
};

// ─── Fix Leaflet icon paths ────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       'libs/leaflet/marker-icon.png',
  iconRetinaUrl: 'libs/leaflet/marker-icon-2x.png',
  shadowUrl:     'libs/leaflet/marker-shadow.png',
});

// ─── Basemap tile URLs ─────────────────────────────────────
const BASEMAP_URLS = {
  dark:      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  streets:   'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  satellite: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
};

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initSidebar();
  initNavigation();
  initToasts();
  buildLayerList();
  buildDataTable();
  buildProjectCards();
});

// ─── Auth ─────────────────────────────────────────────────
function initAuth() {
  const loginForm    = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      loginForm.style.display    = tab === 'login'    ? 'block' : 'none';
      registerForm.style.display = tab === 'register' ? 'block' : 'none';
    });
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('btn-register').addEventListener('click', doRegister);
}

function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass  = document.getElementById('login-pass').value;
  if (!email || !pass) { showToast('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'error'); return; }
  showToast('جاري تسجيل الدخول...', 'info');
  setTimeout(() => {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    setTimeout(() => { initApp(); showToast('مرحباً بك في GeoVision Pro! 🌍', 'success'); }, 100);
  }, 800);
}

function doRegister() {
  const name  = document.getElementById('reg-name').value;
  const email = document.getElementById('reg-email').value;
  if (!name || !email) { showToast('يرجى إدخال جميع البيانات', 'error'); return; }
  showToast('تم إنشاء الحساب بنجاح', 'success');
  setTimeout(() => {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    setTimeout(() => { initApp(); }, 100);
  }, 600);
}

// ─── App Init ─────────────────────────────────────────────
function initApp() {
  navigateTo('dashboard');
  initDashboardMap();
  initCharts();
}

// ─── Sidebar ──────────────────────────────────────────────
function initSidebar() {
  document.getElementById('sidebar-toggle').addEventListener('click', () => {
    STATE.sidebarCollapsed = !STATE.sidebarCollapsed;
    document.getElementById('sidebar').classList.toggle('collapsed', STATE.sidebarCollapsed);
    document.getElementById('toggle-icon').textContent = STATE.sidebarCollapsed ? '›' : '‹';
  });
}

// ─── Navigation ───────────────────────────────────────────
function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });
}

function navigateTo(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.nav-item').forEach(item =>
    item.classList.toggle('active', item.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');
  updateTopbar(page);
  if (page === 'map'       && !STATE.maps.main)            setTimeout(initMainMap, 100);
  if (page === 'analytics' && !STATE.charts.analyticsBar)  setTimeout(initAnalyticsCharts, 100);
}

const PAGE_META = {
  dashboard: { title: 'لوحة التحكم',   subtitle: 'نظرة عامة على البيانات الجغرافية'       },
  map:       { title: 'عرض الخريطة',   subtitle: 'واجهة GIS التفاعلية الكاملة'            },
  data:      { title: 'إدارة البيانات', subtitle: 'رفع وتحرير طبقات البيانات الجغرافية'   },
  analytics: { title: 'التحليلات',      subtitle: 'رؤى متقدمة وتحليل المؤشرات'             },
  projects:  { title: 'المشاريع',       subtitle: 'مشاريع GIS والخرائط المحفوظة'           },
  settings:  { title: 'الإعدادات',      subtitle: 'إعدادات المنصة والمستخدم'               },
};

function updateTopbar(page) {
  const meta = PAGE_META[page] || {};
  document.getElementById('topbar-title').textContent    = meta.title    || '';
  document.getElementById('topbar-subtitle').textContent = meta.subtitle || '';
}

// ─── Map Creation ──────────────────────────────────────────
function createBasemapLayer(type) {
  const cfg = {
    dark:      { url: BASEMAP_URLS.dark,      subdomains: ['a','b','c','d'], maxZoom: 19 },
    streets:   { url: BASEMAP_URLS.streets,   subdomains: '',                maxZoom: 19 },
    satellite: { url: BASEMAP_URLS.satellite, subdomains: ['0','1','2','3'], maxZoom: 20 },
  }[type] || { url: BASEMAP_URLS.dark, subdomains: ['a','b','c','d'], maxZoom: 19 };

  return L.tileLayer(cfg.url, {
    maxZoom: cfg.maxZoom,
    subdomains: cfg.subdomains,
    crossOrigin: true,
  });
}

function createMap(elId, center = [24.7136, 46.6753], zoom = 6) {
  const map = L.map(elId, {
    center, zoom,
    zoomControl: false,
    attributionControl: true,
  });

  // Attribution (small text bottom right)
  map.attributionControl.setPrefix('');

  const layer = createBasemapLayer('dark');
  layer.addTo(map);
  map._basemapLayer  = layer;
  map._currentStyle  = 'dark';
  map._uploadedGroup = L.layerGroup().addTo(map);

  addSampleData(map);
  return map;
}

function initDashboardMap() {
  if (STATE.maps.dashboard) return;
  STATE.maps.dashboard = createMap('dashboard-map');
  document.getElementById('db-map-loading').style.display = 'none';
}

function initMainMap() {
  if (STATE.maps.main) return;
  STATE.maps.main = createMap('main-map');
  document.getElementById('main-map-loading').style.display = 'none';
  initMapTools();
}

// ─── Sample Data ──────────────────────────────────────────
function addSampleData(map) {
  const cities = [
    { name: 'الرياض',          lat: 24.7136, lon: 46.6753, pop: 7630000,  type: 'عاصمة'       },
    { name: 'جدة',              lat: 21.4858, lon: 39.1925, pop: 4280000,  type: 'مدينة'        },
    { name: 'مكة المكرمة',      lat: 21.3891, lon: 39.8579, pop: 2042000,  type: 'مدينة مقدسة' },
    { name: 'المدينة المنورة',  lat: 24.5247, lon: 39.5692, pop: 1180770,  type: 'مدينة مقدسة' },
    { name: 'الدمام',           lat: 26.4207, lon: 50.0888, pop: 1000000,  type: 'مدينة'        },
    { name: 'تبوك',             lat: 28.3998, lon: 36.5715, pop: 600000,   type: 'مدينة'        },
    { name: 'أبها',             lat: 18.2164, lon: 42.5053, pop: 381000,   type: 'مدينة'        },
    { name: 'نجران',            lat: 17.5656, lon: 44.2289, pop: 280000,   type: 'مدينة'        },
  ];

  cities.forEach(city => {
    const size = Math.max(10, Math.min(26, city.pop / 350000));
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;background:rgba(59,130,246,0.85);border:2px solid #93C5FD;border-radius:50%;box-shadow:0 0 ${size}px rgba(59,130,246,0.5);cursor:pointer"></div>`,
      iconSize:   [size, size],
      iconAnchor: [size/2, size/2],
    });
    L.marker([city.lat, city.lon], { icon })
      .bindPopup(`<div class="feature-popup">
        <div class="feature-popup-title">📍 ${city.name}</div>
        <div class="feature-attr"><span class="feature-attr-key">النوع</span><span class="feature-attr-val">${city.type}</span></div>
        <div class="feature-attr"><span class="feature-attr-key">السكان</span><span class="feature-attr-val">${city.pop.toLocaleString('ar')}</span></div>
        <div class="feature-attr"><span class="feature-attr-key">الإحداثيات</span><span class="feature-attr-val">${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</span></div>
      </div>`, { maxWidth: 260 })
      .addTo(map);
  });

  L.polygon([[25.1,46.2],[25.1,47.2],[24.2,47.2],[24.2,46.2]], {
    color: '#10B981', fillColor: '#10B981', fillOpacity: 0.08, weight: 1.5, dashArray: '6,4',
  }).bindPopup(`<div class="feature-popup">
    <div class="feature-popup-title">🟢 منطقة التخطيط — الرياض الكبرى</div>
    <div class="feature-attr"><span class="feature-attr-key">المساحة</span><span class="feature-attr-val">27,100 كم²</span></div>
    <div class="feature-attr"><span class="feature-attr-key">الحالة</span><span class="feature-attr-val">نشطة</span></div>
  </div>`).addTo(map);

  L.polyline([[24.7,46.6],[25.5,47.5],[26.4,50.0]], {
    color: '#F59E0B', weight: 2.5, opacity: 0.8,
  }).addTo(map);
}

// ─── Basemap switcher ─────────────────────────────────────
function changeBasemap(type, mapKey) {
  const map = STATE.maps[mapKey];
  if (!map) return;
  STATE.basemap = type;
  if (map._basemapLayer) map.removeLayer(map._basemapLayer);
  map._basemapLayer = createBasemapLayer(type);
  map._basemapLayer.addTo(map);
  map._basemapLayer.bringToBack();

  document.querySelectorAll(`[data-basemap-map="${mapKey}"]`).forEach(btn =>
    btn.classList.toggle('active', btn.dataset.basemap === type));
}

// ─── Map Tools ────────────────────────────────────────────
function initMapTools() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (STATE.activeTool === tool) {
        STATE.activeTool = null;
        btn.classList.remove('active');
        showToast('تم إلغاء الأداة', 'info');
      } else {
        document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
        STATE.activeTool = tool;
        btn.classList.add('active');
        showToast(`أداة نشطة: ${btn.textContent.trim()}`, 'info');
      }
    });
  });
}

// ─── Layer Panel ──────────────────────────────────────────
function buildLayerList() {
  ['layer-list', 'map-layer-list'].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';
    STATE.layers.forEach(layer => {
      const el = document.createElement('div');
      el.className = 'layer-item';
      el.innerHTML = `
        <div class="layer-color" style="background:${layer.color}"></div>
        <span class="layer-name">${layer.name}</span>
        <span class="layer-count">${layer.count.toLocaleString('ar')}</span>
        <div class="toggle ${layer.visible ? 'on' : ''}" data-layer="${layer.id}"></div>`;
      el.querySelector('.toggle').addEventListener('click', e => {
        e.stopPropagation();
        layer.visible = !layer.visible;
        e.target.classList.toggle('on', layer.visible);
        showToast(`طبقة "${layer.name}" ${layer.visible ? 'مفعّلة' : 'معطّلة'}`, 'info');
      });
      container.appendChild(el);
    });
  });
}

function addUploadedLayerToPanel(name, color, count) {
  ['layer-list', 'map-layer-list'].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'layer-item';
    el.style.borderRight = `3px solid ${color}`;
    el.innerHTML = `
      <div class="layer-color" style="background:${color}"></div>
      <span class="layer-name" style="color:#F1F5F9;font-weight:600">${name}</span>
      <span class="layer-count">${count}</span>
      <div class="toggle on"></div>`;
    container.insertBefore(el, container.firstChild);
  });
}

// ─── ███ SHAPEFILE UPLOAD — REAL IMPLEMENTATION ███ ──────
const LAYER_COLORS = ['#EF4444','#F59E0B','#10B981','#8B5CF6','#06B6D4','#EC4899','#F97316'];
let colorIdx = 0;

function handleFilesInline(files) { processFiles(files, false); }

function processFiles(files, fromPopup) {
  if (!files || !files.length) return;

  const arr      = Array.from(files);
  const shpFile  = arr.find(f => f.name.toLowerCase().endsWith('.shp'));
  const dbfFile  = arr.find(f => f.name.toLowerCase().endsWith('.dbf'));
  const geojson  = arr.find(f => f.name.toLowerCase().match(/\.(geojson|json)$/));
  const kml      = arr.find(f => f.name.toLowerCase().endsWith('.kml'));

  // ── GeoJSON / JSON ─────────────────────────────────────
  if (geojson) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const gj = JSON.parse(e.target.result);
        addGeoJSONToMap(gj, geojson.name.replace(/\.[^.]+$/, ''));
      } catch { showToast('ملف GeoJSON غير صحيح', 'error'); }
    };
    reader.readAsText(geojson);
    return;
  }

  // ── KML ────────────────────────────────────────────────
  if (kml) {
    showToast('KML: جاري القراءة...', 'info');
    const reader = new FileReader();
    reader.onload = e => {
      showToast('تم قراءة ملف KML بنجاح', 'success');
      // Simplified KML parsing placeholder
    };
    reader.readAsText(kml);
    return;
  }

  // ── Shapefile (.shp + .dbf) ────────────────────────────
  if (!shpFile) {
    showToast('يرجى رفع ملف .shp على الأقل', 'error');
    return;
  }

  showToast('جاري قراءة Shapefile...', 'info');
  showUploadBar(fromPopup, 20);

  const readFile = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = rej;
    r.readAsArrayBuffer(f);
  });

  const promises = [readFile(shpFile)];
  if (dbfFile) promises.push(readFile(dbfFile));

  Promise.all(promises).then(buffers => {
    showUploadBar(fromPopup, 60);

    try {
      // Use shpjs to parse
      const combined = dbfFile
        ? shp.combine([shp.parseShp(buffers[0]), shp.parseDbf(buffers[1])])
        : { type: 'FeatureCollection', features: shp.parseShp(buffers[0]).map(g => ({ type: 'Feature', geometry: g, properties: {} })) };

      showUploadBar(fromPopup, 90);
      const layerName = shpFile.name.replace('.shp', '');
      addGeoJSONToMap(combined, layerName);
      showUploadBar(fromPopup, 100);
      if (fromPopup) closePopup('upload-popup');

    } catch (err) {
      showToast('خطأ في قراءة الـ Shapefile: ' + err.message, 'error');
      console.error(err);
    }
  }).catch(err => {
    showToast('خطأ في قراءة الملف', 'error');
    console.error(err);
  });
}

function makeGeoJSONLayer(geojson, name, color) {
  return L.geoJSON(geojson, {
    style: () => ({ color, fillColor: color, fillOpacity: 0.25, weight: 2, opacity: 0.9 }),
    pointToLayer: (_feat, latlng) => L.circleMarker(latlng, {
      radius: 7, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 0.85,
    }),
    onEachFeature: (feature, layer) => {
      const props = feature.properties || {};
      const rows  = Object.entries(props).slice(0, 10)
        .map(([k, v]) => `<div class="feature-attr"><span class="feature-attr-key">${k}</span><span class="feature-attr-val">${v ?? '—'}</span></div>`)
        .join('');
      layer.bindPopup(`<div class="feature-popup">
        <div class="feature-popup-title">📌 ${name}</div>
        ${rows || '<div class="feature-attr"><span class="feature-attr-key">لا توجد خصائص</span></div>'}
      </div>`, { maxWidth: 320 });
    },
  });
}

function addGeoJSONToMap(geojson, name) {
  const color     = LAYER_COLORS[colorIdx++ % LAYER_COLORS.length];
  const featCount = geojson.features ? geojson.features.length : '?';

  // ── Create a SEPARATE layer instance per map ──────────
  const layersByMap = {};
  let   boundsRef   = null;

  ['dashboard', 'main'].forEach(key => {
    const map = STATE.maps[key];
    if (!map) return;
    const lyr = makeGeoJSONLayer(geojson, name, color);  // NEW instance each time
    if (!map._uploadedGroup) map._uploadedGroup = L.layerGroup().addTo(map);
    map._uploadedGroup.addLayer(lyr);
    layersByMap[key] = lyr;
    if (!boundsRef) {
      try { const b = lyr.getBounds(); if (b.isValid()) boundsRef = b; } catch {}
    }
  });

  // ── Fly map to data ───────────────────────────────────
  const flyMap = STATE.maps[STATE.currentPage] || STATE.maps.dashboard || STATE.maps.main;
  if (flyMap && boundsRef) {
    flyMap.flyToBounds(boundsRef, { padding: [50, 50], maxZoom: 14, duration: 1.5 });
  }

  // ── UI updates ────────────────────────────────────────
  addUploadedLayerToPanel(name, color, featCount);
  addRowToDataTable(name, geojson, color);
  STATE.uploadedLayers.push({ name, geojson, color, layersByMap });

  showToast(`✅ تم رفع "${name}" — ${featCount} معلم`, 'success');
  setTimeout(() => showToast('انتقل إلى "عرض الخريطة" لرؤية الطبقة كاملاً', 'info'), 1800);

  updateAttrTable(geojson, name);
}

function addRowToDataTable(name, geojson, color) {
  const tbody   = document.getElementById('data-tbody');
  if (!tbody) return;
  const count   = geojson.features ? geojson.features.length : 0;
  const type    = detectGeomType(geojson);
  const typeAr  = { Point: 'نقاط', MultiPoint: 'نقاط', LineString: 'خطوط', MultiLineString: 'خطوط', Polygon: 'مضلعات', MultiPolygon: 'مضلعات' }[type] || type;
  const typeIcon = { 'نقاط': '●', 'خطوط': '〰️', 'مضلعات': '⬡' }[typeAr] || '📄';
  const today   = new Date().toISOString().split('T')[0];

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="checkbox" style="accent-color:#3B82F6"></td>
    <td><strong style="color:#F1F5F9">${typeIcon} ${name}</strong> <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:4px"></span></td>
    <td><span class="badge badge-blue">${typeAr}</span></td>
    <td>${count.toLocaleString('ar')}</td>
    <td>—</td>
    <td>${today}</td>
    <td><span class="badge badge-green">نشط</span></td>
    <td>
      <div style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="flyToLayer('${name}')" title="عرض">👁️</button>
        <button class="btn btn-danger btn-sm btn-icon" onclick="this.closest('tr').remove();showToast('تم الحذف','success')" title="حذف">🗑️</button>
      </div>
    </td>`;
  tbody.insertBefore(tr, tbody.firstChild);
}

function detectGeomType(geojson) {
  if (!geojson.features || !geojson.features.length) return 'Unknown';
  return geojson.features[0].geometry?.type || 'Unknown';
}

function flyToLayer(name) {
  const entry = STATE.uploadedLayers.find(l => l.name === name);
  if (!entry) return;
  navigateTo('map');
  setTimeout(() => {
    const map = STATE.maps.main;
    if (!map) return;
    // إذا لم تكن الطبقة موجودة في خريطة map بعد، أضفها الآن
    if (!entry.layersByMap.main) {
      const lyr = makeGeoJSONLayer(entry.geojson, entry.name, entry.color);
      if (!map._uploadedGroup) map._uploadedGroup = L.layerGroup().addTo(map);
      map._uploadedGroup.addLayer(lyr);
      entry.layersByMap.main = lyr;
    }
    try {
      const bounds = entry.layersByMap.main.getBounds();
      if (bounds.isValid()) map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    } catch {}
  }, 400);
}

function updateAttrTable(geojson, name) {
  const panel = document.getElementById('attr-panel-body');
  if (!panel || !geojson.features) return;
  const features = geojson.features.slice(0, 50);
  if (!features.length) return;
  const keys = Object.keys(features[0].properties || {}).slice(0, 8);
  const head = keys.map(k => `<th>${k}</th>`).join('');
  const rows = features.map((f, i) => {
    const cells = keys.map(k => `<td>${f.properties?.[k] ?? '—'}</td>`).join('');
    return `<tr><td>${i+1}</td>${cells}</tr>`;
  }).join('');
  panel.innerHTML = `<table class="data-table" style="font-size:11px">
    <thead><tr><th>#</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  const badge = document.querySelector('.attr-panel-header .badge-blue');
  if (badge) badge.textContent = `${geojson.features.length} سجل — ${name}`;
}

// ─── Upload progress bar ──────────────────────────────────
function showUploadBar(fromPopup, pct) {
  if (fromPopup) {
    const bar  = document.getElementById('up2');
    const txt  = document.getElementById('up2-txt');
    const wrap = document.getElementById('upload-progress-wrap-popup');
    if (wrap) wrap.style.display = 'block';
    if (bar)  bar.style.width   = pct + '%';
    if (txt)  txt.textContent   = pct + '%';
  } else {
    const bar  = document.getElementById('upload-progress-fill');
    const txt  = document.getElementById('upload-progress-text');
    const wrap = document.getElementById('upload-progress-wrap');
    if (wrap) wrap.style.display = 'block';
    if (bar)  bar.style.width   = pct + '%';
    if (txt)  txt.textContent   = pct + '%';
  }
}

function startUploadPopup() {
  // الأولوية: ملفات مسحوبة بالـ drag-drop، ثم ملفات مختارة من file picker
  const dropZone   = document.getElementById('popup-drop-zone');
  const input      = document.getElementById('file-input');
  const droppedFiles = dropZone?._droppedFiles;
  const files = (droppedFiles && droppedFiles.length) ? droppedFiles : input?.files;

  if (!files || !files.length) {
    showToast('اختر ملفاً أولاً أو اسحبه إلى المربع أعلاه', 'error');
    return;
  }
  processFiles(files, true);
}

// ─── Data Table ───────────────────────────────────────────
const SAMPLE_DATA = [
  { id:'SHP001', name:'طبقة الطرق - الرياض',       type:'خطوط',    features:1842, size:'12.4 MB', date:'2025-01-15', status:'نشط'           },
  { id:'SHP002', name:'مباني المدن الكبرى',         type:'مضلعات',  features:5621, size:'34.8 MB', date:'2025-01-12', status:'نشط'           },
  { id:'SHP003', name:'حدود المناطق الإدارية',      type:'مضلعات',  features:13,   size:'2.1 MB',  date:'2025-01-10', status:'نشط'           },
  { id:'SHP004', name:'شبكة المياه',                type:'خطوط',    features:987,  size:'8.9 MB',  date:'2024-12-28', status:'محدّث'         },
  { id:'SHP005', name:'نقاط الاهتمام',              type:'نقاط',    features:3421, size:'5.2 MB',  date:'2024-12-20', status:'نشط'           },
  { id:'SHP006', name:'مناطق التخطيط العمراني',     type:'مضلعات',  features:94,   size:'6.7 MB',  date:'2024-12-15', status:'قيد المراجعة' },
];

function buildDataTable() {
  const tbody = document.getElementById('data-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  SAMPLE_DATA.forEach(row => {
    const statusCls = { 'نشط':'badge-green', 'محدّث':'badge-blue', 'قيد المراجعة':'badge-orange' }[row.status] || 'badge-gray';
    const typeIcon  = { 'خطوط':'〰️', 'مضلعات':'⬡', 'نقاط':'●' }[row.type] || '📄';
    tbody.innerHTML += `
      <tr>
        <td><input type="checkbox" style="accent-color:#3B82F6"></td>
        <td><strong style="color:#F1F5F9">${typeIcon} ${row.name}</strong></td>
        <td><span class="badge badge-gray">${row.type}</span></td>
        <td>${row.features.toLocaleString('ar')}</td>
        <td>${row.size}</td>
        <td>${row.date}</td>
        <td><span class="badge ${statusCls}">${row.status}</span></td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="showToast('جاري فتح الطبقة...','info')" title="عرض">👁️</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="showToast('جاري تحرير الطبقة...','info')" title="تحرير">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDelete(this)" title="حذف">🗑️</button>
          </div>
        </td>
      </tr>`;
  });
}

function confirmDelete(btn) {
  if (confirm('هل تريد حذف هذا العنصر؟')) {
    btn.closest('tr').remove();
    showToast('تم حذف الطبقة بنجاح', 'success');
  }
}

// ─── Charts ───────────────────────────────────────────────
function initCharts() {
  const pieCtx = document.getElementById('chart-pie');
  if (pieCtx) {
    STATE.charts.pie = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['طرق','مباني','أراضي','مجاري','مناطق'],
        datasets: [{ data:[1842,5621,3108,287,94], backgroundColor:['#3B82F6','#10B981','#F59E0B','#06B6D4','#8B5CF6'], borderColor:'transparent' }],
      },
      options: { cutout:'68%', plugins:{ legend:{ position:'bottom', labels:{ color:'#94A3B8', font:{ family:'Cairo', size:11 }, boxWidth:10, padding:12 } } } },
    });
  }

  const barCtx = document.getElementById('chart-bar');
  if (barCtx) {
    STATE.charts.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: ['يناير','فبراير','مارس','أبريل','مايو','يونيو'],
        datasets: [
          { label:'مباني', data:[420,380,510,460,540,490], backgroundColor:'rgba(59,130,246,0.7)', borderRadius:4 },
          { label:'طرق',   data:[180,220,190,250,210,270], backgroundColor:'rgba(16,185,129,0.7)', borderRadius:4 },
        ],
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ labels:{ color:'#94A3B8', font:{ family:'Cairo', size:11 } } } },
        scales:{ x:{ ticks:{ color:'#475569', font:{family:'Cairo'} }, grid:{ color:'rgba(255,255,255,0.04)' } }, y:{ ticks:{ color:'#475569', font:{family:'Cairo'} }, grid:{ color:'rgba(255,255,255,0.04)' } } },
      },
    });
  }

  const timeCtx = document.getElementById('chart-time');
  if (timeCtx) {
    STATE.charts.time = new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر'],
        datasets: [{ label:'نشاط المنطقة', data:[42,68,55,80,73,91,85,110,98], borderColor:'#3B82F6', backgroundColor:'rgba(59,130,246,0.08)', fill:true, tension:0.4, pointBackgroundColor:'#3B82F6', pointRadius:4 }],
      },
      options: { responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{ x:{ ticks:{ color:'#475569', font:{family:'Cairo',size:11} }, grid:{ color:'rgba(255,255,255,0.04)' } }, y:{ ticks:{ color:'#475569', font:{family:'Cairo',size:11} }, grid:{ color:'rgba(255,255,255,0.04)' } } },
      },
    });
  }
}

function initAnalyticsCharts() {
  const defs = [
    { id:'analytics-bar',   type:'bar',    key:'analyticsBar',
      data:{ labels:['الرياض','جدة','الدمام','مكة','المدينة','تبوك','أبها'], datasets:[{ label:'الكثافة السكانية', data:[4.3,3.9,2.8,3.1,1.9,0.8,0.5], backgroundColor:['#3B82F6','#10B981','#F59E0B','#06B6D4','#8B5CF6','#EF4444','#F97316'], borderRadius:6 }] },
      options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#94A3B8',font:{family:'Cairo'}}}}, scales:{x:{ticks:{color:'#475569',font:{family:'Cairo'}},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'#475569',font:{family:'Cairo'}},grid:{color:'rgba(255,255,255,0.04)'}}} },
    },
    { id:'analytics-line',  type:'line',   key:'analyticsLine',
      data:{ labels:['2018','2019','2020','2021','2022','2023','2024','2025'], datasets:[
        { label:'المساحة الحضرية (كم²)', data:[1200,1380,1450,1590,1720,1850,2010,2200], borderColor:'#3B82F6', backgroundColor:'rgba(59,130,246,0.08)', fill:true, tension:0.4, pointRadius:4 },
        { label:'المناطق الخضراء (كم²)',  data:[320,310,295,280,290,310,330,360],         borderColor:'#10B981', backgroundColor:'rgba(16,185,129,0.06)', fill:true, tension:0.4, pointRadius:4 },
      ] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#94A3B8',font:{family:'Cairo',size:11}}}}, scales:{x:{ticks:{color:'#475569',font:{family:'Cairo'}},grid:{color:'rgba(255,255,255,0.04)'}},y:{ticks:{color:'#475569',font:{family:'Cairo'}},grid:{color:'rgba(255,255,255,0.04)'}}} },
    },
    { id:'analytics-radar', type:'radar',  key:'analyticsRadar',
      data:{ labels:['البنية التحتية','الخدمات','الاتصالات','النقل','البيئة','الأمن'], datasets:[
        { label:'الرياض', data:[90,85,92,88,65,95], borderColor:'#3B82F6', backgroundColor:'rgba(59,130,246,0.1)', pointBackgroundColor:'#3B82F6' },
        { label:'جدة',    data:[82,90,85,80,72,88], borderColor:'#10B981', backgroundColor:'rgba(16,185,129,0.1)', pointBackgroundColor:'#10B981' },
      ] },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#94A3B8',font:{family:'Cairo',size:11}}}}, scales:{r:{angleLines:{color:'rgba(255,255,255,0.06)'},grid:{color:'rgba(255,255,255,0.06)'},pointLabels:{color:'#94A3B8',font:{family:'Cairo',size:11}},ticks:{display:false}}} },
    },
    { id:'analytics-pie',   type:'doughnut', key:'analyticsPie',
      data:{ labels:['سكني','تجاري','صناعي','حكومي','ترفيهي'], datasets:[{ data:[45,22,18,10,5], backgroundColor:['#3B82F6','#F59E0B','#EF4444','#8B5CF6','#10B981'], borderColor:'transparent' }] },
      options:{ cutout:'65%', responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'right',labels:{color:'#94A3B8',font:{family:'Cairo',size:11}}}} },
    },
  ];
  defs.forEach(d => {
    const ctx = document.getElementById(d.id);
    if (ctx && !STATE.charts[d.key]) STATE.charts[d.key] = new Chart(ctx, { type:d.type, data:d.data, options:d.options });
  });
}

// ─── Projects ─────────────────────────────────────────────
const PROJECTS = [
  { name:'مشروع تحليل النمو الحضري',    type:'تحليل مكاني',    layers:8,  updated:'منذ يومين',    color:'#3B82F6' },
  { name:'رصد البنية التحتية',           type:'إدارة الأصول',   layers:14, updated:'منذ أسبوع',    color:'#10B981' },
  { name:'مناطق الخطر البيئي',           type:'تقييم المخاطر',  layers:5,  updated:'منذ 3 أيام',   color:'#EF4444' },
  { name:'تخطيط شبكة النقل',            type:'تحليل الشبكات',  layers:11, updated:'اليوم',          color:'#F59E0B' },
  { name:'تحليل الكثافة السكانية',       type:'ديموغرافيا',     layers:6,  updated:'منذ 5 أيام',   color:'#8B5CF6' },
  { name:'مسح المناطق الزراعية',         type:'استخدام الأراضي',layers:9,  updated:'منذ أسبوعين',  color:'#06B6D4' },
];

function buildProjectCards() {
  const container = document.getElementById('projects-grid');
  if (!container) return;
  container.innerHTML = '';
  PROJECTS.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.innerHTML = `
      <div class="project-thumb">
        <svg class="project-thumb-map" viewBox="0 0 300 160" xmlns="http://www.w3.org/2000/svg">
          <rect width="300" height="160" fill="#0F172A"/>
          ${generateMiniMap(proj.color)}
        </svg>
        <div class="project-thumb-overlay"></div>
        <div style="position:absolute;top:8px;right:8px;z-index:2"><span class="badge badge-blue" style="font-size:10px">${proj.type}</span></div>
      </div>
      <div class="project-info">
        <div class="project-name">${proj.name}</div>
        <div class="project-meta"><span>🗂️ ${proj.layers} طبقات</span><span>🕒 ${proj.updated}</span></div>
      </div>`;
    card.addEventListener('click', () => showToast(`فتح مشروع: ${proj.name}`, 'info'));
    container.appendChild(card);
  });
}

function generateMiniMap(color) {
  const lines = [], circles = [];
  for (let i = 0; i < 6; i++) {
    const y1 = 20+Math.random()*120, y2 = 20+Math.random()*120;
    lines.push(`<line x1="0" y1="${y1|0}" x2="300" y2="${y2|0}" stroke="${color}" stroke-width="1" opacity="0.3"/>`);
  }
  for (let i = 0; i < 8; i++) {
    const x = 20+Math.random()*260, y = 10+Math.random()*140, r = 2+Math.random()*4;
    circles.push(`<circle cx="${x|0}" cy="${y|0}" r="${r.toFixed(1)}" fill="${color}" opacity="0.6"/>`);
  }
  return [...lines,...circles].join('');
}

// ─── Toasts ───────────────────────────────────────────────
function initToasts() {
  if (!document.getElementById('toast-container')) {
    const tc = document.createElement('div');
    tc.id = 'toast-container'; tc.className = 'toast-container';
    document.body.appendChild(tc);
  }
}

function showToast(msg, type = 'info') {
  const tc = document.getElementById('toast-container');
  if (!tc) return;
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  tc.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0'; toast.style.transform = 'translateX(-20px)'; toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ─── Popup ────────────────────────────────────────────────
function openPopup(id)  { document.getElementById(id)?.classList.add('open');    }
function closePopup(id) { document.getElementById(id)?.classList.remove('open'); }

// ─── Settings ─────────────────────────────────────────────
function toggleRTL() {
  STATE.rtl = !STATE.rtl;
  document.body.classList.toggle('ltr', !STATE.rtl);
  showToast(STATE.rtl ? 'تم التبديل إلى العربية (RTL)' : 'Switched to LTR mode', 'info');
}

function toggleDarkMode() { showToast('الوضع المظلم مفعّل للحصول على أفضل تجربة GIS', 'info'); }

// ─── Analysis ─────────────────────────────────────────────
function runAnalysis(tool) {
  const names = { buffer:'تحليل Buffer', nearest:'أقرب جار', heatmap:'خريطة الحرارة', density:'تحليل الكثافة', query:'استعلام مكاني' };
  showToast(`جاري تشغيل: ${names[tool]||tool}...`, 'info');
  setTimeout(() => showToast('اكتمل التحليل — 3 نتائج', 'success'), 2000);
}

// ─── Tabs ─────────────────────────────────────────────────
function switchTab(groupId, tabId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  group.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
}

// ─── Export ───────────────────────────────────────────────
function exportData(fmt) {
  showToast(`جاري تصدير البيانات بصيغة ${fmt}...`, 'info');
  setTimeout(() => showToast(`تم تصدير البيانات بصيغة ${fmt} بنجاح`, 'success'), 1500);
}

// ─── Logout ───────────────────────────────────────────────
function logout() {
  document.getElementById('app').classList.remove('visible');
  document.getElementById('auth-page').style.display = 'flex';
  showToast('تم تسجيل الخروج بنجاح', 'info');
}

// ─── Expose globals ───────────────────────────────────────
Object.assign(window, {
  navigateTo, changeBasemap, showToast, openPopup, closePopup,
  toggleRTL, toggleDarkMode, runAnalysis, switchTab, exportData,
  logout, confirmDelete, startUploadPopup, handleFilesInline, flyToLayer, processFiles,
});
