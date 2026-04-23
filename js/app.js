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
    { id: 'roads', name: 'شبكة الطرق', color: '#3B82F6', visible: true, count: 1842 },
    { id: 'buildings', name: 'المباني', color: '#10B981', visible: true, count: 5621 },
    { id: 'parcels', name: 'قطع الأراضي', color: '#F59E0B', visible: false, count: 3108 },
    { id: 'rivers', name: 'المجاري المائية', color: '#06B6D4', visible: true, count: 287 },
    { id: 'zones', name: 'مناطق التخطيط', color: '#8B5CF6', visible: false, count: 94 },
  ],
  activeTool: null,
  maps: {},
  charts: {},
  uploadProgress: 0,
  selectedFeatures: [],
};

// ─── Fix Leaflet icon paths (offline) ─────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl:       'libs/leaflet/marker-icon.png',
  iconRetinaUrl: 'libs/leaflet/marker-icon-2x.png',
  shadowUrl:     'libs/leaflet/marker-shadow.png',
});

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
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      loginForm.style.display = tab === 'login' ? 'block' : 'none';
      registerForm.style.display = tab === 'register' ? 'block' : 'none';
    });
  });

  document.getElementById('btn-login').addEventListener('click', doLogin);
  document.getElementById('btn-register').addEventListener('click', doRegister);
}

function doLogin() {
  const email = document.getElementById('login-email').value;
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) { showToast('يرجى إدخال البريد الإلكتروني وكلمة المرور', 'error'); return; }
  showToast('جاري تسجيل الدخول...', 'info');
  setTimeout(() => {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    setTimeout(() => {
      initApp();
      showToast('مرحباً بك في GeoVision Pro! 🌍', 'success');
    }, 100);
  }, 800);
}

function doRegister() {
  const name = document.getElementById('reg-name').value;
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
    const icon = document.getElementById('toggle-icon');
    icon.textContent = STATE.sidebarCollapsed ? '›' : '‹';
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

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
  });

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(`page-${page}`);
  if (target) target.classList.add('active');

  updateTopbar(page);

  if (page === 'map' && !STATE.maps.main) setTimeout(initMainMap, 100);
  if (page === 'analytics' && !STATE.charts.analyticsBar) setTimeout(initAnalyticsCharts, 100);
}

const PAGE_META = {
  dashboard: { title: 'لوحة التحكم', subtitle: 'نظرة عامة على البيانات الجغرافية' },
  map: { title: 'عرض الخريطة', subtitle: 'واجهة GIS التفاعلية الكاملة' },
  data: { title: 'إدارة البيانات', subtitle: 'رفع وتحرير طبقات البيانات الجغرافية' },
  analytics: { title: 'التحليلات', subtitle: 'رؤى متقدمة وتحليل المؤشرات' },
  projects: { title: 'المشاريع', subtitle: 'مشاريع GIS والخرائط المحفوظة' },
  settings: { title: 'الإعدادات', subtitle: 'إعدادات المنصة والمستخدم' },
};

function updateTopbar(page) {
  const meta = PAGE_META[page] || {};
  document.getElementById('topbar-title').textContent = meta.title || '';
  document.getElementById('topbar-subtitle').textContent = meta.subtitle || '';
}

// ─── Maps ─────────────────────────────────────────────────
// ─── Offline Basemap Styles ───────────────────────────────
const BASEMAP_STYLES = {
  dark:      { bg: '#0B1426', grid: 'rgba(59,130,246,0.08)',  land: '#0F1F3D', water: '#060D1A', road: 'rgba(59,130,246,0.25)' },
  streets:   { bg: '#1A2035', grid: 'rgba(100,160,255,0.1)', land: '#1E2D4A', water: '#0A1628', road: 'rgba(96,165,250,0.35)' },
  satellite: { bg: '#0A1A0A', grid: 'rgba(16,185,129,0.08)', land: '#0F2A0F', water: '#041410', road: 'rgba(16,185,129,0.2)' },
};

