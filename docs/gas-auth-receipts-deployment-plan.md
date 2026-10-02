# แผนระบบยืนยันตัวตน การยืนยันผลบันทึก และ Deploy GAS

วันที่: 2026-10-01

สถานะ: แผนเท่านั้น ไม่ใช่การอนุมัติสร้าง cloud resource, แก้ production Sheets,
deploy GAS หรือ commit/push เพิ่มเติม

## 1. จุดตั้งต้น

- `18d523a`: Block Tracker/XSS เผยแพร่แล้ว
- `1f29641`: GAS route/target contract อยู่ใน Git แต่ยังไม่ได้ deploy GAS
- `6b5c8c6`: Pages public allowlist/test gate เผยแพร่แล้ว; Build 84
- Baseline ล่าสุด: 38 unit tests และ browser checks ของ public artifact ผ่าน
- Local transport PoC ใช้ cookie/ledger จำลอง ไม่ใช่ authentication หรือ storage จริง
- รหัสผ่าน/session ใน browser ไม่ใช่ server authorization
- `postToAppsScript` ยังใช้ `no-cors` และคืน queued โดยอ่านผลบันทึกไม่ได้
- `confirmRecordSaved` ยังจับ line/shift/trial; record เก่าอาจยืนยันคำขอใหม่ผิด
- ทุก write entry point รวม RPC และ deployment เก่าต้องอยู่ในขอบเขตแก้ไข

## 2. เป้าหมายและผลต่อเว็บหลัก

1. ผู้ไม่มีสิทธิ์เขียนข้อมูลไม่ได้ แม้เรียก GAS โดยตรงหรือปลอม browser session
2. แสดงบันทึกสำเร็จเฉพาะเมื่อ backend ยืนยัน operation นั้นจริง
3. Retry/double click/response lost ไม่ทำ business mutation ซ้ำ
4. หน้าแรกและ Dashboard ยังคง URL/read schema/การกรอง/last-good data เดิม
5. BB SKIN 25G R12, BB SKIN 35G F15, NECK SKIN 40G R15 คง Target 120
6. ไม่แก้ productivity, manpower, total output, trial และประวัติเดิมเพื่อให้ tests ผ่าน
7. ไม่เพิ่มการเรียก auth/session service ในรอบ refresh หน้าแรก

ไม่รับประกัน downtime เป็นศูนย์: มีช่วงหยุดการเขียนที่ต้องตกลงก่อน cutover
ช่องทางอ่านตั้งใจให้เปิดต่อ แต่ GAS/Sheets มีทรัพยากรร่วม จึงต้องทดสอบ quota,
concurrency และ load ก่อนเปิดใช้จริง

## 3. สถาปัตยกรรมที่เสนอ

```text
GitHub Pages: หน้าแรก / Dashboard / public read-only views
    -> GAS public reads: URL เดิม, JSON schema เดิม

Recording Portal: หน้าบันทึกบน origin เดียวกับ API
    -> Google login -> server session -> role/line permission -> CSRF validation
    -> Backend-for-Frontend (BFF)
    -> signed write envelope -> GAS validation -> Sheets mutation + receipt
    <- readable JSON receipt/status <- BFF <- Portal
```

เหตุผลเลือก BFF: browser คุยกับ API origin เดียวกัน ไม่พึ่ง opaque response หรือ
third-party session cookie ระหว่าง Pages กับอีก domain; BFF อ่าน GAS JSON และ
รองรับ ContentService redirect โดยไม่ส่ง credential ไปยังปลายทางที่ไม่ได้อนุญาต

หน้าแรกไม่ต้องย้าย hosting ส่วนหน้าบันทึกจะเปิด Portal แบบ top-level navigation
ไม่ส่ง session/token ผ่าน URL, iframe หรือ `window.name`

ทางเลือกหากไม่ต้องการ BFF: authenticated GAS HtmlService เฉพาะหน้าบันทึก
ต้องทำ identity/permission PoC ด้วยบัญชีจริงก่อนเลือก; principal ว่างให้ deny
ห้ามใช้ effective owner เป็นผู้บันทึก ทางเลือกนี้ต้องล็อก contract ใหม่ก่อน coding
ไม่สร้างสองสถาปัตยกรรมพร้อมกัน

## 4. สิ่งที่ต้องตัดสินใจก่อนลงมือระบบจริง

