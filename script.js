let RAW = './';
if (window.location.hostname === 'kalidada18.github.io') {
  RAW = 'https://kalidada18.github.io/himalayafeed/';
} else if (window.location.protocol === 'file:') {
  RAW = 'https://raw.githubusercontent.com/kalidada18/himalayafeed/main/';
}
const fmt = n => new Intl.NumberFormat('en-US').format(n);

function animateValue(el, end, dur = 1600) {
  if (!el) return;
  const t0 = performance.now();
  (function frame(now) {
    const p = Math.min((now - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(end * ease));
    if (p < 1) requestAnimationFrame(frame);
  })(t0);
}

let feedVersion = Date.now();
let statsData = null;

async function boot() {
  try {
    lucide.createIcons();

    const r = await fetch(RAW + 'stats.json?_=' + Date.now());
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    statsData = d;
    feedVersion = d.last_updated || Date.now();

    animateValue(document.getElementById('n-total'), d.total_unique_ips);
    animateValue(document.getElementById('n-domains'), d.total_unique_domains || 0);
    animateValue(document.getElementById('n-hashes'), d.total_unique_hashes || 0);
    animateValue(document.getElementById('n-urls'), d.total_unique_urls || 0);

    const ts = new Date(d.last_updated);
    document.getElementById('sync-status').textContent = 'Synced ' + ts.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  } catch (err) {
    console.warn('stats.json unavailable:', err.message);
    document.getElementById('sync-status').textContent = 'Live Mode';
  }

  renderHistoryChart();
}

async function renderHistoryChart() {
  try {
    const r = await fetch(RAW + 'history.json?v=' + feedVersion);
    if (!r.ok) return;
    const history = await r.json();
    if (!history || history.length === 0) return;

    const labels = history.map(h => h.date);
    const vals = history.map(h => h.total_unique_ips);

    const ctx = document.getElementById('historyChart').getContext('2d');
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(255, 0, 51, 0.4)');
    gradient.addColorStop(1, 'rgba(255, 0, 51, 0.0)');

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tracked Malicious IPs',
          data: vals,
          borderColor: '#ff0033',
          backgroundColor: gradient,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ff0033',
          fill: true,
          tension: 0.4 // smooth curves
        }]
      },
      options: {
        responsive: true, 
        maintainAspectRatio: false,
        plugins: { 
          legend: { display: false }, 
          tooltip: { 
            backgroundColor: 'rgba(10, 10, 10, 0.9)',
            titleColor: '#fff',
            bodyColor: '#ff0033',
            borderColor: 'rgba(255, 255, 255, 0.1)',
            borderWidth: 1,
            padding: 12,
            displayColors: false,
            callbacks: { label: c => fmt(c.parsed.y) + ' IPs' } 
          } 
        },
        scales: {
          x: { 
            grid: { display: false, drawBorder: false }, 
            ticks: { maxTicksLimit: 8, color: '#71717a' } 
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
            ticks: { 
              color: '#71717a',
              callback: v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : v 
            }
          }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  } catch (e) {
    console.warn('history.json unavailable', e);
  }
}

/* ── Binary Search on TXT Files ── */

async function getFileSize(url) {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return 0;
    return parseInt(r.headers.get('content-length') || '0', 10);
  } catch (e) {
    return 0;
  }
}

async function fetchChunk(url, start, end) {
  try {
    const r = await fetch(url, { headers: { 'Range': `bytes=${start}-${end}` } });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    return null;
  }
}

function ipCompare(query, line) {
  const pA = query.split('.').map(Number);
  const pB = line.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if ((pA[i] || 0) < (pB[i] || 0)) return -1;
    if ((pA[i] || 0) > (pB[i] || 0)) return 1;
  }
  return 0;
}

function stringCompare(query, line) {
  const str = line.toLowerCase();
  if (query < str) return -1;
  if (query > str) return 1;
  return 0;
}

async function binarySearchFile(url, query, compareFn) {
  const size = await getFileSize(url);
  if (!size) {
    try {
      const r = await fetch(url);
      const txt = await r.text();
      const lines = txt.split('\n');
      for (let line of lines) {
        if (compareFn(query, line.trim()) === 0) return true;
      }
    } catch (e) {}
    return false;
  }

  let low = 0;
  let high = size - 1;
  const CHUNK_SIZE = 8192;
  let iterations = 0;

  while (low <= high && iterations < 50) {
    iterations++;
    const mid = Math.floor((low + high) / 2);
    const start = Math.max(0, mid - Math.floor(CHUNK_SIZE / 2));
    const end = Math.min(size - 1, start + CHUNK_SIZE - 1);

    const chunk = await fetchChunk(url, start, end);
    if (!chunk) break;

    const lines = chunk.split('\n');
    if (start > 0 && lines.length > 0) lines.shift();
    if (end < size - 1 && lines.length > 0) lines.pop();

    if (lines.length === 0) break;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (compareFn(query, line) === 0) return true;
    }

    let firstLine = '';
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { firstLine = lines[i].trim(); break; }
    }
    let lastLine = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) { lastLine = lines[i].trim(); break; }
    }

    if (!firstLine || !lastLine) break;

    if (compareFn(query, firstLine) < 0) {
      high = start - 1;
    } else if (compareFn(query, lastLine) > 0) {
      low = end + 1;
    } else {
      return false;
    }
  }
  return false;
}

/* ── Threat Scanning UI ── */