function createOfflineBasemap(style) {
  return L.tileLayer('', {
    tileSize: 256,
    createTile: function(coords) {
      const tile = document.createElement('canvas');
      tile.width = tile.height = 256;
      const ctx = tile.getContext('2d');
      const s = style;

      // Background
      ctx.fillStyle = s.bg;
      ctx.fillRect(0, 0, 256, 256);

      // Land mass suggestion
      ctx.fillStyle = s.land;
      ctx.beginPath();
      const seed = (coords.x * 7 + coords.y * 13 + coords.z * 3);
      const rng = (n) => ((Math.sin(n * 127.1 + seed) * 43758.5453) % 1 + 1) % 1;
      for (let i = 0; i < 3; i++) {
        const x = rng(i*3)*256, y = rng(i*3+1)*256;
        const rx = 40 + rng(i*3+2)*80, ry = 30 + rng(i*3+3)*60;
        ctx.ellipse(x, y, rx, ry, rng(i)*Math.PI, 0, Math.PI*2);
      }
      ctx.fill();

      // Grid lines
      ctx.strokeStyle = s.grid;
      ctx.lineWidth = 0.5;
      const step = 32;
      for (let x = 0; x <= 256; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
      }
      for (let y = 0; y <= 256; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      }

      // Water bodies
      ctx.fillStyle = s.water;
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.ellipse(rng(i+10)*256, rng(i+11)*256, 20+rng(i+12)*40, 15+rng(i+13)*30, rng(i+14)*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Road-like lines
      ctx.strokeStyle = s.road;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(rng(i+20)*256, rng(i+21)*256);
        ctx.bezierCurveTo(rng(i+22)*256, rng(i+23)*256, rng(i+24)*256, rng(i+25)*256, rng(i+26)*256, rng(i+27)*256);
        ctx.stroke();
      }

      return tile;
    }
  });
}

function createMap(elId, center = [24.7136, 46.6753], zoom = 6) {
  const map = L.map(elId, {
    center, zoom,
    zoomControl: false,
    attributionControl: false,
  });

  const layer = createOfflineBasemap(BASEMAP_STYLES.dark);
  layer.addTo(map);
  map._basemapLayer = layer;
  map._currentStyle = 'dark';

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

function addSampleData(map) {
  const cities = [
    { name: 'الرياض', lat: 24.7136, lon: 46.6753, pop: 7630000, type: 'عاصمة' },
    { name: 'جدة', lat: 21.4858, lon: 39.1925, pop: 4280000, type: 'مدينة' },
    { name: 'مكة المكرمة', lat: 21.3891, lon: 39.8579, pop: 2042000, type: 'مدينة مقدسة' },
    { name: 'المدينة المنورة', lat: 24.5247, lon: 39.5692, pop: 1180770, type: 'مدينة مقدسة' },
    { name: 'الدمام', lat: 26.4207, lon: 50.0888, pop: 1000000, type: 'مدينة' },
    { name: 'تبوك', lat: 28.3998, lon: 36.5715, pop: 600000, type: 'مدينة' },
    { name: 'أبها', lat: 18.2164, lon: 42.5053, pop: 381000, type: 'مدينة' },
    { name: 'نجران', lat: 17.5656, lon: 44.2289, pop: 280000, type: 'مدينة' },
  ];

  cities.forEach(city => {
    const size = Math.max(8, Math.min(24, city.pop / 400000));
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px;height:${size}px;
        background:rgba(59,130,246,0.8);
        border:2px solid rgba(96,165,250,0.9);
        border-radius:50%;
        box-shadow:0 0 ${size}px rgba(59,130,246,0.4);
        cursor:pointer;
      "></div>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
    });

    L.marker([city.lat, city.lon], { icon })
      .bindPopup(`
        <div class="feature-popup">
          <div class="feature-popup-title">📍 ${city.name}</div>
          <div class="feature-attr"><span class="feature-attr-key">النوع</span><span class="feature-attr-val">${city.type}</span></div>
          <div class="feature-attr"><span class="feature-attr-key">السكان</span><span class="feature-attr-val">${city.pop.toLocaleString('ar')}</span></div>
          <div class="feature-attr"><span class="feature-attr-key">الإحداثيات</span><span class="feature-attr-val">${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</span></div>
        </div>
      `, { maxWidth: 260 })
      .addTo(map);
  });

  // Sample polygon
  const riyadhZone = L.polygon([
    [25.1, 46.2], [25.1, 47.2], [24.2, 47.2], [24.2, 46.2]
  ], {
    color: '#10B981', fillColor: '#10B981',
    fillOpacity: 0.08, weight: 1.5, dashArray: '6,4',
  }).addTo(map);

  riyadhZone.bindPopup(`
    <div class="feature-popup">
      <div class="feature-popup-title">🟢 منطقة التخطيط — الرياض الكبرى</div>
      <div class="feature-attr"><span class="feature-attr-key">المساحة</span><span class="feature-attr-val">27,100 كم²</span></div>
      <div class="feature-attr"><span class="feature-attr-key">عدد المناطق</span><span class="feature-attr-val">22 حياً</span></div>
      <div class="feature-attr"><span class="feature-attr-key">الحالة</span><span class="feature-attr-val">نشطة</span></div>
    </div>
  `);

  // Sample line
  L.polyline([
    [24.7, 46.6], [25.5, 47.5], [26.4, 50.0]
  ], { color: '#F59E0B', weight: 2.5, opacity: 0.7, dashArray: '0' }).addTo(map);
}

