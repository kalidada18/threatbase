<div align="center">
  <img src="img/himalayafeed.png" alt="HimalayaFeed" width="130" style="border-radius: 50%;">

  <h1>🏔️ HimalayaFeed</h1>
  <p><em>Automated malicious IP & IOC intelligence — powered by GitHub Actions.</em></p>

  [![Update Feed](https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml/badge.svg)](https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml)
  &nbsp;
  ![Python](https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square)
  ![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
  ![No API Keys](https://img.shields.io/badge/API%20keys-none-brightgreen?style=flat-square)
</div>

<br/>

---

## 📦 Feeds

| &nbsp; | Feed | Format | Use Case |
|--------|------|--------|----------|
| 🌐 | [`malicious_ips.txt`](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt) | Plain text | Firewalls, iptables |
| 📊 | [`malicious_ips.csv`](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.csv) | CSV | SIEMs, databases |
| 🦠 | [`malicious_hashes.txt`](https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_hashes.txt) | Plain text | Malware detection — 1M+ SHA-256 |
| 🗄️ | [Daily snapshots](https://github.com/kalidada18/himalayafeed/releases) | ZIP archive | Historical research |

> 🔄 All feeds refresh **every hour** via GitHub Actions, committed directly to `main`.

---

## 🔗 Integrations

<details>
<summary><b>🐧 Linux &mdash; iptables / ipset</b></summary>
<br/>

```bash
wget -qO- https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt \
  | grep -E '^[0-9]' | while read IP; do iptables -I INPUT -s $IP -j DROP; done
```

> ⚠️ High volume? Use `ipset` instead of raw iptables rules.
</details>

<details>
<summary><b>🌐 NGINX Blocklist</b></summary>
<br/>

```bash
curl -fsSL https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt \
  | grep -E '^[0-9]' | sed 's/^/deny /; s/$/ ;/' > /etc/nginx/conf.d/himalayafeed-deny.conf && nginx -s reload
```
</details>

---

<div align="center">
  <sub>⚖️ <a href="LICENSE">MIT License</a> &nbsp;·&nbsp; upstream feed data subject to each provider's ToS.</sub>
</div>
