<div align="center">
  <img src="img/himalayafeed.png" alt="HimalayaFeed" width="120" style="border-radius: 50%;">

  <h1>HimalayaFeed</h1>
  <p><em>Automated malicious IP & IOC intelligence — zero infra, zero cost.</em></p>

  [![Update Feed](https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml/badge.svg)](https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml)
  ![Python](https://img.shields.io/badge/python-3.11%2B-blue)
  ![License](https://img.shields.io/badge/license-MIT-green)
  ![No API Keys](https://img.shields.io/badge/API%20keys-none-brightgreen)
  ![No VPS](https://img.shields.io/badge/infrastructure-zero-brightgreen)
</div>

---

## ⚡ Why HimalayaFeed?

| | |
|---|---|
| 🖥️ **Zero infra** | Runs on GitHub Actions. No VPS, no servers. |
| 💸 **Zero cost** | Free public feeds + free Actions minutes. |
| 🔌 **Zero friction** | Fork once → auto-updates every hour. |
| 🔧 **Universal** | Raw IPs, CSV, JSON, STIX 2.1 — plug into anything. |

---

## 📦 Feeds

| Feed | Format | Use Case | URL |
|------|--------|----------|-----|
| `malicious_ips.txt` | Plain text | Firewalls, iptables | [↗ raw](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt) |
| `malicious_ips.csv` | CSV | SIEMs, databases | [↗ raw](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.csv) |
| `malicious_hashes.txt` | Plain text | Malware detection (1M+ SHA-256) | [↗ raw](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_hashes.txt) |
| Daily snapshots | ZIP archive | Historical research | [↗ Releases](https://github.com/kalidada18/himalayafeed/releases) |

> 📍 All files committed to `main` and refreshed **every hour** via GitHub Actions.

---

## 🔗 Integrations

<details>
<summary><b>🐧 Linux — iptables / ipset</b></summary>

```bash
wget -qO- https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt \
  | grep -E '^[0-9]' | while read IP; do iptables -I INPUT -s $IP -j DROP; done
```
> ⚠️ High volume? Use `ipset` instead of raw iptables rules.
</details>

<details>
<summary><b>🌐 NGINX Blocklist</b></summary>

```bash
curl -fsSL https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt \
  | grep -E '^[0-9]' | sed 's/^/deny /; s/$/ ;/' > /etc/nginx/conf.d/himalayafeed-deny.conf
nginx -s reload
```
</details>

---

## 🚀 Self-Host in 2 Minutes

```
1. Fork this repo
2. Settings → Actions → General → "Allow all actions and reusable workflows" ✓
3. Done. Feed auto-updates every hour.
```

---

## 🎨 Design

Accent color: **Nepali Crimson Red `#DC143C`** — black text, red highlights.

---

## ⚖️ License

[MIT](LICENSE) — upstream feed data subject to each provider's ToS.