function changeBasemap(type, mapKey) {
  const map = STATE.maps[mapKey];
  if (!map) return;
  STATE.basemap = type;
  if (map._basemapLayer) map.removeLayer(map._basemapLayer);
  map._basemapLayer = createOfflineBasemap(BASEMAP_STYLES[type] || BASEMAP_STYLES.dark);
  map._basemapLayer.addTo(map);
  map._basemapLayer.bringToBack();

  document.querySelectorAll(`[data-basemap-map="${mapKey}"]`).forEach(btn => {
    btn.classList.toggle('active', btn.dataset.basemap === type);
  });
}

// ─── Map Tools ────────────────────────────────────────────
function initMapTools() {
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (STATE.activeTool === tool) {
        STATE.activeTool = null;
        btn.classList.remove('active');
        showToast(`تم إلغاء أداة: ${btn.textContent.trim()}`, 'info');
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
  const container = document.getElementById('layer-list');
  if (!container) return;
  container.innerHTML = '';
  STATE.layers.forEach(layer => {
    const el = document.createElement('div');
    el.className = 'layer-item';
    el.innerHTML = `
      <div class="layer-color" style="background:${layer.color}"></div>
      <span class="layer-name">${layer.name}</span>
      <span class="layer-count">${layer.count.toLocaleString('ar')}</span>
      <div class="toggle ${layer.visible ? 'on' : ''}" data-layer="${layer.id}"></div>
    `;
    el.querySelector('.toggle').addEventListener('click', e => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      e.target.classList.toggle('on', layer.visible);
      showToast(`طبقة "${layer.name}" ${layer.visible ? 'مفعّلة' : 'معطّلة'}`, 'info');
    });
    container.appendChild(el);
  });

  // Also populate map-view layer list
  const mapLayers = document.getElementById('map-layer-list');
  if (mapLayers) mapLayers.innerHTML = container.innerHTML;
}