async function scanIndicator() {
  const input = document.getElementById('ip-input');
  const btn = document.getElementById('scan-btn');
  const rawIp = input.value.trim();

  const isURL = /^https?:\/\/.+/.test(rawIp);
  const isHash = /^[a-fA-F0-9]{32}(?:[a-fA-F0-9]{8})?(?:[a-fA-F0-9]{24})?$/.test(rawIp);
  const ip = (isURL && !isHash) ? rawIp : rawIp.toLowerCase();

  if (!ip) { input.focus(); return; }

  const isIP = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
  const isDomain = !isIP && !isURL && !isHash && /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.[A-Za-z]{2,}$/.test(ip);

  if (!isIP && !isDomain && !isHash && !isURL) {
    showReport('warn', ip);
    return;
  }

  btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,0.3); border-top-color:#fff; width:16px; height:16px; margin-right:8px;"></span> Scanning';
  btn.disabled = true;

  const section = document.getElementById('report-section');
  const overlay = document.getElementById('scan-overlay');
  const card = document.getElementById('report-card');

  section.classList.add('show');
  overlay.classList.add('active');
  card.classList.remove('show');
  document.getElementById('scan-ip').textContent = ip;

  let scanType = 'Indicator';
  if (isIP) scanType = 'IP Address';
  else if (isHash) scanType = 'File Hash';
  else if (isURL) scanType = 'URL';
  else if (isDomain) scanType = 'Domain';
  document.getElementById('scan-title-text').textContent = 'Analyzing ' + scanType + ' against Global Database...';

  // Smooth scroll
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Perform Binary Search
  let isMalicious = false;
  try {
    if (isIP) {
      isMalicious = await binarySearchFile(RAW + 'malicious_ips.txt?v=' + feedVersion, ip, ipCompare);
    } else if (isDomain) {
      isMalicious = await binarySearchFile(RAW + 'malicious_domains.txt?v=' + feedVersion, ip, stringCompare);
    } else if (isHash) {
      isMalicious = await binarySearchFile(RAW + 'malicious_hashes.txt?v=' + feedVersion, ip, stringCompare);
    } else if (isURL) {
      isMalicious = await binarySearchFile(RAW + 'malicious_urls.txt?v=' + feedVersion, ip, stringCompare);
    }
  } catch (e) {
    console.error(e);
  }

  // Artificial delay for UI scanning effect
  await new Promise(r => setTimeout(r, 600));

  overlay.classList.remove('active');
  showReport(isMalicious ? 'danger' : 'safe', ip, isIP, isDomain, isHash, isURL);

  btn.innerHTML = '<span>Scan Threat</span><i data-lucide="arrow-right"></i>';
  btn.disabled = false;
  lucide.createIcons();
}

function showReport(type, ip, isIP, isDomain, isHash, isURL) {
  const card = document.getElementById('report-card');
  const header = document.getElementById('rc-header');
  
  document.getElementById('rc-ip').textContent = ip;
  header.className = 'rc-header';

  if (type === 'danger') {
    header.classList.add('rc-header-danger');
    document.getElementById('rc-icon').setAttribute('data-lucide', 'shield-alert');
    document.getElementById('rc-sub').textContent = 'Flagged in HimalayaFeed Threat Database';
    document.getElementById('rc-badge').textContent = 'CRITICAL THREAT';
    
    document.getElementById('rc-assessment').innerHTML = `
      <div style="color: #ff0033; font-weight: 700; margin-bottom: 0.5rem;">Immediate Action Required</div>
      <code>${ip}</code> has been confirmed malicious by our global sensor network and is actively present in the threat intelligence blocklist. It is highly recommended to block this indicator at the firewall or DNS level.`;
  } else if (type === 'safe') {
    header.classList.add('rc-header-safe');
    document.getElementById('rc-icon').setAttribute('data-lucide', 'shield-check');
    document.getElementById('rc-sub').textContent = 'Not found in active blocklists';
    document.getElementById('rc-badge').textContent = 'NOT LISTED';

    document.getElementById('rc-assessment').innerHTML = `
      <div style="color: #10b981; font-weight: 700; margin-bottom: 0.5rem;">Clean Result</div>
      <code>${ip}</code> is <strong>not currently listed</strong> in the active HimalayaFeed threat database. However, this does not guarantee the indicator is safe; it only means it hasn't been flagged recently by our sensors.`;
  } else {
    header.classList.add('rc-header-warn');
    document.getElementById('rc-icon').setAttribute('data-lucide', 'alert-triangle');
    document.getElementById('rc-sub').textContent = 'Invalid format';
    document.getElementById('rc-badge').textContent = 'WARNING';
    document.getElementById('rc-assessment').innerHTML = `Please enter a valid IPv4 address, Domain, SHA-256 Hash, or URL.`;
  }

  // External Links
  const extVt = document.getElementById('ext-vt');
  const extAbuse = document.getElementById('ext-abuse');
  
  if (isIP) {
    extVt.href = 'https://www.virustotal.com/gui/ip-address/' + ip;
    extVt.style.display = 'inline-flex';
    extAbuse.href = 'https://www.abuseipdb.com/check/' + ip;
    extAbuse.style.display = 'inline-flex';
  } else if (isHash) {
    extVt.href = 'https://www.virustotal.com/gui/file/' + ip;
    extVt.style.display = 'inline-flex';
    extAbuse.style.display = 'none';
  } else if (isURL) {
    extVt.href = 'https://www.virustotal.com/gui/search/' + encodeURIComponent(ip);
    extVt.style.display = 'inline-flex';
    extAbuse.style.display = 'none';
  } else if (isDomain) {
    extVt.href = 'https://www.virustotal.com/gui/domain/' + ip;
    extVt.style.display = 'inline-flex';
    extAbuse.style.display = 'none';
  } else {
    extVt.style.display = 'none';
    extAbuse.style.display = 'none';
  }

  card.classList.add('show');
  lucide.createIcons();
}

document.getElementById('ip-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') scanIndicator();
});

// Start
document.addEventListener('DOMContentLoaded', boot);