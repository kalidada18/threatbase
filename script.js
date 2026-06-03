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

/* ── High-Performance In-Memory Binary Search ── */

const feedCache = {};

async function fetchAndCacheFeed(url) {
  if (feedCache[url]) return feedCache[url];
  try {
    const r = await fetch(url);
    if (!r.ok) return [];
    const text = await r.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    feedCache[url] = lines;
    return lines;
  } catch (e) {
    console.error("Failed to fetch feed:", e);
    return [];
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

function binarySearchArray(arr, query, compareFn) {
  let low = 0;
  let high = arr.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const comp = compareFn(query, arr[mid]);
    if (comp === 0) return true;
    if (comp < 0) high = mid - 1;
    else low = mid + 1;
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

  btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,0.3); border-top-color:#fff; width:16px; height:16px; margin-right:8px; display:inline-block; border-radius:50%; border-width:2px; border-style:solid; animation:spin 1s linear infinite;"></span> Scanning';
  btn.disabled = true;

  const section = document.getElementById('report-section');
  const overlay = document.getElementById('scan-overlay');
  const card = document.getElementById('report-card');
  const progressFill = document.querySelector('.scan-progress-fill');

  section.classList.add('show');
  overlay.classList.add('active');
  card.classList.remove('show');
  document.getElementById('scan-ip').textContent = ip;
  
  // Reset progress bar
  progressFill.style.width = '0%';
  progressFill.style.transition = 'none';

  let scanType = 'Indicator';
  if (isIP) scanType = 'IP Address';
  else if (isHash) scanType = 'File Hash';
  else if (isURL) scanType = 'URL';
  else if (isDomain) scanType = 'Domain';
  
  const titleText = document.getElementById('scan-title-text');

  // Smooth scroll
  section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Start animation sequence
  setTimeout(() => {
    progressFill.style.transition = 'width 1.5s cubic-bezier(0.1, 0.8, 0.3, 1)';
    progressFill.style.width = '100%';
  }, 50);

  const texts = [
    'Establishing Secure Connection...',
    `Parsing ${scanType} signature...`,
    'Querying Global Threat Matrix...',
    'Performing Cryptographic Verification...'
  ];
  
  let step = 0;
  const interval = setInterval(() => {
    step++;
    if (step < texts.length) titleText.textContent = texts[step];
  }, 400);

  // Perform In-Memory Binary Search
  let isMalicious = false;
  try {
    let list = [];
    let compareFn = stringCompare;
    
    if (isIP) {
      list = await fetchAndCacheFeed(RAW + 'malicious_ips.txt?v=' + feedVersion);
      compareFn = ipCompare;
    } else if (isDomain) {
      list = await fetchAndCacheFeed(RAW + 'malicious_domains.txt?v=' + feedVersion);
    } else if (isHash) {
      list = await fetchAndCacheFeed(RAW + 'malicious_hashes.txt?v=' + feedVersion);
    } else if (isURL) {
      list = await fetchAndCacheFeed(RAW + 'malicious_urls.txt?v=' + feedVersion);
    }
    
    isMalicious = binarySearchArray(list, ip, compareFn);
  } catch (e) {
    console.error(e);
  }

  // Artificial delay for UI scanning effect to complete
  await new Promise(r => setTimeout(r, 1600));
  clearInterval(interval);

  overlay.classList.remove('active');
  showReport(isMalicious ? 'danger' : 'safe', ip, isIP, isDomain, isHash, isURL);

  btn.innerHTML = '<span>Scan Threat</span><i data-lucide="arrow-right"></i>';
  btn.disabled = false;
  lucide.createIcons();
}

function showReport(type, ip, isIP, isDomain, isHash, isURL) {
  const card = document.getElementById('report-card');
  const header = document.getElementById('rc-header');
  const glow = document.getElementById('rc-glow');
  const iconBg = document.getElementById('rc-icon-bg');
  
  document.getElementById('rc-ip').textContent = ip;
  
  // Reset classes
  header.className = 'rc-header';
  glow.className = 'rc-glow';
  iconBg.className = 'rc-h-icon';

  if (type === 'danger') {
    header.classList.add('rc-header-danger');
    glow.classList.add('rc-glow-danger');
    iconBg.classList.add('rc-icon-danger');
    document.getElementById('rc-icon').setAttribute('data-lucide', 'shield-alert');
    document.getElementById('rc-sub').textContent = 'Malicious Indicator Confirmed';
    document.getElementById('rc-badge').textContent = 'CRITICAL THREAT';
    document.getElementById('rc-badge').className = 'rc-h-badge badge-danger';
    
    document.getElementById('rc-assessment').innerHTML = `
      <div class="assessment-title text-red">Immediate Action Required</div>
      <p>The indicator <code>${ip}</code> has been positively identified as malicious by the HimalayaFeed global sensor network. It is currently active in our threat intelligence blocklists.</p>
      <p style="margin-top:0.8rem;"><strong>Recommendation:</strong> Blacklist this indicator immediately across your network perimeter (Firewalls, DNS Sinkholes, or EDR platforms).</p>`;
  } else if (type === 'safe') {
    header.classList.add('rc-header-safe');
    glow.classList.add('rc-glow-safe');
    iconBg.classList.add('rc-icon-safe');
    document.getElementById('rc-icon').setAttribute('data-lucide', 'shield-check');
    document.getElementById('rc-sub').textContent = 'Not found in active blocklists';
    document.getElementById('rc-badge').textContent = 'NOT LISTED';
    document.getElementById('rc-badge').className = 'rc-h-badge badge-safe';

    document.getElementById('rc-assessment').innerHTML = `
      <div class="assessment-title text-green">Clean Result</div>
      <p>The indicator <code>${ip}</code> is <strong>not currently listed</strong> in the active HimalayaFeed threat database.</p>
      <p style="margin-top:0.8rem;"><strong>Note:</strong> This does not guarantee the indicator is completely safe; it only means it hasn't been flagged recently by our honeypots or aggregated feeds.</p>`;
  } else {
    header.classList.add('rc-header-warn');
    glow.classList.add('rc-glow-warn');
    iconBg.classList.add('rc-icon-warn');
    document.getElementById('rc-icon').setAttribute('data-lucide', 'alert-triangle');
    document.getElementById('rc-sub').textContent = 'Invalid format';
    document.getElementById('rc-badge').textContent = 'WARNING';
    document.getElementById('rc-badge').className = 'rc-h-badge badge-warn';
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