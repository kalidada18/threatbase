    let RAW = './';
    if (window.location.hostname === 'kalidada18.github.io') {
      RAW = 'https://kalidada18.github.io/himalayafeed/';
    } else if (window.location.protocol === 'file:') {
      RAW = 'https://raw.githubusercontent.com/kalidada18/himalayafeed/main/';
    }
    const fmt = n => new Intl.NumberFormat('en-US').format(n);

    function relTime(iso) {
      const m = Math.floor((Date.now() - new Date(iso)) / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + ' min ago';
      const h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    function animateValue(el, end, dur = 1600) {
      const t0 = performance.now();
      (function frame(now) {
        const p = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        el.textContent = fmt(Math.round(end * ease));
        if (p < 1) requestAnimationFrame(frame);
      })(t0);
    }

    /* ── Boot ──────────────────────────────── */
    async function boot() {
      try {
        // Check dark mode preference
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          document.documentElement.classList.add('dark');
          document.getElementById('theme-icon')?.setAttribute('data-lucide', 'sun');
        }
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
          themeBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            document.getElementById('theme-icon')?.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
            lucide.createIcons();
          });
        }

        const mobileBtn = document.getElementById('mobile-menu-btn');
        if (mobileBtn) {
          mobileBtn.addEventListener('click', () => {
            const navLinks = document.getElementById('nav-links');
            const icon = document.getElementById('hamburger-icon');
            navLinks?.classList.toggle('show');
            icon?.classList.toggle('open');
          });
          // Close mobile menu when a link is clicked
          document.querySelectorAll('.nav-links a').forEach(a => {
            a.addEventListener('click', () => {
              document.getElementById('nav-links')?.classList.remove('show');
              document.getElementById('hamburger-icon')?.classList.remove('open');
            });
          });
        }

        const r = await fetch(RAW + 'stats.json?_=' + Date.now());
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();

        document.getElementById('ms-time').textContent = relTime(d.last_updated);
        document.getElementById('ms-src').textContent = d.total_feeds_processed || 15;
        document.getElementById('ms-ips').textContent = fmt(d.total_unique_ips);
        document.getElementById('ms-ioc').textContent = fmt(d.total_ioc_count || d.total_unique_ips);

        animateValue(document.getElementById('n-total'), d.total_unique_ips);
        animateValue(document.getElementById('n-multi'), d.multi_source_ips);
        animateValue(document.getElementById('n-feeds'), d.total_feeds_processed || 15);
        animateValue(document.getElementById('n-failed'), d.total_feeds_failed || 0);
        animateValue(document.getElementById('n-domains'), d.total_unique_domains || 0);
        animateValue(document.getElementById('n-hashes'), d.total_unique_hashes || 0);
        animateValue(document.getElementById('n-urls'), d.total_unique_urls || 0);

        // Populate IOC Database counts
        document.getElementById('ioc-ip-count').textContent = fmt(d.total_unique_ips);
        document.getElementById('ioc-domain-count').textContent = fmt(d.total_unique_domains || 0);
        document.getElementById('ioc-hash-count').textContent = fmt(d.total_unique_hashes || 0);
        document.getElementById('ioc-url-count').textContent = fmt(d.total_unique_urls || 0);

      } catch (err) {
        console.warn('stats.json unavailable:', err.message);
        document.getElementById('ms-time').textContent = 'Pending first run';
      }

      // Load these independently so they don't break if stats fails
      renderHistoryChart();
      renderTop100();
      renderWorldMap();
      renderHashTable();
    }

    async function renderTop100() {
      try {
        const r = await fetch(RAW + 'top_100.json?_=' + Date.now());
        if (!r.ok) return;
        const top100 = await r.json();
        const tbody = document.getElementById('top100-body');
        if (!top100 || top100.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available yet.</td></tr>';
          return;
        }

        tbody.innerHTML = '';
        top100.forEach(item => {
          const tr = document.createElement('tr');
          const cats = (item.categories || 'Mixed').split('|').map(c => `<span class="cat-tag">${c}</span>`).join('');
          const ispText = item.isp && item.isp !== 'Unknown' ? `<div style="font-size:0.7rem; color:var(--slate); margin-top:1px;">${item.isp}</div>` : '';
          tr.innerHTML = `
        <td style="font-family:var(--mono); font-weight:600; color:var(--red)">${item.ip}</td>
        <td>
          <div style="font-weight:600; color:var(--midnight)">${item.country || 'Unknown'}</div>
          <div style="font-size:0.75rem; color:var(--slate)">ASN ${item.asn || '0'}</div>
          ${ispText}
        </td>
        <td>
          <div style="font-weight:800; color:var(--red)">${item.reputation}/100</div>
          <div style="font-size:0.75rem; color:var(--slate)">${item.source_count} nodes</div>
        </td>
        <td>${cats}</td>
      `;
          tbody.appendChild(tr);
        });
      } catch (e) {
        console.warn('top_100.json unavailable', e);
      }
    }

    async function renderHistoryChart() {
      try {
        const r = await fetch(RAW + 'history.json?_=' + Date.now());
        if (!r.ok) return;
        const history = await r.json();

        if (!history || history.length === 0) return;

        const labels = history.map(h => h.date);
        const vals = history.map(h => h.total_unique_ips);

        new Chart(document.getElementById('historyChart').getContext('2d'), {
          type: 'line',
          data: {
            labels,
            datasets: [{
              label: 'Total Malicious IPs',
              data: vals,
              borderColor: '#dc2626',
              backgroundColor: 'rgba(220,38,38,0.1)',
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#dc2626',
              fill: true,
              tension: 0.3
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            animation: {
              x: {
                type: 'number', easing: 'linear', duration: 1000 / vals.length, from: NaN,
                delay: ctx => ctx.type !== 'data' || ctx.xStarted ? 0 : (ctx.xStarted = true, ctx.index * (1000 / vals.length))
              },
              y: {
                type: 'number', easing: 'linear', duration: 1000 / vals.length,
                from: ctx => ctx.index === 0 ? ctx.chart.scales.y.getPixelForValue(ctx.chart.scales.y.min) : ctx.chart.getDatasetMeta(ctx.datasetIndex).data[ctx.index - 1].getProps(['y'], true).y,
                delay: ctx => ctx.type !== 'data' || ctx.yStarted ? 0 : (ctx.yStarted = true, ctx.index * (1000 / vals.length))
              }
            },
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmt(c.parsed.y) + ' IPs' } } },
            scales: {
              x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } },
              y: {
                grid: { color: '#e4e7ed' },
                ticks: { callback: v => v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v }
              }
            },
            interaction: { mode: 'index', intersect: false }
          }
        });
      } catch (e) {
        console.warn('history.json unavailable', e);
      }
    }

    /* ── Threat Scan + Report ──────────────────── */
    let csvText = null, csvLoading = null, statsData = null, bloomData = null, domainData = null, hashData = null, urlData = null;

    async function loadDomains() {
      if (domainData) return domainData;
      try {
        const r = await fetch(RAW + 'malicious_domains.txt?_=' + Date.now());
        if (r.ok) {
          const txt = await r.text();
          domainData = new Set(txt.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean));
        }
      } catch (e) { }
      return domainData;
    }

    async function loadHashes() {
      if (hashData) return hashData;
      try {
        const r = await fetch(RAW + 'malicious_hashes.txt?_=' + Date.now());
        if (r.ok) {
          const txt = await r.text();
          hashData = new Set(txt.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean));
        }
      } catch (e) { }
      return hashData;
    }

    async function loadUrls() {
      if (urlData) return urlData;
      try {
        const r = await fetch(RAW + 'malicious_urls.txt?_=' + Date.now());
        if (r.ok) {
          const txt = await r.text();
          urlData = new Set(txt.split('\n').map(d => d.trim()).filter(Boolean));
        }
      } catch (e) { }
      return urlData;
    }

    async function loadPrefixes() {
      if (bloomData) return bloomData;
      try {
        const r = await fetch(RAW + 'ip_prefixes.json?_=' + Date.now());
        if (r.ok) {
          bloomData = await r.json();
        }
      } catch (e) { }
      return bloomData;
    }

    async function loadCSV() {
      if (csvText) return csvText;
      if (!csvLoading) {
        csvLoading = fetch(RAW + 'malicious_ips.csv?_=' + Date.now())
          .then(r => r.text())
          .then(txt => { csvText = txt; return csvText; });
      }
      return csvLoading;
    }

    async function loadStats() {
      if (statsData) return statsData;
      try {
        const r = await fetch(RAW + 'stats.json?_=' + Date.now());
        if (r.ok) statsData = await r.json();
      } catch (e) { }
      return statsData;
    }

    function getThreatLevel(reputation) {
      let score = reputation || 0;

      if (score >= 80) return { level: 'critical', label: 'Critical', pct: 95 };
      if (score >= 60) return { level: 'high', label: 'High', pct: 75 };
      if (score >= 40) return { level: 'medium', label: 'Medium', pct: 50 };
      if (score > 0) return { level: 'low', label: 'Low', pct: 25 };
      return { level: 'none', label: 'Clean', pct: 0 };
    }

    async function scanIP() {
      const input = document.getElementById('ip-input');
      const btn = document.getElementById('scan-btn');
      
      let rawIp = input.value.trim();
      const isURL = /^https?:\/\/.+/.test(rawIp);
      const isHash = /^[a-fA-F0-9]{32}(?:[a-fA-F0-9]{8})?(?:[a-fA-F0-9]{24})?$/.test(rawIp);
      
      const ip = (isURL && !isHash) ? rawIp : rawIp.toLowerCase();

      if (!ip) { input.focus(); return; }

      const isIP = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip);
      const isDomain = !isIP && !isURL && !isHash && /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.[A-Za-z]{2,}$/.test(ip);

      if (!isIP && !isDomain && !isHash && !isURL) {
        showReport('warn', ip, null, null);
        return;
      }

      // Show scanning UI
      btn.innerHTML = '<span class="spinner"></span> Scanning';
      btn.disabled = true;

      const section = document.getElementById('report-section');
      const overlay = document.getElementById('scan-overlay');
      const card = document.getElementById('report-card');

      section.classList.add('show');
      overlay.classList.add('active');
      card.classList.remove('show');
      document.getElementById('scan-ip').textContent = ip;

      // Reset steps
      ['step-feed', 'step-report'].forEach(id => {
        document.getElementById(id).className = 'scan-step';
      });

      section.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // Step 1: Feed database
      document.getElementById('step-feed').classList.add('active');

      let feedMatch = null;
      let stats = null;
      try {
        stats = await loadStats();
        if (isIP) {
          const prefixes = await loadPrefixes();
          const prefix = ip.split('.').slice(0, 3).join('.');

          // Instant prefix check (avoids downloading 90MB CSV if /24 has zero threats)
          let mightBeMalicious = true;
          if (prefixes && typeof prefixes === 'object' && !(prefix in prefixes)) mightBeMalicious = false;

          if (mightBeMalicious) {
            const txt = await loadCSV();

            // More robust parsing: find line starting with ip, or \n + ip,
            let idx = txt.indexOf('\n' + ip + ',');
            if (idx === -1 && txt.startsWith(ip + ',')) {
              idx = 0; // Handle case where it's the very first line
            } else if (idx === -1 && txt.startsWith('ip,sources,source_count\n' + ip + ',')) {
              idx = 'ip,sources,source_count'.length;
            }

            if (idx !== -1) {
              const lineStart = (idx === 0) ? 0 : idx + 1;
              const lineEnd = txt.indexOf('\n', lineStart);
              const line = txt.substring(lineStart, lineEnd !== -1 ? lineEnd : undefined);
              const parts = line.split(',');
              // CSV columns: ip, sources, source_count, reputation, categories, country, asn, isp
              if (parts.length >= 4) {
                feedMatch = {
                  sourceCount: parseInt(parts[2]) || 1,
                  reputation: parseInt(parts[3]) || (parseInt(parts[2]) * 20) || 0,
                  sourceList: parts[1] ? parts[1].split('|') : ['unknown'],
                  country: parts[5] || 'Unknown',
                  asn: parts[6] || '0',
                  isp: parts[7] || 'Unknown'
                };
              }
            }
          }
        } else if (isDomain) {
          const domains = await loadDomains();
          if (domains && domains.has(ip)) {
            feedMatch = {
              sourceCount: 1,
              reputation: 100,
              sourceList: ['malicious_domains.txt']
            };
          }
        } else if (isHash) {
          const hashes = await loadHashes();
          if (hashes && hashes.has(ip)) {
            feedMatch = {
              sourceCount: 1,
              reputation: 100,
              sourceList: ['malicious_hashes.txt']
            };
          }
        } else if (isURL) {
          const urls = await loadUrls();
          if (urls && urls.has(ip)) {
            feedMatch = {
              sourceCount: 1,
              reputation: 100,
              sourceList: ['malicious_urls.txt']
            };
          }
        }
      } catch (e) { console.error(e); }

      document.getElementById('step-feed').classList.remove('active');
      document.getElementById('step-feed').classList.add('done');

      // Step 2: Generate Report
      document.getElementById('step-report').classList.add('active');
      await new Promise(r => setTimeout(r, 400));
      document.getElementById('step-report').classList.remove('active');
      document.getElementById('step-report').classList.add('done');

      await new Promise(r => setTimeout(r, 200));

      // Show report
      overlay.classList.remove('active');
      const type = feedMatch ? 'danger' : 'safe';
      showReport(type, ip, feedMatch, stats);

      btn.innerHTML = '<i data-lucide="scan"></i> Scan';
      btn.disabled = false;
      lucide.createIcons();
    }

    function showReport(type, ip, feedMatch, stats) {
      const card = document.getElementById('report-card');
      const header = document.getElementById('rc-header');
      const totalFeeds = stats ? stats.total_feeds_processed : 15;
      const totalIPs = stats ? stats.total_unique_ips : 0;
      const lastUpdated = stats ? stats.last_updated : '—';

      const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
      const isHash = /^[a-f0-9]{32}(?:[a-f0-9]{8})?(?:[a-f0-9]{24})?$/i.test(ip);
      const isURL = /^https?:\/\/.+/.test(ip);

      // External links
      if (isIP) {
        document.getElementById('ext-vt').href = 'https://www.virustotal.com/gui/ip-address/' + ip;
        document.getElementById('ext-abuse').href = 'https://www.abuseipdb.com/check/' + ip;
        document.getElementById('ext-abuse').style.display = 'flex';
        document.getElementById('ext-shodan').href = 'https://www.shodan.io/host/' + ip;
        document.getElementById('ext-shodan').style.display = 'flex';
      } else if (isHash) {
        document.getElementById('ext-vt').href = 'https://www.virustotal.com/gui/file/' + ip;
        document.getElementById('ext-abuse').style.display = 'none';
        document.getElementById('ext-shodan').style.display = 'none';
      } else if (isURL) {
        document.getElementById('ext-vt').href = 'https://www.virustotal.com/gui/search/' + encodeURIComponent(ip);
        document.getElementById('ext-abuse').style.display = 'none';
        document.getElementById('ext-shodan').style.display = 'none';
      } else {
        document.getElementById('ext-vt').href = 'https://www.virustotal.com/gui/domain/' + ip;
        document.getElementById('ext-abuse').style.display = 'none';
        document.getElementById('ext-shodan').style.display = 'none';
      }

      // Header
      document.getElementById('rc-ip').textContent = ip;
      header.className = 'rc-header';

      const sourceCount = feedMatch ? feedMatch.sourceCount : 0;
      const reputation = feedMatch ? feedMatch.reputation : 0;
      const threat = getThreatLevel(reputation);

      if (type === 'danger') {
        header.classList.add('rc-header-danger');
        document.getElementById('rc-icon').setAttribute('data-lucide', 'shield-alert');
        document.getElementById('rc-sub').textContent = 'Flagged in the HimalayaFeed threat intelligence database';
        document.getElementById('rc-badge').textContent = '⚠ MALICIOUS';
      } else if (type === 'safe') {
        header.classList.add('rc-header-safe');
        document.getElementById('rc-icon').setAttribute('data-lucide', 'shield-check');
        document.getElementById('rc-sub').textContent = 'Not found in the HimalayaFeed threat intelligence database';
        document.getElementById('rc-badge').textContent = '✓ NOT LISTED';
      } else {
        header.classList.add('rc-header-warn');
        document.getElementById('rc-icon').setAttribute('data-lucide', 'alert-triangle');
        document.getElementById('rc-sub').textContent = 'Invalid format or data unavailable';
        document.getElementById('rc-badge').textContent = '! WARNING';
      }

      // Threat bar
      document.getElementById('tb-level').textContent = threat.label;
      document.getElementById('tb-level').className = 'tb-level tb-' + threat.level;
      setTimeout(() => { document.getElementById('tb-fill').style.width = threat.pct + '%'; }, 100);

      // Feed Panel (now includes ISP when available)
      const feedPanel = document.getElementById('feed-panel-body');
      const ispName = feedMatch && feedMatch.isp && feedMatch.isp !== 'Unknown' ? feedMatch.isp : null;
      const countryName = feedMatch && feedMatch.country && feedMatch.country !== 'Unknown' ? feedMatch.country : null;
      feedPanel.innerHTML = `
    <div class="rc-row">
      <span class="rc-row-label">Threat Reputation Score</span>
      <span class="rc-row-value" style="color:var(--red)">${reputation}/100</span>
    </div>
    <div class="rc-row">
      <span class="rc-row-label">Detection Confidence</span>
      <span class="rc-row-value">${sourceCount > 0 ? Math.min(Math.round((sourceCount / totalFeeds) * 100), 99) : 0}%</span>
    </div>
    <div class="rc-row">
      <span class="rc-row-label">In Blocklist</span>
      <span class="rc-row-value text" style="color:${feedMatch ? 'var(--red)' : 'var(--green)'}">${feedMatch ? '✓ Yes' : '✗ No'}</span>
    </div>
    ${countryName ? `<div class="rc-row">
      <span class="rc-row-label">Country</span>
      <span class="rc-row-value text">${countryName}</span>
    </div>` : ''}
    ${ispName ? `<div class="rc-row">
      <span class="rc-row-label">ISP / Organization</span>
      <span class="rc-row-value text" style="font-size:0.78rem">${ispName}</span>
    </div>` : ''}
    <div class="rc-row">
      <span class="rc-row-label">Database Total</span>
      <span class="rc-row-value">${totalIPs ? fmt(totalIPs) : '—'}</span>
    </div>
    <div class="rc-row">
      <span class="rc-row-label">Last DB Sync</span>
      <span class="rc-row-value" style="font-size:0.72rem">${lastUpdated !== '—' ? lastUpdated.replace('T', ' ').replace('Z', ' UTC') : '—'}</span>
    </div>
  `;

      // Assessment
      const assess = document.getElementById('rc-assessment');
      if (type === 'warn') {
        assess.innerHTML = '<strong>Error:</strong> Invalid format. Enter a valid IPv4 address, Domain, Hash, or URL (e.g. <code>evil.com</code> or <code>185.220.101.45</code>) and try again.';
      } else {
        if (feedMatch) {
          assess.innerHTML =
            `<strong>Threat Assessment:</strong> <code>${ip}</code> has been flagged by our advanced threat detection engine. ` +
            (threat.level === 'critical' ? 'This is a <strong style="color:var(--red)">critical threat</strong> — widely recognized as malicious globally. Immediate blocking is recommended.' :
              threat.level === 'high' ? 'This is a <strong style="color:#ea580c">high threat</strong> — highly confident malicious activity. Blocking is strongly recommended.' :
                threat.level === 'medium' ? 'This is a <strong style="color:var(--amber)">medium threat</strong> — confirmed malicious activity. Consider blocking or monitoring.' :
                  'This is a <strong>low threat</strong> — identified with low confidence. Consider monitoring for further activity.') +
            ` This indicator is currently active in our global blocklist and should be actively blocked in your network infrastructure.`;
        } else {
          assess.innerHTML =
            `<strong>Assessment:</strong> <code>${ip}</code> was <strong>not found</strong> in the HimalayaFeed database. ` +
            'Absence from our database does <strong>not</strong> guarantee safety — only that it is not currently exhibiting malicious activity across our sensor network.';
        }
      }

      card.classList.add('show');
      lucide.createIcons();
    }

    /* ── File Scanning (Client-side SHA-256) ── */
    document.getElementById('file-scan-input').addEventListener('change', async function(e) {
      if (!this.files || this.files.length === 0) return;
      const file = this.files[0];
      
      const btn = document.getElementById('file-btn');
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Hash';
      btn.disabled = true;

      try {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        document.getElementById('ip-input').value = hashHex;
        scanIP();
      } catch (err) {
        console.error('Hash calculation failed', err);
        alert('Failed to calculate file hash.');
      } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
        lucide.createIcons();
        this.value = ''; // Reset input
      }
    });

    document.getElementById('ip-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') scanIP();
    });

    /* ── IOC Tab Switching ──────────────────── */
    function switchIOCTab(btn) {
      document.querySelectorAll('.ioc-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.ioc-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId)?.classList.add('active');
    }

    /* ── Hash Table ────────────────────────── */
    let allHashes = [];
    let filteredHashes = [];
    let hashDisplayCount = 0;
    const HASH_PAGE_SIZE = 200;

    async function renderHashTable() {
      try {
        const r = await fetch(RAW + 'malicious_hashes.txt?_=' + Date.now());
        if (!r.ok) return;
        const txt = await r.text();
        allHashes = txt.split('\n').map(h => h.trim()).filter(h => /^[a-fA-F0-9]{64}$/.test(h));
        filteredHashes = allHashes;
        hashDisplayCount = 0;
        renderHashRows();

        // Update hash count in IOC tab
        const countEl = document.getElementById('ioc-hash-count');
        if (countEl) countEl.textContent = fmt(allHashes.length);

        // Update stat card count
        const statEl = document.getElementById('n-hashes');
        if (statEl) animateValue(statEl, allHashes.length);

      } catch (e) {
        console.warn('hashes.txt unavailable', e);
        document.getElementById('hash-table-body').innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:var(--slate)">Hash data will appear after the first feed run.</td></tr>';
      }
    }

    function renderHashRows() {
      const tbody = document.getElementById('hash-table-body');
      const start = hashDisplayCount;
      const end = Math.min(hashDisplayCount + HASH_PAGE_SIZE, filteredHashes.length);

      if (start === 0) tbody.innerHTML = '';

      if (filteredHashes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem; color:var(--slate)">No hashes found.</td></tr>';
        document.getElementById('hash-load-more').style.display = 'none';
        document.getElementById('hash-display-count').textContent = '0 hashes';
        return;
      }

      for (let i = start; i < end; i++) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:600; color:var(--slate); font-size:0.75rem;">${i + 1}</td>
          <td style="font-family:var(--mono); font-size:0.75rem; color:var(--red); word-break:break-all;">${filteredHashes[i]}</td>
          <td>
            <button onclick="copyHash('${filteredHashes[i]}', this)" class="btn btn-outline" style="padding:0.3rem 0.5rem; font-size:0.68rem;" title="Copy hash">
              <i data-lucide="copy" style="width:12px;height:12px;"></i>
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      }

      hashDisplayCount = end;
      lucide.createIcons();

      // Update display count
      document.getElementById('hash-display-count').textContent = `Showing ${fmt(hashDisplayCount)} of ${fmt(filteredHashes.length)} hashes`;

      // Show/hide load more button
      const loadMore = document.getElementById('hash-load-more');
      if (hashDisplayCount < filteredHashes.length) {
        loadMore.style.display = 'block';
        document.getElementById('hash-load-more-btn').innerHTML = `<i data-lucide="chevrons-down"></i> Load More (${fmt(filteredHashes.length - hashDisplayCount)} remaining)`;
        lucide.createIcons();
      } else {
        loadMore.style.display = 'none';
      }
    }

    function loadMoreHashes() {
      renderHashRows();
    }

    function filterHashes() {
      const query = document.getElementById('hash-search-input').value.trim().toLowerCase();
      if (!query) {
        filteredHashes = allHashes;
      } else {
        filteredHashes = allHashes.filter(h => h.includes(query));
      }
      hashDisplayCount = 0;
      renderHashRows();
    }

    function copyHash(hash, btn) {
      navigator.clipboard.writeText(hash).then(() => {
        const orig = btn.innerHTML;
        btn.innerHTML = '<i data-lucide="check" style="width:12px;height:12px;color:var(--green)"></i>';
        lucide.createIcons();
        setTimeout(() => { btn.innerHTML = orig; lucide.createIcons(); }, 1500);
      });
    }

    /* ── World Threat Map ───────────────────── */
    async function renderWorldMap() {
      try {
        const r = await fetch(RAW + 'top_100.json?_=' + Date.now());
        if (!r.ok) return;
        const top100 = await r.json();
        if (!top100 || top100.length === 0) return;

        // Aggregate country counts
        const countryCounts = {};
        top100.forEach(item => {
          const c = (item.country || 'Unknown').toUpperCase().trim();
          if (c && c !== 'UNKNOWN' && c.length === 2) {
            countryCounts[c] = (countryCounts[c] || 0) + 1;
          }
        });

        const maxCount = Math.max(...Object.values(countryCounts), 1);
        const mapEl = document.getElementById('world-map');

        // Build a simple bar chart representation of countries since inline SVG world map
        // paths would be too large. This is a compact, data-driven visualization.
        const sortedCountries = Object.entries(countryCounts)
          .sort((a, b) => b[1] - a[1]);

        if (sortedCountries.length === 0) {
          mapEl.innerHTML = '<div style="padding:2rem; color:var(--slate)">No geographic data available yet.</div>';
          return;
        }

        // Country name lookup
        const countryNames = {
          US:'United States',CN:'China',RU:'Russia',DE:'Germany',NL:'Netherlands',
          GB:'United Kingdom',FR:'France',IN:'India',BR:'Brazil',KR:'South Korea',
          JP:'Japan',UA:'Ukraine',VN:'Vietnam',SG:'Singapore',ID:'Indonesia',
          HK:'Hong Kong',TW:'Taiwan',CA:'Canada',AU:'Australia',IT:'Italy',
          TH:'Thailand',PL:'Poland',IR:'Iran',RO:'Romania',BG:'Bulgaria',
          AR:'Argentina',ZA:'South Africa',TR:'Turkey',MX:'Mexico',CZ:'Czech Republic',
          SE:'Sweden',CH:'Switzerland',ES:'Spain',NO:'Norway',FI:'Finland',
          AT:'Austria',BE:'Belgium',DK:'Denmark',PT:'Portugal',IE:'Ireland',
          MY:'Malaysia',PH:'Philippines',PK:'Pakistan',BD:'Bangladesh',EG:'Egypt',
          NG:'Nigeria',KE:'Kenya',CO:'Colombia',CL:'Chile',PE:'Peru',
          SC:'Seychelles',PA:'Panama',LT:'Lithuania',LV:'Latvia',EE:'Estonia',
          MD:'Moldova',BY:'Belarus',KZ:'Kazakhstan',UZ:'Uzbekistan'
        };

        let html = '<div style="display:grid; gap:0.6rem; max-width:800px; margin:0 auto;">';
        sortedCountries.forEach(([code, count]) => {
          const pct = Math.round((count / maxCount) * 100);
          const name = countryNames[code] || code;
          // Color gradient: green -> yellow -> orange -> red
          const ratio = count / maxCount;
          let color;
          if (ratio < 0.25) color = '#22c55e';
          else if (ratio < 0.5) color = '#eab308';
          else if (ratio < 0.75) color = '#f97316';
          else color = '#dc2626';

          html += `
            <div style="display:grid; grid-template-columns:160px 1fr 50px; align-items:center; gap:0.8rem;">
              <div style="font-size:0.8rem; font-weight:600; color:var(--ink); text-align:right; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${name}">
                <span style="font-size:1.1rem; margin-right:4px;">${getFlagEmoji(code)}</span>${name}
              </div>
              <div style="background:var(--smoke); border-radius:4px; height:22px; overflow:hidden;">
                <div style="width:${pct}%; height:100%; background:${color}; border-radius:4px; transition:width 0.8s ease;"></div>
              </div>
              <div style="font-size:0.78rem; font-weight:700; color:var(--midnight); font-variant-numeric:tabular-nums;">${count}</div>
            </div>`;
        });
        html += '</div>';
        mapEl.innerHTML = html;

      } catch (e) {
        console.warn('World map data unavailable', e);
        const mapEl = document.getElementById('world-map');
        if (mapEl) mapEl.innerHTML = '<div style="padding:2rem; color:var(--slate)">Geographic data will appear after the first feed run.</div>';
      }
    }

    function getFlagEmoji(countryCode) {
      try {
        const code = countryCode.toUpperCase();
        return String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
      } catch (e) { return '🌐'; }
    }

    document.addEventListener('DOMContentLoaded', boot);

// -- Theme Toggle Logic --
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  
  // Check local storage for preference
  const currentTheme = localStorage.getItem('theme');
  if (currentTheme === 'light') {
    document.body.classList.add('light-mode');
    themeIcon.setAttribute('data-lucide', 'sun');
  } else {
    themeIcon.setAttribute('data-lucide', 'moon');
  }
  
  if (window.lucide) {
    lucide.createIcons();
  }

  toggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    let theme = 'dark';
    if (document.body.classList.contains('light-mode')) {
      theme = 'light';
      themeIcon.setAttribute('data-lucide', 'sun');
    } else {
      themeIcon.setAttribute('data-lucide', 'moon');
    }
    localStorage.setItem('theme', theme);
    if (window.lucide) lucide.createIcons();
  });
});