| เรื่อง | ข้อมูล/การตัดสินใจที่ต้องมี |
| --- | --- |
| Identity | Google Workspace domain หรือบัญชี allowlist; OAuth application owner |
| Permission | ผู้บันทึก, ผู้อนุมัติ, inventory editor, layout editor และสิทธิ์แต่ละ line |
| Hosting | BFF staging/production, domain, เจ้าของบัญชี, งบ, durable session storage |
| Sandbox | GAS project แยกและ private Sheet copies; ไม่ใช้ production เป็น staging |
| 3D | Source/package/build ของ active viewer; ไม่แก้ minified bundle โดยตรง |
| Data policy | ใครแก้ Sheet โดยตรงได้, soft-delete, audit/receipt retention, backup |
| Cutover | เจ้าของ deployment, ช่วงหยุดเขียน, ผู้ตรวจรับ, ผู้มีสิทธิ์ rollback |

ไม่ขอส่ง client secret, signing key, token หรือรหัสผ่านในแชต/Git
ตั้งค่าผ่าน secret/config storage ของระบบที่เลือก และแยก staging/production

## 5. ชุดงานและเกณฑ์ผ่าน

### A. Baseline, sandbox และ release inventory

- ระบุ active/legacy GAS deployments, script projects, version และ caller ทุกตัว
- สำรอง source/version/settings/Sheets/formulas/headers แบบไม่เก็บ secret ใน repo
- ทำ dependency map ทั้ง POST, RPC, scheduled trigger และ direct Sheet writers
- สร้าง sandbox หรือให้เจ้าของสร้าง พร้อมตรวจว่าไม่มี production Sheet IDs
- เก็บ public read baseline ทั้ง 7 lines และ Shift A/B รวม identity/target/error schema

ผ่านเมื่อ: มี sandbox isolation proof และ deployment/caller inventory ครบ
หากหา legacy endpoint หรือ Sheet writer ไม่ครบ ยังไม่ผ่าน security cutover

### B. Authentication และ readable transport จริง

- ทำ Google sign-in แบบ server-side ด้วย library ที่ตรวจ signature/issuer/audience/
  expiration และ login state/nonce; ใช้ verified `sub` เป็น user identity
- อนุญาต Workspace ผ่าน verified `hd` หรือ approved account allowlist
  ไม่ถือว่าทุกบัญชี Google ที่ login ได้มีสิทธิ์เขียน
- เก็บ session ฝั่ง server ใน durable store; cookie `Secure`, `HttpOnly`,
  `SameSite` ที่เหมาะกับ OAuth flow; session rotation, expiry, logout, revoke
- ตรวจ permission ทุก request ไม่รับ role/actor จาก form/browser เป็นหลักฐาน
- API ตรวจ Origin และ CSRF; จำกัด body/rate/timeouts; redirect return URL เป็น allowlist
- ทดสอบ BFF อ่าน JSON จาก staging GAS รวม redirect/error/timeout และ backend restart
- เปิด Portal/API staging เท่านั้น ยังไม่เปลี่ยน production forms

ผ่านเมื่อ: บัญชีที่อนุญาตเข้าได้, anonymous/บัญชีผิดสิทธิ์/expired/forged session
เข้า write API ไม่ได้; ได้ readable error จริง ไม่ใช่ HTTP 200 แล้วถือว่าสำเร็จ

### C. ปิด write bypass ใน GAS

- `doPost` ต้องตรวจ protocol/environment/key/signature/age/action/permission
  ก่อนเข้าถึง Sheet หรือสร้าง resource ใด ๆ
- Envelope ผูก `requestId`, actor, permission scope, route, timestamp และ
  SHA-256 hash ของ canonical validated payload; ไม่ใส่ signing key ใน frontend
- BFF สร้าง actor/permission จาก server policy; GAS ตรวจ action/line scope ซ้ำ
- `saveData`, public maintenance/RPC ต้อง guarded หรือไม่เปิด remote callable
- ปิด remote reset/repair/create-sheet จากผู้ใช้ทั่วไป; page-init ห้ามสร้าง Sheet
- `doGet`/public feeds เป็น lookup-only และไม่เปิด receipt/audit/session metadata
- ผล `read_health` ระบุ read/write protocol version แบบไม่มี secret/private IDs
- แยก production/staging key และวางแผน key rotation

ผ่านเมื่อ: unsigned/wrong signature/expired/cross-environment/forbidden requests
ทุก entry point ได้ rejection และ mutation count เท่ากับศูนย์

### D. Durable receipt, idempotency และ recovery

Browser/API contract:

```json
{
  "requestId": "UUID ของ operation เดียว",
  "action": "record_trial",
  "payload": {},
  "expectedRevision": 3
}
```

`expectedRevision` ใช้เฉพาะ update/delete; server ตรวจและ normalize payload ก่อน hash

