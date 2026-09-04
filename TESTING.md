# Shift Zero — Part 9: Verification Pass

End-to-end test script for the multi-tenant redesign (Parts 1–8). Run this
once after `npm install` in both `backend/` and `frontend/`, with `.env`
filled in (`MONGODB_URI`, `JWT_SECRET`, `EMAIL_USER`/`EMAIL_PASS`, `FRONTEND_URL`).

Use two real inboxes you control (or two aliases like `you+orgA@gmail.com`
and `you+orgB@gmail.com`) so you can see the invite/notification emails.

---

## 1. Two orgs register, fully isolated from the first request

1. Start backend (`node server.js`) and frontend (`npm run dev`).
2. On the landing page, choose **Register org** → fill Organization name
   `Org A`, your name, `admin-a@...`, a password → submit.
   - ✅ Lands straight in the dashboard as `admin`, sidebar shows **Org A**
     under the logo/breadcrumb, zones list is empty.
3. Log out. Register a second org: `Org B`, `admin-b@...`.
   - ✅ Lands as `admin` of **Org B**, with an *independent* empty zone list —
     nothing from Org A is visible.
4. In Mongo (or via `GET /api/companies` while logged in as either admin —
   should 403) confirm two separate `Company` documents exist and every
   `User`/`Zone` created later carries the matching `companyId`.

## 2. Admin creates zones for their own industry (Part 7)

1. As Org A admin, open **Zones** → **+ CREATE ZONE**.
2. Create zone `Loading Dock` with mode **manual**, no metrics.
3. Create a second zone `Cold Storage` with mode **simulated**, metrics:
   - key `tempC`, label `Temperature`, unit `°C`, warn `4`, crit `8`
   - key `humidity`, label `Humidity`, unit `%`, warn `70`, crit `85`
4. ✅ Both zones appear in the Zones list and immediately show up on
   **Dashboard** and **Zone Map** — `Cold Storage` starts producing live
   readings within ~5s (simulated), `Loading Dock` stays at 0%/no data
   until someone submits a status (manual).
5. Edit `Loading Dock` → add a metric `noiseDb` → save → confirm the edit
   persists (reload the page) and the Dashboard card now shows a `NOISE`
   tile once a reading exists.
6. Delete `Cold Storage` → confirm it disappears from Dashboard/Map/Zones
   list, but a `curl {{BASE}}/api/history/Cold Storage` style lookup shows
   its historical `SensorReading`s are still in the DB (soft-delete, not a
   destructive delete).

## 3. Invite → accept → notify flow (Parts 1–2)

1. As Org A admin, go to **Team** → **Add Team Member**: name `Operator A`,
   email you control, role `operator` → submit.
   - ✅ Response shows "Invite sent... credentials emailed."
   - ✅ The inbox receives a "You're invited to join ShiftZero" email with a
     temp password.
   - ✅ Team tab shows `Operator A` with status **INVITE PENDING**.
2. Open an incognito window, go to **Login with email**, sign in with that
   temp password.
   - ✅ Logs in successfully, lands in Org A's dashboard (not Org B's).
   - ✅ Admin's inbox receives a "✅ Operator A accepted your ShiftZero
     invite" email.
   - ✅ Team tab (refresh) now shows `Operator A` as **OPERATOR**, no longer
     pending.
3. Repeat steps 1–2 once for Org B with a different operator email.

## 4. Cross-org isolation (the core requirement)

With **Operator A** (Org A) logged in in one window and **Operator B**
(Org B) logged in in another:

1. **Team tab**: Operator A sees only Org A's roster (admin-a, Operator A —
   never admin-b or Operator B). Same for B, reversed.
2. **Zones / Dashboard / Map**: Operator A never sees `Cold Storage`-style
   zones created under Org B, and vice versa.
3. **Alerts / Handover / Permits / Shifts**: submit a handover note or issue
   a permit as Org A → confirm it never appears in Org B's Alerts/Permits
   tab, and the real-time Socket.IO push (`stateUpdate`, `alert`,
   `permitsUpdate`) only reaches Org A's connected browser (check the other
   tab's network/console — no event received).
4. **Direct API probe** (optional, sharper test): copy Org B's JWT from
   localStorage, call `GET {{BASE}}/api/zones/<Org A zone id>/status` with
   it → expect `404 Zone not found` (not data leakage), because every zone
   route filters by `companyId` from the token, not just the URL param.
5. **Super admin** (only the very first user ever created on the whole
   deployment) → **Admin Panel → Companies** shows both Org A and Org B with
   user counts; a regular Org A/B admin hitting `GET /api/companies`
   directly gets `403 Super admin only`.

## 5. Mode toggle: simulated vs manual (Parts 3–4)

1. As Org A admin, edit `Loading Dock` → change mode to **simulated** →
   save. Within ~5s it starts producing synthetic readings on its own.
2. Change it back to **manual** → save. Confirm the auto-generated ticks
   stop (no new `SensorReading` with `source: 'simulated'` appears for that
   zone after the switch — only ones you submit manually).

## 6. Team member submits zone status during their shift (Parts 3, 8)

1. As Org A admin, go to **Shift Roster** → assign `Operator A` to
   `Loading Dock` for a window covering *now* (e.g. start = 5 min ago,
   end = 2 hours from now).
2. As Operator A, open **Update Status**.
   - ✅ `Loading Dock` appears in the zone dropdown (only zones they're
     currently on-shift for — if they weren't rostered, this tab shows
     "You're not currently on shift for any zone").
   - Set status **WARNING**, fill `noiseDb` = `88`, note "compressor is
     loud today" → submit.
   - ✅ "Status updated ✓" message; within a few seconds the Dashboard zone
     card for `Loading Dock` reflects the new risk/metric and Org A's
     Alerts tab shows an alert if the mismatch/threshold logic fires.
3. As Operator A, try `POST /api/zones/<Cold Storage id>/status` directly
   (e.g. via curl with their token) for a zone they have **no active shift**
   on → expect `403 You can only update this zone during your assigned
   shift.`
4. As admin, submit a status update for any zone with no active shift
   requirement → should succeed (admins can override anytime).

## 7. Regression check on generic (non-steel-plant) zones

Since Parts 7–8 replace the hardcoded gas/temp UI with metric-driven
rendering, sanity-check a zone with **zero** configured metrics still works
end to end:

1. Create zone `Reception Desk`, mode manual, no metrics.
2. Dashboard card shows a `MODE: MANUAL` tile instead of blank/`undefined`
   sensor tiles, and RISK stays at the flat value from whatever status label
   is submitted.
3. Submit a status of **CRITICAL** with no metrics via **Update Status** →
   confirm the zone card, modal, and Zone Map all update without any JS
   console errors (no more `z.sensor.gasPpm is undefined` style crashes).

## 8. Reports stay scoped

1. As Org A admin, download **PDF Report** and **CSV Audit** from the
   Dashboard.
   - ✅ PDF header shows "Org A" (not a hardcoded plant name), and every
     handover/alert/permit row belongs to Org A only.
2. Repeat as Org B admin — confirm the two reports never share a row.

---

### Pass criteria
All checkboxes above hold **and** no browser console errors appear while
navigating every tab as both an `admin` and an `operator` in both
organizations. If anything fails, note which numbered step and paste the
console/network error — that pinpoints whether it's a backend scoping bug
or a frontend rendering assumption.
