--
-- SOURCE: hosted project fybwjibrvwqwnspgswtp, read with the publishable key
-- (reported_ips / comments are public-read there). APPLIED to the self-hosted
-- instance 2026-09-17.
--
-- THREE THINGS THIS FILE ENCODES THAT ARE EASY TO GET WRONG:
--
--  1. user_id is NULLed. The hosted auth.users rows do not exist on the new
--     instance and accounts are re-registering, so the FK cannot be satisfied.
--     Consequence: these 97 rows are owner-immutable until relinked — both
--     reported_ips_update_own and reported_ips_delete_own require
--     user_id = auth.uid(). Relink once users re-register:
--
--       with pick as (
--         select distinct on (r.ip, p.id) r.id as row_id, p.id as uid
--           from public.reported_ips r
--           join public.profiles p on p.username = r.reporter_alias
--          where r.user_id is null
--          order by r.ip, p.id, r.created_at
--       )
--       update public.reported_ips t set user_id = pick.uid
--         from pick where t.id = pick.row_id;
--
--     The DISTINCT ON is REQUIRED, not stylistic. The obvious form —
--       update public.reported_ips r set user_id = p.id
--         from public.profiles p
--        where r.user_id is null and r.reporter_alias = p.username;
--     — links ZERO rows and raises 23505. reported_ips_ip_user_uniq is unique
--     on (ip, user_id) where user_id is not null, so a second row for the same
--     reporter on the same IP is rejected, and Postgres aborts the entire
--     statement on the first conflict rather than skipping it. It fails here on
--     213.209.159.158, reported 3x under one alias; linking one row and leaving
--     the other two NULL is the intended outcome. Verified 2026-09-17 in a
--     rolled-back transaction before running for real.
--
--     That also repairs the 9 hosted rows that were already orphaned, and it
--     brings back avatars in top_contributors (the view joins on user_id, not
--     on the alias). Applied 2026-09-17: 51 of 97 rows linked — previously
--     user_id was NULL on all 97, so avatar_url was NULL for EVERY
--     top_contributors group even where a profile had a real picture.
--
--  2. comments_stamp_username is DISABLED for the load. The trigger overwrites
--     NEW.username from profiles, and with profiles empty it would flatten both
--     real usernames to 'contributor'. The values below are the originals.
--
--  3. The hosted `disputes` table is NOT imported — its single row is a test
--     artifact (ip 8.8.8.8, reason 'Google DNS', alias 'dmitry'). It is a
--     public resolver rather than a false-positive report, and at 1 dispute it
--     is far below the >=3 threshold that suppresses an IP, so it changes
--     nothing either way. To import it by hand:
--
--       insert into public.disputes (id, ip, reason, reporter_alias, user_id, created_at)
--       values ('211a5456-4428-4e0a-9304-142bdea93126', '8.8.8.8', 'Google DNS',
--               'dmitry', '<a-real-uid>', '2026-09-03T15:00:13.377545+00:00');
--
-- RESULT: 97 reported_ips (94 distinct IPs, all processed_at set), 2 comments,
-- 0 disputes — matching the hosted counts exactly.
-- ============================================================================

begin;

alter table public.comments disable trigger comments_stamp_username;