Receipt ต้องมี protocolVersion, requestId, payloadHash, action, canonical route,
recordId, revision, status และ savedAt โดยไม่เปิดข้อมูลผู้บันทึกผ่าน public feeds

- Request ID เดิม + actor/action/route/payload เดิม: คืน receipt เดิม ไม่เขียนซ้ำ
- ID เดิม + payload/action/route ต่าง: conflict; actor อื่นไม่มีสิทธิ์อ่าน receipt
- เก็บ ledger/receipt แบบ durable ไม่ใช้ memory/CacheService เป็น source of truth
- เพิ่ม metadata ต่อท้าย business columns และค้นผ่าน header; ไม่ย้ายคอลัมน์เดิม
- ใช้ script lock พร้อม timeout/finally รอบ reconcile/check/mutation/receipt
- ทุก writer ของข้อมูลชุดเดียวกันต้องอยู่ใน protocol เดียวกัน; script lock
  ไม่ควบคุมคนแก้ Sheet โดยตรงหรือ writer จากคนละ script project
- Append: บันทึก requestId/hash ไปกับ row; หาก crash ก่อน receipt ให้ recover
  จาก business row แทน append ซ้ำ
- Update/delete: ใช้ durable intent + expectedRevision + reconciliation ก่อน operation
  ถัดไป; ถ้าพิสูจน์ after-state ไม่ได้ให้ unknown/conflict ไม่ overwrite โดยเดา
- เสนอ soft-delete/tombstone; ไม่ physical delete ระหว่าง migration
- ข้อมูลเก่าไม่มี requestId ยังอ่านได้ แต่ใช้ยืนยัน operation ใหม่ไม่ได้
- Retention/archive ต้องไม่ทำให้ replay operation เก่ากลับมาเขียนซ้ำ

ผ่านเมื่อ: concurrent duplicates มี business effect ครั้งเดียว, revision conflict
ไม่ overwrite, crash/timeout/response lost กู้สถานะได้ และไม่ใช้ record เก่ายืนยัน

### E. ย้าย write callers ทีละกลุ่ม

| กลุ่ม | การเปลี่ยน |
| --- | --- |
| Data Recording Hub | Login/session จาก server และนำทางไป Portal |
| Data Recording Approval | ใช้ mutation receipt; เลิก trial-match confirmation |
| Machine Breakdown Log | เลิก create-sheet ตอนเปิดหน้า; save ผ่าน receipt |
| Block Tracker Record | Draft แยก confirmed cache; quick-edit/delete ต้องรอผล |
| 3D Layout | แก้จาก source/rebuild และใช้ revision/receipt; ไม่ patch bundle |
| Native GAS DataEntry | ย้ายหรือปิด RPC เก่า ไม่มี unauthenticated fallback |

สร้าง `recording-client` แยกจาก public-read/runtime ก่อน เพื่อลด blast radius
ไม่แก้ cache-bust/read API/UI normalization ในรอบเดียวกับ auth migration

สถานะฟอร์ม: draft -> saving -> confirmed / rejected / pending / unknown
แสดงสำเร็จ/ล้างฟอร์มเมื่อ receipt ตรง requestId/hash และ status confirmed เท่านั้น
Timeout เก็บ draft และ query status โดย requestId เดิม; ห้าม retry ด้วย ID ใหม่
Logout/expiry ไม่ทิ้ง draft และไม่ให้คนถัดไปส่ง operation ของบัญชีเดิม
Successful empty feed/delete ห้ามฟื้น record จาก stale cache

หน้า writer เก่าบน Pages ต้อง redirect ไป Portal หรือเป็น read-only ตามอนุมัติ
ไม่ปล่อยปุ่มที่แสดง success แต่ใช้ protocol เก่า หากยังไม่มี 3D source ต้องหยุด
cutover หรืออนุมัติปิด layout writes ชั่วคราวอย่างชัดเจน

ผ่านเมื่อ: ไม่เหลือ caller ที่ถือ queued/opaque response เป็น confirmed save

### F. Integration และ staging acceptance

- รัน baseline 38 tests และเพิ่ม auth/envelope/receipt/recovery/permission tests
- Mock ทุก Google write ใน local/browser tests; integration writes เฉพาะ sandbox
- ทดสอบบัญชีจริง: allowed editor, wrong line, approver, anonymous, revoked
- Test retry/double click/concurrency/crash/receipt lookup ของคนอื่น/CSRF
- ตรวจ Sheet เดิมที่มี formulas/metadata พร้อม schema migration dry-run
- เปรียบเทียบก่อน/หลัง 7 lines, A/B, target, filter, refresh, last-good, error/empty
- ตรวจ read JSON ไม่เผย actor/audit metadata; ตรวจ quotas/limits/log redaction
- ตรวจ public Pages allowlist ยังไม่ส่ง backend secrets/receipt/config ออกสู่เว็บ
- เตรียม secure read-only GAS fallback และทดลอง rollback ใน sandbox