// ─── Charts ───────────────────────────────────────────────
function initCharts() {
  // Feature distribution pie
  const pieCtx = document.getElementById('chart-pie');
  if (pieCtx) {
    STATE.charts.pie = new Chart(pieCtx, {
      type: 'doughnut',
      data: {
        labels: ['طرق', 'مباني', 'أراضي', 'مجاري', 'مناطق'],
        datasets: [{
          data: [1842, 5621, 3108, 287, 94],
          backgroundColor: ['#3B82F6', '#10B981', '#F59E0B', '#06B6D4', '#8B5CF6'],
          borderColor: 'transparent',
          borderWidth: 0,
          hoverOffset: 6,
        }],
      },
      options: {
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94A3B8', font: { family: 'Cairo', size: 11 }, boxWidth: 10, padding: 12 } },
        },
      },
    });
  }

  // Monthly bar chart
  const barCtx = document.getElementById('chart-bar');
  if (barCtx) {
    STATE.charts.bar = new Chart(barCtx, {
      type: 'bar',
      data: {
        labels: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو'],
        datasets: [
          { label: 'مباني', data: [420, 380, 510, 460, 540, 490], backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 4 },
          { label: 'طرق', data: [180, 220, 190, 250, 210, 270], backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94A3B8', font: { family: 'Cairo', size: 11 } } } },
        scales: {
          x: { ticks: { color: '#475569', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#475569', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  // Timeline chart
  const timeCtx = document.getElementById('chart-time');
  if (timeCtx) {
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر'];
    STATE.charts.time = new Chart(timeCtx, {
      type: 'line',
      data: {
        labels: months,
        datasets: [{
          label: 'نشاط المنطقة',
          data: [42, 68, 55, 80, 73, 91, 85, 110, 98],
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          fill: true,
          tension: 0.4,
          pointBackgroundColor: '#3B82F6',
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#475569', font: { family: 'Cairo', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#475569', font: { family: 'Cairo', size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }
}

function initAnalyticsCharts() {
  const ctx1 = document.getElementById('analytics-bar');
  if (ctx1 && !STATE.charts.analyticsBar) {
    STATE.charts.analyticsBar = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['الرياض', 'جدة', 'الدمام', 'مكة', 'المدينة', 'تبوك', 'أبها'],
        datasets: [{
          label: 'الكثافة السكانية (ألف/كم²)',
          data: [4.3, 3.9, 2.8, 3.1, 1.9, 0.8, 0.5],
          backgroundColor: ['#3B82F6','#10B981','#F59E0B','#06B6D4','#8B5CF6','#EF4444','#F97316'],
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94A3B8', font: { family: 'Cairo' } } } },
        scales: {
          x: { ticks: { color: '#475569', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#475569', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  const ctx2 = document.getElementById('analytics-line');
  if (ctx2 && !STATE.charts.analyticsLine) {
    STATE.charts.analyticsLine = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'],
        datasets: [
          { label: 'المساحة الحضرية (كم²)', data: [1200, 1380, 1450, 1590, 1720, 1850, 2010, 2200], borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.4, pointRadius: 4 },
          { label: 'المناطق الخضراء (كم²)', data: [320, 310, 295, 280, 290, 310, 330, 360], borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.06)', fill: true, tension: 0.4, pointRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94A3B8', font: { family: 'Cairo', size: 11 } } } },
        scales: {
          x: { ticks: { color: '#475569', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
          y: { ticks: { color: '#475569', font: { family: 'Cairo' } }, grid: { color: 'rgba(255,255,255,0.04)' } },
        },
      },
    });
  }

  const ctx3 = document.getElementById('analytics-radar');
  if (ctx3 && !STATE.charts.analyticsRadar) {
    STATE.charts.analyticsRadar = new Chart(ctx3, {
      type: 'radar',
      data: {
        labels: ['البنية التحتية', 'الخدمات', 'الاتصالات', 'النقل', 'البيئة', 'الأمن'],
        datasets: [
          { label: 'الرياض', data: [90, 85, 92, 88, 65, 95], borderColor: '#3B82F6', backgroundColor: 'rgba(59,130,246,0.1)', pointBackgroundColor: '#3B82F6' },
          { label: 'جدة', data: [82, 90, 85, 80, 72, 88], borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.1)', pointBackgroundColor: '#10B981' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#94A3B8', font: { family: 'Cairo', size: 11 } } } },
        scales: {
          r: {
            angleLines: { color: 'rgba(255,255,255,0.06)' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            pointLabels: { color: '#94A3B8', font: { family: 'Cairo', size: 11 } },
            ticks: { display: false },
          },
        },
      },
    });
  }

  const ctx4 = document.getElementById('analytics-pie');
  if (ctx4 && !STATE.charts.analyticsPie) {
    STATE.charts.analyticsPie = new Chart(ctx4, {
      type: 'doughnut',
      data: {
        labels: ['سكني', 'تجاري', 'صناعي', 'حكومي', 'ترفيهي'],
        datasets: [{
          data: [45, 22, 18, 10, 5],
          backgroundColor: ['#3B82F6','#F59E0B','#EF4444','#8B5CF6','#10B981'],
          borderColor: 'transparent',
        }],
      },
      options: {
        cutout: '65%',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: '#94A3B8', font: { family: 'Cairo', size: 11 } } } },
      },
    });
  }
}

// ─── Data Table ───────────────────────────────────────────
const SAMPLE_DATA = [
  { id: 'SHP001', name: 'طبقة الطرق - الرياض', type: 'خطوط', features: 1842, size: '12.4 MB', date: '2025-01-15', status: 'نشط' },
  { id: 'SHP002', name: 'مباني المدن الكبرى', type: 'مضلعات', features: 5621, size: '34.8 MB', date: '2025-01-12', status: 'نشط' },
  { id: 'SHP003', name: 'حدود المناطق الإدارية', type: 'مضلعات', features: 13, size: '2.1 MB', date: '2025-01-10', status: 'نشط' },
  { id: 'SHP004', name: 'شبكة المياه', type: 'خطوط', features: 987, size: '8.9 MB', date: '2024-12-28', status: 'محدّث' },
  { id: 'SHP005', name: 'نقاط الاهتمام', type: 'نقاط', features: 3421, size: '5.2 MB', date: '2024-12-20', status: 'نشط' },
  { id: 'SHP006', name: 'مناطق التخطيط العمراني', type: 'مضلعات', features: 94, size: '6.7 MB', date: '2024-12-15', status: 'قيد المراجعة' },
];

function buildDataTable() {
  const tbody = document.getElementById('data-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  SAMPLE_DATA.forEach(row => {
    const statusClass = { 'نشط': 'badge-green', 'محدّث': 'badge-blue', 'قيد المراجعة': 'badge-orange' }[row.status] || 'badge-gray';
    const typeIcon = { 'خطوط': '〰️', 'مضلعات': '⬡', 'نقاط': '●' }[row.type] || '📄';
    tbody.innerHTML += `
      <tr>
        <td><input type="checkbox" style="accent-color:#3B82F6"></td>
        <td><span style="font-weight:600;color:#F1F5F9">${typeIcon} ${row.name}</span></td>
        <td><span class="badge badge-gray">${row.type}</span></td>
        <td>${row.features.toLocaleString('ar')}</td>
        <td>${row.size}</td>
        <td>${row.date}</td>
        <td><span class="badge ${statusClass}">${row.status}</span></td>
        <td>
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" onclick="showToast('جاري فتح الطبقة...','info')" title="عرض">👁️</button>
            <button class="btn btn-ghost btn-sm btn-icon" onclick="showToast('جاري تحرير الطبقة...','info')" title="تحرير">✏️</button>
            <button class="btn btn-danger btn-sm btn-icon" onclick="confirmDelete(this)" title="حذف">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  });
}

function confirmDelete(btn) {
  if (confirm('هل تريد حذف هذا العنصر؟')) {
    btn.closest('tr').remove();
    showToast('تم حذف الطبقة بنجاح', 'success');
  }
}

// ─── Projects ─────────────────────────────────────────────
const PROJECTS = [
  { name: 'مشروع تحليل النمو الحضري', type: 'تحليل مكاني', layers: 8, updated: 'منذ يومين', color: '#3B82F6' },
  { name: 'رصد البنية التحتية', type: 'إدارة الأصول', layers: 14, updated: 'منذ أسبوع', color: '#10B981' },
  { name: 'مناطق الخطر البيئي', type: 'تقييم المخاطر', layers: 5, updated: 'منذ 3 أيام', color: '#EF4444' },
  { name: 'تخطيط شبكة النقل', type: 'تحليل الشبكات', layers: 11, updated: 'اليوم', color: '#F59E0B' },
  { name: 'تحليل الكثافة السكانية', type: 'ديموغرافيا', layers: 6, updated: 'منذ 5 أيام', color: '#8B5CF6' },
  { name: 'مسح المناطق الزراعية', type: 'استخدام الأراضي', layers: 9, updated: 'منذ أسبوعين', color: '#06B6D4' },
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
        <div style="position:absolute;top:8px;right:8px;z-index:2">
          <span class="badge badge-blue" style="font-size:10px">${proj.type}</span>
        </div>
      </div>
      <div class="project-info">
        <div class="project-name">${proj.name}</div>
        <div class="project-meta">
          <span>🗂️ ${proj.layers} طبقات</span>
          <span>🕒 ${proj.updated}</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => showToast(`فتح مشروع: ${proj.name}`, 'info'));
    container.appendChild(card);
  });
}

function generateMiniMap(color) {
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const y1 = 20 + Math.random() * 120;
    const y2 = 20 + Math.random() * 120;
    lines.push(`<line x1="0" y1="${y1.toFixed(0)}" x2="300" y2="${y2.toFixed(0)}" stroke="${color}" stroke-width="1" opacity="0.3"/>`);
  }
  const circles = [];
  for (let i = 0; i < 8; i++) {
    const x = 20 + Math.random() * 260;
    const y = 10 + Math.random() * 140;
    const r = 2 + Math.random() * 4;
    circles.push(`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="${color}" opacity="0.6"/>`);
  }
  return [...lines, ...circles].join('');
}

// ─── Upload ───────────────────────────────────────────────
function initUploadZone() {
  const zone = document.getElementById('upload-zone');
  if (!zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragging');
    handleFiles(e.dataTransfer.files);
  });
  zone.addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', e => handleFiles(e.target.files));
}

function handleFiles(files) {
  if (!files.length) return;
  const names = Array.from(files).map(f => f.name).join(', ');
  showToast(`جاري رفع: ${names}`, 'info');
  simulateUpload();
}

function simulateUpload() {
  const bar = document.getElementById('upload-progress-fill');
  const text = document.getElementById('upload-progress-text');
  const wrap = document.getElementById('upload-progress-wrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 15;
    if (pct >= 100) { pct = 100; clearInterval(iv); showToast('تم رفع الملف وتحويله إلى GeoJSON بنجاح!', 'success'); }
    if (bar) bar.style.width = pct.toFixed(0) + '%';
    if (text) text.textContent = pct.toFixed(0) + '%';
  }, 200);
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
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ️'}</span><span class="toast-msg">${msg}</span>`;
  tc.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-20px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ─── Popup ────────────────────────────────────────────────
function openPopup(id) {
  document.getElementById(id)?.classList.add('open');
}

function closePopup(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ─── Settings ─────────────────────────────────────────────
function toggleRTL() {
  STATE.rtl = !STATE.rtl;
  document.body.classList.toggle('ltr', !STATE.rtl);
  showToast(STATE.rtl ? 'تم التبديل إلى العربية (RTL)' : 'Switched to LTR mode', 'info');
}

function toggleDarkMode() {
  showToast('الوضع المظلم مفعّل دائماً للحصول على أفضل تجربة GIS', 'info');
}

// ─── Analysis Tools ───────────────────────────────────────
function runAnalysis(tool) {
  const tools = {
    buffer: 'تحليل المنطقة المحيطة (Buffer)',
    nearest: 'تحليل أقرب جار (Nearest Neighbor)',
    heatmap: 'خريطة الكثافة الحرارية (Heatmap)',
    density: 'تحليل الكثافة (Density)',
    query: 'استعلام مكاني (Spatial Query)',
  };
  showToast(`تشغيل: ${tools[tool] || tool}...`, 'info');
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
window.navigateTo = navigateTo;
window.changeBasemap = changeBasemap;
window.showToast = showToast;
window.openPopup = openPopup;
window.closePopup = closePopup;
window.toggleRTL = toggleRTL;
window.toggleDarkMode = toggleDarkMode;
window.runAnalysis = runAnalysis;
window.switchTab = switchTab;
window.exportData = exportData;
window.logout = logout;
window.confirmDelete = confirmDelete;
window.initUploadZone = initUploadZone;
