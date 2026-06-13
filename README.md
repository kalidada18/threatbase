<div align="center">
  <br/>
  <img src="public/img/threatbase.png" alt="Threatbase" width="130" style="border-radius: 50%;">
  <br/><br/>

  <h1>⚔️ Threatbase</h1>
  <p><strong>Enterprise-Grade Open-Source Threat Intelligence · Automated · Zero-Cost</strong></p>

  <p>
    <a href="https://github.com/kalidada18/threatbase/actions/workflows/update-feed.yml">
      <img src="https://github.com/kalidada18/threatbase/actions/workflows/update-feed.yml/badge.svg" alt="Feed Pipeline">
    </a>
    &nbsp;
    <img src="https://img.shields.io/badge/Python-3.11%2B-3776AB?logo=python&logoColor=white" alt="Python">
    &nbsp;
    <img src="https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black" alt="React">
    &nbsp;
    <img src="https://img.shields.io/badge/License-MIT-22c55e" alt="MIT License">
    &nbsp;
    <img src="https://img.shields.io/badge/IOCs-10M%2B-ef4444" alt="IOCs">
  </p>

  <p>
    <a href="https://threatbase.qzz.io">🌐 Live Dashboard</a>
    &nbsp;·&nbsp;
    <a href="#-using-the-threat-feeds-directly">📥 Raw Feeds</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/kalidada18/threatbase/releases">📦 Archives</a>
    &nbsp;·&nbsp;
    <a href="https://threatbase.qzz.io/thanks">🙏 Sources</a>
  </p>

  <br/>

  > *Built with ❤️ to democratize access to high-quality threat intelligence.*
  > *One indicator at a time.*

  <br/>
</div>

---

## 🧩 What Is Threatbase?

Threatbase is a **fully-automated threat intelligence ecosystem** — no VPS, no API keys, no infrastructure costs. It ingests, deduplicates, and curates malicious IOCs from 10+ industry-leading OSINT feeds, then serves them through a sleek React dashboard and raw-URL blocklists.

```
  OSINT Feeds → Python Aggregator → GitHub Actions → Raw Blocklists
                                                   ↘ React Dashboard
                                                   ↘ Daily ZIP Archive
```

<br/>

### 🏗️ Architecture

| Component | Stack | Role |
|:---|:---|:---|
| **Intelligence Engine** | Python 3.11, ThreadPoolExecutor | Feed ingestion, dedup, validation |
| **Automation** | GitHub Actions | Scheduled pipeline (6h cadence) |
| **Dashboard** | React 19, Chart.js | IOC search, analytics, manual reporting |
| **Delivery** | GitHub Pages + Raw URLs | Zero-infra, always-on feed serving |
| **Archives** | GitHub Releases | Daily ZIP snapshots for SIEM hunting |

---

## 🛡️ IOC Coverage

<div align="center">

| Type | Source Count | Use Case |
|:---:|:---:|:---|
| 🔴 **IPv4 Addresses** | 8 feeds | Firewall blocklists, SIEM correlation |
| 🟠 **IPv6 Addresses** | 3 feeds | Next-gen network blocking |
| 🟡 **CIDR Ranges** | 2 feeds | BGP null-routing, edge filtering |
| 🟢 **Domains** | 4 feeds | DNS sinkholing, Pi-Hole, AdGuard |
| 🔵 **URLs** | 3 feeds | Web proxy / NGFW blocking |
| 🟣 **SHA-256 Hashes** | 2 feeds | EDR ingestion, malware triage |

</div>

---

## 📡 Upstream Intelligence Sources

Threatbase curates and deduplicates from the following authoritative providers:

<details open>
<summary><strong>View all sources</strong></summary>

<br/>