insert into public.reported_ips (id, ip, category, comment, reporter_alias, user_id, created_at, processed_at) values
  ('353bb1b7-7b94-4ac7-b5ae-5de70def4757','14.103.116.87','Brute Force','Cowrie Honeypot: 5 unauthorised SSH/Telnet login attempts between 2026-06-12T11:34:16Z and 2026-06-12T11:51:54Z','lamichhanesujal18',NULL,'2026-06-12T11:52:41.552932+00:00','2026-06-12T15:19:47.264677+00:00'),
  ('675b8ad9-7f8a-4ee7-a10a-5d0ee17dd72e','65.49.1.183','Port Scanning','Targeting random port 8080','whoisdmitry003',NULL,'2026-06-12T13:02:38.007901+00:00','2026-06-12T15:19:47.264677+00:00'),
  ('8c6c4677-90c2-4fe3-b665-6b33ee81a6ce','69.5.169.16','Port Scanning','FW-PortScan: Traffic Blocked srcport=20268 dstport=30461','lamichhanesujal18',NULL,'2026-06-12T13:47:32.160935+00:00','2026-06-12T15:19:47.264677+00:00'),
  ('356952f7-1e3e-4682-8f4b-056aba1fc1a0','136.117.12.187','Port Scanning','Website Scanning / Scraping','lamichhanesujal18',NULL,'2026-06-12T13:48:15.151253+00:00','2026-06-12T15:19:47.264677+00:00'),
  ('52110531-2962-47a4-bd36-044314a4b2a9','2.57.217.229','Brute Force','Brute force SSH login attempts.','anonmyous',NULL,'2026-06-12T15:06:54.104994+00:00','2026-06-12T15:19:47.264677+00:00'),
  ('f338452f-c17f-401e-8a83-5e6c7836e6f8','103.163.97.211','Brute Force','SSH brute force attack',NULL,NULL,'2026-06-12T15:07:35.267596+00:00','2026-06-12T15:19:47.264677+00:00'),
  ('0aba9738-1965-426e-943f-eaab5d906e66','223.243.24.178','Spam','Spamming emails to SMTP server','lamichhanesujal18',NULL,'2026-06-13T03:24:19.605853+00:00','2026-06-13T10:15:36.788717+00:00'),
  ('41f9d451-bba0-4502-b02a-bd417cb47c81','191.96.110.39','Brute Force','SSH Bruteforce','lamichhanesujal18',NULL,'2026-06-13T03:25:01.067846+00:00','2026-06-13T10:15:36.788717+00:00'),
  ('47aeb986-9cb3-4d22-9f37-2d356ce3468b','209.99.189.177','Brute Force','SSH brute-force detected From this IP','lamichhanesujal18',NULL,'2026-06-13T03:26:08.966326+00:00','2026-06-13T10:15:36.788717+00:00'),
  ('21c9ddf0-82b9-4d2e-9183-ca5d3ce71e58','213.209.159.158','Brute Force','unauthorised SSH/Telnet login attempts','lamichhanesujal18',NULL,'2026-06-14T08:53:38.361456+00:00','2026-06-14T10:15:42.812071+00:00'),
  ('551ebeb4-1298-4064-86f2-1e29180d9575','213.209.159.158','Brute Force','SSH BruteForce','lamichhanesujal18',NULL,'2026-06-14T08:54:18.615947+00:00','2026-06-14T10:15:42.812071+00:00'),
  ('91f1d3e0-6adb-4d03-a806-cb7d5cd10f48','65.20.167.78','Brute Force','SMTP attack!!','lamichhanesujal18',NULL,'2026-06-14T09:04:13.74725+00:00','2026-06-14T10:15:42.812071+00:00'),
  ('dc6b4c31-c985-4265-a4db-33313da2851f','213.209.159.158','Brute Force','SSH brute-force + firewall probe detected','lamichhanesujal18',NULL,'2026-06-14T09:08:14.607636+00:00','2026-06-14T10:15:42.812071+00:00'),
  ('eff51637-b487-4f89-bf44-5bc80e8e9f8f','204.76.203.213','Port Scanning','UFW blocked a suspicious connection attempt to a closed or denied port.','lamichhanesujal18',NULL,'2026-06-16T05:10:17.12322+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('66268071-5384-4257-8cef-40114295827c','223.123.72.139','Brute Force','Unauthorised Login attempt on port 23','lamichhanesujal18',NULL,'2026-06-16T05:40:12.637194+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('2226e17f-b6d8-4bf1-bd33-1b145de231a8','69.5.169.190','Port Scanning','Unauthorized connection attempt detected for port scanning','lamichhanesujal18',NULL,'2026-06-17T05:55:11.606243+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('36521ab6-41f4-49fe-8a4f-5b9f9f1d4544','66.132.172.149','Port Scanning','Port scanning seen in fw logs','lamichhanesujal18',NULL,'2026-06-17T06:01:28.91486+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('1a796d42-9714-4eb4-b4da-d526a32f0dfc','2001:470:1:c84::1ca','Brute Force','Unauthorized connection to SSH port 22','lamichhanesujal18',NULL,'2026-06-17T06:03:25.899334+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('ec2a4885-09f2-4f27-b248-3cb4385d3650','164.68.108.70','Brute Force','Fuzzing for misconfigured web servers.','lamichhanesujal18',NULL,'2026-06-17T06:04:14.613624+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('01e793b2-f397-4696-a5d8-83c8730979e8','91.230.168.145','Port Scanning','Unauthorized connection','lamichhanesujal18',NULL,'2026-06-17T06:05:19.075716+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('320cedf2-83a0-41d2-ae20-fcf4ffac50e4','203.158.221.161','Brute Force','WP Login Attack','lamichhanesujal18',NULL,'2026-06-21T07:16:56.670955+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('1f4357fc-6526-413e-a0b9-7230d64c762a','45.148.10.141','Brute Force','Failed password for root from 45.148.10.141 port 45276 ssh2','lamichhanesujal18',NULL,'2026-06-22T16:23:51.400717+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('95447bb4-c21f-473d-a63c-ff4f9349bc7a','111.26.106.119','Brute Force','SMTP Brute Force','lamichhanesujal18',NULL,'2026-06-23T04:46:13.698911+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('a7f5737d-28f8-4cfc-8e10-69d3175a4991','183.224.79.111','Brute Force','SSH Bruteforce','lamichhanesujal18',NULL,'2026-06-23T04:47:28.143335+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('51913017-edd5-49b0-9894-5107c28f75c0','203.113.174.15','Brute Force','Failed login attempt','lamichhanesujal18',NULL,'2026-06-23T05:00:22.183643+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('cad22875-ee01-485f-a5b4-433bcb0f08cb','176.53.182.81','Brute Force','SSH brute force attempt.','lamichhanesujal18',NULL,'2026-06-23T05:01:38.011803+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('8eac5e76-adb2-46d2-a62d-2b490e3a08a0','195.184.76.123','DDoS Attack','Blocked Host at 10:42 by ATLAS Threat Categories. Threat_Name: DDoS Botnets, Threat_Category: DDoS','Anonymous',NULL,'2026-06-24T05:50:34.577487+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('3c4b7ffd-6404-4634-91f5-c70e171d0162','116.71.136.125','Brute Force','This IP address has been observed conducting malicious activity across 960 events','Anonymous',NULL,'2026-06-24T06:40:51.751313+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('7e1429c9-70bc-45d4-9176-19b199638f91','174.71.214.155','Brute Force','SMTP attak','Anonymous',NULL,'2026-06-28T08:59:34.194344+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('298e9c7a-bc95-411e-9289-6909a73a16d6','66.132.186.166','Port Scanning','Port scan detected','Anonymous',NULL,'2026-06-28T09:00:19.626771+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('2a60b352-c030-42be-8ff7-56c40120a8f9','203.76.241.18','Brute Force','SSH abuse or brute-force attack','Anonymous',NULL,'2026-06-28T09:01:18.164539+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('7cecf6bb-5e05-43c6-9cba-ac2a588113bf','203.76.241.18','Brute Force','ssh bruteforce','lamichhanesujal18',NULL,'2026-06-28T09:07:28.258809+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('33c188df-14be-4435-b826-0dd61b68c56e','212.227.244.14','Port Scanning','trying to access non-authorized port','lamichhanesujal18',NULL,'2026-06-28T09:08:50.355905+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('43c10d35-fdd5-46fa-b2f7-29c7ab2c4f66','198.74.50.114','Port Scanning','firewall-block, port(s): 993/tcp','lamichhanesujal18',NULL,'2026-07-25T04:17:04.255837+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('a87bf776-8c7e-4f30-891f-a609820477a5','180.93.172.213','Brute Force','SSH Bruteforce','whoisdmitry003',NULL,'2026-08-02T06:44:26.194773+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('d0d93051-fbe1-4be3-a276-2dd878bf92da','152.32.243.98','Port Scanning','Traffic to MISP IP','lamichhanesujal18',NULL,'2026-08-05T03:24:55.264219+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('b7fb1604-5210-45cf-b7a7-2b8647c7865a','2a02:2479:ac:4100::1','Brute Force','SSH brute force attacks','lamichhanesujal18',NULL,'2026-08-17T12:29:47.649714+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('41622c8c-9867-4faa-a17b-ba11a80418b0','207.154.247.140','Brute Force','Failed login ssh','lamichhanesujal18',NULL,'2026-08-29T12:51:27.867355+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('31121299-d663-4c34-a15a-7e4982ae657d','80.94.92.241','Port Scanning','Port Scanning Detected in SSH','lamichhanesujal18',NULL,'2026-09-02T04:24:13.790749+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('92845747-22d7-4faa-a1fc-873a51ffc59e','223.27.244.164','Brute Force','SSH, Brute force attack from this ip.','bohoraronish10',NULL,'2026-09-05T10:30:04.66596+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('6157fcc1-4e7e-4c24-ba35-920e78d9c95d','152.53.108.193','Brute Force','Web application  brute force attack from  this ip.','bohoraronish10',NULL,'2026-09-05T10:35:15.006177+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('a454d28a-da44-44e6-8b84-59b26918bc90','196.200.160.108','Brute Force','BruteForce and SSH attack from this ip.','bohoraronish10',NULL,'2026-09-05T10:53:31.666868+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('e38d3385-9a38-4674-bccb-4a9e421dc80e','190.2.38.21','Brute Force','ssh brute-force attack detected from this ip','bohoraronish10',NULL,'2026-09-05T11:00:26.864002+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('40034790-6b20-40ac-99be-63e2ba1ac0d9','220.247.200.250','Brute Force','ssh brute-force detected from the ip','bohoraronish10',NULL,'2026-09-05T11:04:08.92241+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('db123118-c1e0-4b6f-8c77-0739c5e82fcb','200.93.248.56','Brute Force','Web app attack, ssh bruteforce detected from the ip','bohoraronish10',NULL,'2026-09-05T11:06:21.281269+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('a50f06e5-8136-4c0a-aa2a-5be4dc126230','113.190.61.1','Brute-Force, Email Spam','SPAM or Brute force attack detected','lamichhanesujal18',NULL,'2026-09-05T13:17:40.220593+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('0486bfee-d097-4bec-9087-a0c7c264102a','200.114.119.90','Brute-Force, SSH, IoT Targeted, VPN IP, Fraud VoIP, Ping of Death','SSH abuse or brute force attack detected','bohoraronish10',NULL,'2026-09-05T14:08:05.243905+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('c5a13f69-f0ff-4b13-a3a5-e4de94277774','131.123.40.77','Brute-Force, SSH, Port Scan','Port scanning + Brute Force','lamichhanesujal18',NULL,'2026-09-05T14:31:16.155511+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('7f215e48-4cc7-41ab-8f1b-a775cf526241','195.178.110.232','Brute-Force, SSH','SSH brute-force detected from this ip','bohoraronish10',NULL,'2026-09-05T17:41:45.38074+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('78ad8535-395f-4795-b6be-83381065928c','45.152.67.20','Brute-Force, Web App Attack','brute-force and web app attack detected','bohoraronish10',NULL,'2026-09-05T17:44:04.155041+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('425b2e16-869c-4c1d-9f21-b6feaf469caa','209.141.47.217','SSH, Brute-Force','SSH Authentication Brute-Force','bohoraronish10',NULL,'2026-09-06T02:02:53.602901+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('4f60e658-1b4b-4515-b05c-84221dbb83ce','212.102.40.218','Web App Attack','WebApp attack from this ip','bohoraronish10',NULL,'2026-09-06T02:05:56.704379+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('5ad8e8fc-8e76-4054-9c02-4d4abd8402dc','138.197.191.237','Port Scan','Nmap Scan Detected','lamichhanesujal18',NULL,'2026-09-06T03:06:20.168981+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('50aefd5a-0ff6-42d0-931c-c4023e5aebba','66.132.172.140','Port Scan, Hacking','Censys Scanner','lamichhanesujal18',NULL,'2026-09-06T03:07:02.754698+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('2d3aefed-8101-4686-9081-e505cab8ee47','188.166.68.252','Port Scan','IP was observed performing automated IP/port scanning activity, consistent with reconnaissance behavior.','lamichhanesujal18',NULL,'2026-09-06T03:08:02.29659+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('abd14de6-ceac-450c-ab59-cdfd01992956','165.22.47.52','Port Scan','IP/port scanning activity, consistent with reconnaissance behavior.','lamichhanesujal18',NULL,'2026-09-06T03:08:24.630222+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('cfc0ddc6-d9b5-4a77-8e62-5df4e840ffec','66.132.172.141','Port Scan','Source IP identified as Censys scanner performing automated internet-wide reconnaissance/scanning activity.','lamichhanesujal18',NULL,'2026-09-06T03:09:02.423204+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('c276cf5b-1202-445f-877c-a4efa11ad4a7','107.150.97.10','Hacking, Web App Attack','Web application exploit attempt','lamichhanesujal18',NULL,'2026-09-06T03:59:10.457789+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('657b8ed9-3df2-4b16-9ab1-ad7216ddf0eb','87.236.146.16','Web App Attack, Hacking','Exploit Attempt: RCE','lamichhanesujal18',NULL,'2026-09-06T04:01:07.897905+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('64add344-b985-44b3-b7f3-e478ab42e259','2.57.121.112','SSH, Brute-Force','SSH Brute-Force Attempt','lamichhanesujal18',NULL,'2026-09-06T10:33:14.915377+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('8acc7b25-5d89-4bfe-8bf2-40c75514bbfc','193.47.62.69','Brute-Force, SSH','SSH brute-force detected from this ip','bohoraronish10',NULL,'2026-09-07T02:10:19.292217+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('2204c548-a216-4fb5-8e73-85c6daebdb06','223.123.43.243','Hacking, Port Scan, Web App Attack','Multiple attack detected from this ip','bohoraronish10',NULL,'2026-09-07T02:13:11.614908+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('9562a416-48f1-4407-b51d-cd8b0c79645e','69.164.192.153','Port Scan','Malicious Probing/Bad Request','lamichhanesujal18',NULL,'2026-09-07T02:53:04.749473+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('078b115e-02cb-4b98-94ff-5eb3636b2964','193.32.209.246','Port Scan','tcp port scan','lamichhanesujal18',NULL,'2026-09-07T02:55:32.595332+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('4298023b-2829-4fd2-b0b3-e2bb8520acfa','193.163.125.55','Port Scan','port scan detected from this ipf','bohoraronish10',NULL,'2026-09-07T03:05:24.362837+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('bedc20be-b8b0-4427-9b9f-6523f66a0844','130.49.215.211','Brute-Force','Failed VPN Logon attempt: admin','lamichhanesujal18',NULL,'2026-09-07T04:57:32.444104+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('62d791c2-79b7-4544-9118-813158f96798','185.242.246.169','Brute-Force','Failed VPN Login for user admin','lamichhanesujal18',NULL,'2026-09-07T04:58:26.784104+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('6b22f377-29d6-4315-b4e3-b7ab503f16ee','130.49.215.206','Brute-Force','VPN Login Attempt: admin','lamichhanesujal18',NULL,'2026-09-07T04:59:06.39742+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('c5df6f05-3c77-45e7-9c38-7e54f89a24bc','87.251.64.229','Brute-Force','VPN Login Attempt: admin','lamichhanesujal18',NULL,'2026-09-07T04:59:24.676949+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('b2697c63-a592-4a36-9a4c-804ebad93954','91.92.47.116','Hacking, IoT Targeted, Web App Attack','Mirai-associated botnet activity','lamichhanesujal18',NULL,'2026-09-07T05:19:57.77188+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('7a17aacf-ca45-4a51-84d1-ccee7b6e8789','111.111.111.111','Hacking','japanese web attacker','squatchpy69',NULL,'2026-09-08T00:23:53.276626+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('1be15ead-2655-42e4-b1b3-193e31522a8c','190.8.169.43','Hacking, Brute-Force','honeypot brute-force','lamichhanesujal18',NULL,'2026-09-08T01:39:17.891377+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('79fc1e37-285e-445a-b446-240fbcba771a','94.154.43.203','Hacking, Exploited Host','FortiGuard Malware IP','lamichhanesujal18',NULL,'2026-09-08T04:01:11.572564+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('697ad1b9-2a70-4619-a06c-ab79c8e08554','91.92.42.203','Hacking, Port Scan','hacking and port scan discovered from this ip','bohoraronish10',NULL,'2026-09-08T05:38:43.056404+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('bfb5fcb1-348f-4558-a3f9-cc4d6f676fe6','192.6.121.28','Brute-Force, SSH','brute force ssh detected from this ip','bohoraronish10',NULL,'2026-09-08T05:43:31.491847+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('e0e7402a-fb99-4efa-8e3b-0dfc12f7b82a','191.33.76.49','Brute-Force, SSH','brute force attempt','bohoraronish10',NULL,'2026-09-08T05:46:15.076143+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('375aa62f-4390-4f14-9cc6-ae1a7904cbc5','165.154.164.21','Port Scan','Malware IP','lamichhanesujal18',NULL,'2026-09-08T06:07:09.961954+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('7dd4a5fc-4265-4878-a539-22f1b463a98f','123.58.200.147','Hacking, Port Scan','Malware IP','lamichhanesujal18',NULL,'2026-09-08T06:07:47.889215+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('c3226383-821f-4034-bade-c683b87e0c3c','196.207.177.56','Port Scan, Email Spam','port scan and email spam from the ip','bohoraronish10',NULL,'2026-09-08T14:05:46.027828+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('36408279-6d47-4f11-8b88-2565e6d9d57b','98.190.61.247','Port Scan, Brute-Force','Password guessing attack','bohoraronish10',NULL,'2026-09-08T14:07:54.055719+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('45629742-597b-48e2-a870-dbab85688f3c','91.134.139.15','SSH, Brute-Force','SSH abuse or brute-force attack detected','bohoraronish10',NULL,'2026-09-08T14:10:34.776821+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('5cf31691-df1e-4fab-ba57-406685b30213','27.218.56.241','Port Scan, Hacking, Brute-Force','port scan, hacking and brute force detected from this ip','bohoraronish10',NULL,'2026-09-08T14:12:51.182903+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('74570efb-6481-40a6-b7b2-11b044feddea','27.71.26.102','Brute-Force, SSH','brute-force, ssh detected from this ip','bohoraronish10',NULL,'2026-09-08T14:14:44.933685+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('9a1e849c-721d-4e5d-a000-bd2255cb6e3f','1.220.198.126','DDoS Attack, Port Scan','SMTP brute force','bohoraronish10',NULL,'2026-09-08T14:16:22.33742+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('8c082204-e55b-4b44-9050-57dd4b36c0fd','210.79.142.201','Brute-Force, SSH','Brute-Force , SSH detected from this ip','bohoraronish10',NULL,'2026-09-08T14:17:51.531547+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('b08ac713-c132-468c-b016-05693410bc2c','104.220.35.174','Brute-Force, Email Spam, Web App Attack','multiple threats detected','bohoraronish10',NULL,'2026-09-08T14:19:46.318256+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('d81cb6a5-c8c2-4b27-9a9e-bbb58f1ce2cd','62.60.130.242','SSH, Brute-Force','brute force and ssh detected','bohoraronish10',NULL,'2026-09-08T14:20:55.614786+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('db02d2e9-864e-483e-8094-e5717d10a202','194.50.235.138','Port Scan, Hacking','tcp port scan','bohoraronish10',NULL,'2026-09-08T14:22:51.129197+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('b1f8b442-503f-4647-a459-5a9c7d7a96d2','172.83.83.194','SSH, Brute-Force','SSH brute force attacks','bohoraronish10',NULL,'2026-09-08T14:25:04.641177+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('dc7f6c91-550e-4602-b10b-18b66e77a9e4','58.222.244.226','Brute-Force, SSH','SSH Authentication Brute-Force','bohoraronish10',NULL,'2026-09-08T14:27:31.23145+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('3987d812-f969-4e8e-ac18-ff5b780474f3','199.45.154.117','Brute-Force, Port Scan','trying to access non-authorized port','bohoraronish10',NULL,'2026-09-08T14:29:05.080709+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('4c22d2bb-8c9c-4bb5-8d6f-def3b819f50d','180.247.59.187','Brute-Force, SSH','SSH bruteforce','bohoraronish10',NULL,'2026-09-08T14:30:21.561457+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('29af5a3d-d08b-4c1b-925a-b002100aa0b5','219.129.236.174','Brute-Force, SSH','SSH bruteforce and port scanner','lamichhanesujal18',NULL,'2026-09-10T13:40:55.312545+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('2f1160aa-f0f0-4909-84ee-c2d61b1f2f0f','216.226.77.20','Port Scan, Hacking','Port Scan Attack','bohoraronish10',NULL,'2026-09-12T11:07:38.401505+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('9d88bd62-d069-459c-92b2-b55ca9bc0dea','213.230.78.250','Hacking, Exploited Host, Web App Attack','multiple attack detected','bohoraronish10',NULL,'2026-09-12T11:09:48.599904+00:00','2026-09-14T10:16:56.674645+00:00'),
  ('f6731911-a68e-4903-a492-3925c5eb79b5','20.221.66.74','Port Scan','Port Scanner','lamichhanesujal18',NULL,'2026-09-14T15:23:01.331143+00:00','2026-09-14T18:17:21.070405+00:00'),
  ('f258872e-781f-4792-8663-3684008bf0da','103.95.40.58','SSH, Brute-Force','SSh brute force attacks','bohoraronish10',NULL,'2026-09-16T01:42:51.848414+00:00','2026-09-16T02:17:21.875049+00:00');

insert into public.comments (id, indicator, body, user_id, username, created_at) values
  ('9789d2eb-3b99-45dc-bc23-3912705f72ff','2.57.121.112','SSH login attempts',NULL,'lamichhanesujal18','2026-09-05T03:52:20.779724+00:00'),
  ('d2bb38b5-7439-4005-9d3b-78d2179c2a39','47.84.115.39','this is very very suspicious',NULL,'sabangiri4','2026-09-09T04:03:22.948478+00:00');

alter table public.comments enable trigger comments_stamp_username;

commit;
