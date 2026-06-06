<div align="center">
  <img src="img/himalayafeed.png" alt="HimalayaFeed Banner" width="250" style="border-radius: 50%; box-shadow: 0 4px 8px rgba(0,0,0,0.2); margin-bottom: 20px;">
  
  <h1>HimalayaFeed (v3)</h1>
  
  <p>
    <a href="https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml">
      <img src="https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml/badge.svg" alt="Update Feed">
    </a>
    <img src="https://img.shields.io/badge/python-3.11%2B-blue" alt="Python 3.11+">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
    <img src="https://img.shields.io/badge/data-JSON%20%7C%20TXT-yellow" alt="Formats">
  </p>
  
  <h3>A fully-automated, enterprise-grade Threat Intelligence Aggregator.</h3>
  <p><em>Powered by curiosity and driven by community OSINT</em></p>
</div>

<br/>

HimalayaFeed is a high-performance threat intelligence aggregator designed to collect, deduplicate, and curate malicious Indicators of Compromise (IOCs) from industry-leading open-source intelligence feeds. 

It provides highly actionable IPv4, IPv6, CIDR blocks, Domains, Hashes, and URLs updated automatically every hour to seamlessly integrate into your SOC/SIEM and firewalls.

---

## 📡 Upstream Intelligence Sources

HimalayaFeed curates and deduplicates data from the following authoritative threat intelligence providers:

| Provider | Focus Area | Aggregated IOC Types |
| :--- | :--- | :--- |
| **Abuse.ch (FeodoTracker / URLhaus / MalwareBazaar)** | Botnets, C2s, Malware Delivery | IPs, Domains, URLs, Hashes |
| **Spamhaus (DROP / EDROP)** | Spam, Hijacked Networks | IPs, CIDRs |
| **FireHOL** | Botnets, Cybercrime Networks | IPs |
| **DShield (SANS ISC)** | Port Scanners, Bruteforcers | IPs |
| **PhishTank / OpenPhish** | Phishing Campaigns | Domains, URLs |
| **Emerging Threats / CINS Army** | Compromised Hosts | IPs |
| **Hagezi** | DNS Blocklists (Malware/Ads) | Domains |
| **Blocklist.de / GreenSnow** | SSH/FTP Bruteforcers | IPs |

---

## 📄 Available Threat Feeds

All IOC files are committed directly to this repository and are served continuously via GitHub Raw.

### 🌐 Network Blocklists (IPs & CIDRs)
Use these lists directly in firewall and Edge routing tables.
- **[IPv4 Blocklist](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_ips.txt)** (`malicious_ips.txt`)
- **[IPv6 Blocklist](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_ipv6.txt)** (`malicious_ipv6.txt`)
- **[CIDR Blocklist](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_cidrs.txt)** (`malicious_cidrs.txt`)

### 🕸️ DNS & Web Blocklists (Domains & URLs)
Use these lists for DNS sinkholing (Pi-Hole, AdGuard) and web proxy blocking.
- **[Domain Blocklist](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_domains.txt)** (`malicious_domains.txt`)
- **[URL Blocklist](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_urls.txt)** (`malicious_urls.txt`)

### 💀 File Hashes (SHA-256)
Over 1,000,000+ malware samples for Endpoint Detection & Response (EDR) ingestion.
- **[Malware Hashes](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_hashes.txt)** (`malicious_hashes.txt`)

---

## 🛡️ Integration Examples

<details>
<summary><b>🐧 Linux &mdash; iptables / ipset (IPv4)</b></summary>
<br/>

```bash
# We highly recommend using IPSet for large blocklists
ipset create himalaya_block hash:net
curl -fsSL https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_ips.txt \
  | grep -vE '^#' | while read IP; do ipset add himalaya_block $IP; done

iptables -I INPUT -m set --match-set himalaya_block src -j DROP
```
</details>

<details>
<summary><b>🌐 NGINX &mdash; Web Deny List (IPv4/IPv6/CIDR)</b></summary>
<br/>

```bash
# Fetch IPs, IPv6, and CIDRs and format them for Nginx
curl -fsSL https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_ips.txt \
  https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_ipv6.txt \
  https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_cidrs.txt \
  | grep -vE '^#' | sed 's/^/deny /; s/$/ ;/' > /etc/nginx/conf.d/himalayafeed-deny.conf
  
nginx -s reload
```
</details>

<details>
<summary><b>🕳️ Pi-Hole &mdash; DNS Sinkhole (Domains)</b></summary>
<br/>

To block malicious domains network-wide using Pi-Hole:
1. Open Pi-Hole Admin Console
2. Go to **Adlists**
3. Add the following URL:
   `https://raw.githubusercontent.com/kalidada18/himalayafeed/main/ioc/malicious_domains.txt`
4. Update Gravity (`pihole -g`)
</details>

---

## 🗄️ Historical Archives

A zip archive of the complete feed is published daily to the **[Releases](https://github.com/kalidada18/himalayafeed/releases)** page. These historical snapshots are ideal for retrospective SIEM hunting and academic research.

---

<div align="center">
  <sub>⚖️ <a href="LICENSE">MIT License</a> &nbsp;·&nbsp; upstream feed data subject to each provider's ToS.</sub>
</div>