| Provider | Focus Area | IOC Types |
|:---|:---|:---|
| **Abuse.ch** — FeodoTracker, URLhaus, MalwareBazaar | Botnets, C2s, Malware Delivery | IPs, Domains, URLs, Hashes |
| **Spamhaus** — DROP / EDROP | Spam Networks, Hijacked ASNs | IPs, CIDRs |
| **FireHOL** | Botnets, Cybercrime Infrastructure | IPs |
| **DShield (SANS ISC)** | Port Scanners, Bruteforcers | IPs |
| **PhishTank / OpenPhish** | Phishing Campaigns | Domains, URLs |
| **Emerging Threats / CINS Army** | Compromised Hosts | IPs |
| **Hagezi** | DNS Blocklists (Malware & Ads) | Domains |
| **Blocklist.de / GreenSnow** | SSH/FTP Bruteforcers | IPs |

> Full attribution on the **[Acknowledgements page →](https://threatbase.qzz.io/thanks)**

</details>

---

## 📄 Using the Threat Feeds Directly

All IOC files are committed to this repository and served continuously via **GitHub Raw**. Drop them directly into your security tooling — no auth, no rate limits.

### 🌐 Network Blocklists

> Import into firewall rules, edge routers, or BGP null-routing pipelines.

```
https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_ips.txt
https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_ipv6.txt
https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_cidrs.txt
```

| Feed | File | Format |
|:---|:---|:---|
| IPv4 Blocklist | `malicious_ips.txt` | One IP per line |
| IPv6 Blocklist | `malicious_ipv6.txt` | One IP per line |
| CIDR Blocklist | `malicious_cidrs.txt` | CIDR notation |

### 🕸️ DNS & Web Blocklists

> Compatible with Pi-Hole, AdGuard Home, Squid, Palo Alto EDL.

```
https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_domains.txt
https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_urls.txt
```

| Feed | File | Format |
|:---|:---|:---|
| Domain Blocklist | `malicious_domains.txt` | One domain per line |
| URL Blocklist | `malicious_urls.txt` | Full URL per line |

### 💀 Malware File Hashes

> 1,000,000+ SHA-256 hashes for EDR ingestion and malware triage pipelines.

```
https://raw.githubusercontent.com/kalidadas18/threatbase/main/ioc/malicious_hashes.txt
```

| Feed | File | Format |
|:---|:---|:---|
| Malware Hash DB | `malicious_hashes.txt` | SHA-256, one per line |

---

## 🗄️ Historical Archives

A full ZIP archive of the complete feed is published daily to the **[Releases](https://github.com/kalidada18/threatbase/releases)** page.

```
threatbase-YYYY-MM-DD.zip
├── malicious_ips.txt
├── malicious_ipv6.txt
├── malicious_cidrs.txt
├── malicious_domains.txt
├── malicious_urls.txt
└── malicious_hashes.txt
```

Ideal for **retrospective SIEM hunting**, academic research, and historical IOC enrichment.

---

## ⚡ Quick Integration Examples

<details>
<summary><strong>iptables (Linux)</strong></summary>

```bash
curl -s https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_ips.txt \
  | grep -v '^#' \
  | xargs -I{} iptables -A INPUT -s {} -j DROP
```
</details>

<details>
<summary><strong>Pi-Hole / AdGuard (DNS blocklist)</strong></summary>

Add this URL to your blocklist sources:
```
https://raw.githubusercontent.com/kalidada18/threatbase/main/ioc/malicious_domains.txt
```
</details>

<details>
<summary><strong>Splunk / SIEM IOC lookup</strong></summary>

```bash
# Download daily archive for batch ingestion
wget https://github.com/kalidadas18/threatbase/releases/latest/download/threatbase-latest.zip
unzip threatbase-latest.zip -d ./ioc-feeds/
```
</details>

---

## 🤝 Contributing

Threatbase is community-powered. Contributions welcome:

- 📥 **New Feed Sources** — open an issue with feed URL + license
- 🐛 **Bug Reports** — label as `bug`
- 💡 **Feature Requests** — label as `enhancement`

---

<div align="center">
  <br/>
  <sub>
    ⚖️ <a href="LICENSE">MIT License</a> &nbsp;·&nbsp;
    Upstream feed data subject to each provider's respective Terms of Service &nbsp;·&nbsp;
    Made in 🇳🇵
  </sub>
  <br/><br/>
  <sub><em>If Threatbase helps your security ops, consider starring ⭐ the repo.</em></sub>
  <br/><br/>
</div>
