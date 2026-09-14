// Feed keys (pipeline/update_feed.py) → human vendor names. Several raw keys
// collapse to one vendor (both Feodo lists are "Feodo Tracker"), so the chip
// row dedupes after mapping.
//
// This is a 3-way contract with the pipeline and the feed line format (see
// memory: threatbase-feed-line-format) — keep it in sync with feed keys.
export const SOURCE_LABELS: Record<string, string> = {
  feodo_tracker: 'Feodo Tracker', feodo_tracker_aggressive: 'Feodo Tracker',
  threatfox_full: 'ThreatFox', sslbl_abuse_ch: 'SSL Blacklist',
  bbcan177_ms1: 'BBcan177', ipsum: 'IPsum', blackbook: 'BlackBook',
  firehol_level1: 'FireHOL L1', firehol_level2: 'FireHOL L2', firehol_level3: 'FireHOL L3',
  cins_army: 'CINS Army',
  emerging_threats: 'Emerging Threats', emerging_threats_fwrules: 'Emerging Threats',
  blocklist_de: 'Blocklist.de', blocklist_de_ssh: 'Blocklist.de SSH', blocklist_de_mail: 'Blocklist.de Mail',
  blocklist_de_apache: 'Blocklist.de Apache', blocklist_net_bots: 'blocklist.net Bots', blocklist_net_strongips: 'blocklist.net Strong_ips',
  binary_defense: 'Binary Defense', greensnow: 'GreenSnow', abuseipdb: 'AbuseIPDB',
  spamhaus_drop: 'Spamhaus DROP', spamhaus_edrop: 'Spamhaus eDROP', spamhaus_dropv6: 'Spamhaus DROPv6',
  dshield_blocklist: 'SANS DShield', criticalpath_security: 'Critical Path',
  bruteforceblocker: 'BruteForceBlocker', botvrij: 'Botvrij',
  dan_tor: 'Tor List', tor_bulk_exit: 'Tor Project', snort_ip_filter: 'Snort',
  alienvault_reputation: 'AlienVault OTX', stopforumspam_toxic: 'StopForumSpam',
  romainmarcoux_outgoing_40k: 'R. Marcoux', romainmarcoux_outgoing_aa: 'R. Marcoux', romainmarcoux_outgoing_ab: 'R. Marcoux',
  dataplane_sipinv: 'DataPlane SIP', dataplane_sshclient: 'DataPlane SSH', dataplane_sshpwauth: 'DataPlane SSH Auth', dataplane_vncrfb: 'DataPlane VNC',
  custom: 'Threatbase Verified',
}

export function labelSources(keys: string[]): string[] {
  const out: string[] = []
  for (const k of keys) {
    const label = SOURCE_LABELS[k] || k
    if (!out.includes(label)) out.push(label)
  }
  return out
}
