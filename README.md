<div align="center">
  <img src="img/himalayafeed.png" alt="HimalayaFeed Banner" width="250" style="border-radius: 50%; box-shadow: 0 4px 8px rgba(0,0,0,0.2); margin-bottom: 20px;">
  
  <h1>HimalayaFeed</h1>
  
  <p>
    <a href="https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml">
      <img src="https://github.com/kalidada18/himalayafeed/actions/workflows/update-feed.yml/badge.svg" alt="Update Feed">
    </a>
    <img src="https://img.shields.io/badge/python-3.11%2B-blue" alt="Python 3.11+">
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  </p>
  
  <h3>A fully-automated, simple malicious IP intelligence feed.</h3>
  <p><em>Powered by curiosity</em></p>
</div>

<br/>

HimalayaFeed is designed for pure simplicity and effectiveness. It aggregates known malicious IPv4 addresses from reputable open-source intelligence (OSINT) feeds.

---

## 📄 Available Feeds

All files are committed directly to this repository and updated automatically every hour. You can pull these directly into your security infrastructure:

### 🤬 🖕 🛑 Fucking Malicious IPs (Block these assholes)
`malicious_ips.txt` — One fucking IPv4 address per line. Drop them all to hell!

<img src="https://media.tenor.com/Fw57_XkF60sAAAAC/middle-finger-mr-bean.gif" width="200" alt="Fuck those IPs">
<img src="https://media.tenor.com/lD2Yd2N3D6sAAAAC/fuck-you.gif" width="200" alt="Fuck you">


```
https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt
```

### 🗄️ Historical Archives (Best for Research)
A zip archive of the feed is automatically published every day at midnight UTC to the **[Releases](https://github.com/kalidada18/himalayafeed/releases)** page. These daily snapshots allow you to historically analyze which IPs were malicious on any given day.

### 💀 Full Malware Hashes (SHA-256)
`malicious_hashes.txt` — Over **1,000,000+** SHA-256 malware sample hashes sourced from MalwareBazaar. One hash per line, fully visible and searchable on the website.
```
https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_hashes.txt
```

---

## 🛡️ Integration Examples

### Linux iptables / ipset
```bash
wget -qO- https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt | grep -E '^[0-9]' | while read IP; do
  iptables -I INPUT -s $IP -j DROP
done
```
*(Note: For high-volume blocking, using `ipset` is highly recommended over raw iptables rules).*

### NGINX Blocklist
```bash
curl -fsSL https://raw.githubusercontent.com/kalidada18/himalayafeed/main/malicious_ips.txt \
  | grep -E '^[0-9]' | sed 's/^/deny /; s/$/ ;/' > /etc/nginx/conf.d/himalayafeed-deny.conf
nginx -s reload
```

---

## ⚖️ License

This project is licensed under the **MIT License**. Upstream feed data is subject to each respective provider's terms of service.