ผ่านเมื่อ: มี evidence local + staging ครบ; mock PoC อย่างเดียวไม่ถือว่าผ่าน

### G. Production cutover แบบหยุดเขียนสั้น ๆ

1. เจ้าของอนุมัติ release map, backup, migrations และช่วงหยุดการเขียน
2. Deploy Portal/BFF production โดย writes ยังปิด; ตรวจ auth/permissions/health
3. หยุด writers/triggers ที่เกี่ยวข้อง; backup ล่าสุดและ reconcile pending operations
4. Apply additive schema migration ที่ผ่าน dry-run; ไม่ rewrite ประวัติ/ค่าผลผลิต
5. สร้าง versioned secure GAS release และ update active deployment เพื่อคง read URL
6. Update legacy URLs ที่ยังต้องอ่านให้ secure/read-only หรือ archive ตาม inventory
7. ตรวจ public reads/target/identity และ unsigned denial โดยใช้ test ที่ไม่เขียน
8. เปิด Portal ให้ approved pilot users ก่อน แล้วตรวจ receipts/audit ที่อนุมัติ
9. เปิด users ที่เหลือเมื่อ pilot ผ่าน; เฝ้าดู unknown/conflict/quota/read errors
10. บันทึก Git SHA, GAS deployment/version, BFF release, Pages build และ evidence

ห้ามเปิด insecure old writes เป็น compatibility fallback
ไม่สลับ GAS source ปัจจุบันขึ้น production ตรง ๆ ก่อนจบ B-F

## 6. Release และ rollback

แยก commit ตาม A-G; ไม่รวม auth, schema migration, frontend และ deployment
เป็น commit/คำสั่งเดียว แยกสถานะ source ready / staging passed / deployed live

ทางเร่งปิดความเสี่ยงก่อน Portal พร้อม: เสนอ secure read-only GAS release
ที่มี route/target fixes และปิดทุก write/RPC/legacy bypass แต่ต้องอนุมัติหยุด
การบันทึกก่อน ไม่ถือว่าเป็น full auth/receipt release

หาก cutover ผิด:

1. ปิด writes ก่อน คง reads และ draft; reconcile unknown operations
2. ใช้ secure read-only fallback ไม่ย้อนกลับ GAS ที่เปิด unauthenticated writes
3. เก็บ metadata/receipt/intent แม้ rollback application; ไม่ย้อน schema จนข้อมูลหาย
4. ไม่สร้าง requestId ใหม่เพื่อส่งรายการ unknown ซ้ำ
5. ตรวจ Target skin ยังเป็น 120 และ public read identities ยังตรง

## 7. เกณฑ์ปิดงาน

- ไม่มี unauthenticated mutation ทั้ง active/legacy deployment และ RPC
- ทุก writer ยืนยันผลด้วย receipt ของ operation จริง
- Retry/concurrency/recovery/revision tests ผ่านบน sandbox จริง
- Public homepage ไม่ต้อง login และไม่มี auth requests เพิ่มใน refresh
- Live release map/backup/secure rollback และการตรวจรับของเจ้าของครบ

จนกว่าจะผ่านทั้งหมด ต้องรายงานว่า backend remediation ยังไม่เสร็จสมบูรณ์

## 8. เอกสารอ้างอิง

- [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect): server verification ของ token/identity
- [Google Session](https://developers.google.com/apps-script/reference/base/session): active principal อาจว่าง; effective owner ไม่ใช่ผู้เรียก
- [Google ContentService](https://developers.google.com/apps-script/guides/content): redirect ไป script.googleusercontent.com
- [Google LockService](https://developers.google.com/apps-script/reference/lock/lock-service): script-scoped concurrency lock
- [Google Deployments](https://developers.google.com/apps-script/concepts/deployments): versioned deployment แยกจาก source/head
- [OWASP Session](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): cookie/session storage และ lifecycle
- [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html): CSRF protection

Architecture, receipt recovery, staging gates และ cutover sequence เป็นข้อเสนอ
สำหรับ repository นี้ ไม่ใช่คุณสมบัติที่ GAS ทำให้โดยอัตโนมัติ
