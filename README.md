<div align="center">

<img src="./frontend/public/Icon.png" alt="Shift Zero Logo" width="280"/>

### AI-Powered Industrial Safety Intelligence Platform
**Verbal-Sensor Mismatch Intelligence Platform**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-shift--zero--frontend.onrender.com-00C896?style=for-the-badge)](https://shift-zero-frontend.onrender.com)

<br/>

![Node](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js)
![React](https://img.shields.io/badge/React-Vite-61DAFB?style=flat-square&logo=react)
![Gemini](https://img.shields.io/badge/Gemini%20API-AI%20Engine-4285F4?style=flat-square&logo=googlegemini)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb)
![Socket.IO](https://img.shields.io/badge/Socket.IO-Real--time-010101?style=flat-square&logo=socket.io)

</div>

---

## 🚨 The Problem

> **6,500+ fatal industrial accidents** occur in India every year ([DGFASLI](https://dgfasli.gov.in)).
> A disproportionate number happen **within 2 hours of shift changeover.**

The root cause isn't always equipment failure — it's a **communication failure**:

> *"Sab normal hai, routine hai, will check later..."*

The outgoing supervisor says **everything is fine**, while the **sensors are already screaming otherwise.**

**Shift Zero exists to close this exact gap** — between what humans *say* and what machines *measure* — in the critical 10-minute window when a fatal accident can be prevented.

---

## 💡 What Shift Zero Does

### Core Innovation: Verbal-Sensor Mismatch Detection

```
Supervisor writes handover note
        │
        ▼
Gemini AI scores risk-language (0 → 1)
        │
        ▼
Compared against LIVE sensor risk score for that zone
        │
        ▼
   Note calm + Sensors escalating?
        │
   ┌────┴─────┐
   │   YES    │   →  🔴 MISMATCH ALERT fired
   └────┬─────┘
        ▼
RAG engine retrieves similar past incidents
        │
        ▼
Gemini generates a specific, actionable recommendation
```

In parallel, **Permit-to-Work data is cross-checked against live sensors** — e.g. a Hot Work permit active in a zone where gas concentration has crossed a danger threshold triggers an **immediate Permit Conflict alert**, citing the relevant OISD standard.

---

## 🧩 Features

| Feature | Description |
|---|---|
| 🔴 **Verbal-Sensor Mismatch Detection** | NLP risk-scoring of handover notes cross-checked against live sensor risk |
| ⚡ **Real-time Socket Updates** | Sensor data streamed every 5 seconds via Socket.IO |
| 📈 **Sparkline Trend Charts** | Per-zone gas concentration & risk-score history |
| ⏱ **Time-to-Critical Prediction** | "CRITICAL IN ~1min" — predicted from live trend velocity |
| 🔒 **Permit-to-Work Management** | Issue, track, and close permits with automatic conflict detection |
| 🗺 **Animated Plant Map** | Live geospatial view with pipeline/feed-line flow and zone risk overlays |
| 🤖 **RAG Incident Engine** | TF-IDF retrieval over a synthetic incident corpus + Gemini-generated recommendations |
| 📋 **Incident Corpus** | OISD / DGFASLI / Vizag-pattern synthetic incident library for grounding AI advice |
| 📋 **Incident Corpus** | OISD / DGFASLI / Vizag-pattern synthetic incident library for grounding AI advice |
| 📄 **PDF Shift Reports** | One-click downloadable shift report — alerts, handover log, and permit status, generated server-side with PDFKit |
| 🔍 **Audit Trail** | Every handover note is permanently linked to the submitting user (name, email, user ID) for accountability |
| 📧 **Dynamic Critical-Alert Emails** | On a CRITICAL mismatch, an email is sent automatically to all current admins — fetched live from the database, never hardcoded |
| 🔐 **Email-Locked Invites** | Invite links are bound to a specific email address at creation time — even if a link leaks, only the intended recipient can use it |
---

## 🏗 System Architecture

```mermaid
flowchart TB
    subgraph CLIENT["🖥️ Frontend — React + Vite"]
        UI[Dashboard / Handover / Alerts / Permits / Plant Map]
        SOCKETC[Socket.IO Client]
        UI <--> SOCKETC
    end

    subgraph SERVER["⚙️ Backend — Node.js + Express"]
        API[REST API Layer]
        SOCKETS[Socket.IO Server]
        SIM[Sensor Simulation Engine]
        NLP[Gemini NLP Risk Scorer]
        RAG[RAG Engine — TF-IDF Retrieval]
        PERMIT[Permit Conflict Checker]

        API --> NLP
        API --> PERMIT
        NLP --> RAG
        SIM --> SOCKETS
        PERMIT --> SOCKETS
    end

    subgraph EXTERNAL["☁️ External Services"]
        GEMINI[(Gemini API)]
        MONGO[(MongoDB Atlas)]
    end

    SOCKETC <===>|live sensor feed, every 5s| SOCKETS
    UI -->|submit handover note| API
    UI -->|issue / close permit| API
    NLP <-->|risk scoring + recommendations| GEMINI
    API <-->|persist zones, notes, permits, incidents| MONGO
    RAG -->|incident corpus match| MONGO

    style CLIENT fill:#0d1117,stroke:#00C896,color:#ffffff
    style SERVER fill:#0d1117,stroke:#4285F4,color:#ffffff
    style EXTERNAL fill:#0d1117,stroke:#f0883e,color:#ffffff
```

### Mismatch Detection Flow

```mermaid
sequenceDiagram
    participant S as Supervisor
    participant F as Frontend
    participant B as Backend
    participant G as Gemini API
    participant R as RAG / MongoDB

    S->>F: Submit handover note ("sab normal hai...")
    F->>B: POST /api/handover
    B->>G: Score note risk-language (0–1)
    G-->>B: Risk score = LOW
    B->>B: Compare vs live sensor risk = HIGH
    Note over B: Mismatch detected!
    B->>R: Query similar past incidents (TF-IDF)
    R-->>B: Top matching incident(s)
    B->>G: Generate recommendation grounded in incident
    G-->>B: Actionable recommendation
    B-->>F: Mismatch alert + recommendation
    F-->>S: 🔴 Alert displayed in real time
```
---

## 🔐 Security Design

Shift Zero treats two common SaaS security gaps as first-class problems, not afterthoughts:

**1. No hardcoded alert recipients.**
Early versions of critical-alert emails pointed at a fixed address in `.env`. This was replaced with a live query — every time a CRITICAL mismatch fires, the backend pulls the current list of `admin` / `super_admin` users directly from MongoDB and emails all of them. Adding, removing, or promoting an admin instantly changes who gets alerted — no redeploy required.

**2. Invite links are single-recipient, not "anyone with the link."**
Every invite is created against a specific email address (`forEmail`). When a user signs in with Google, their verified email is checked against the invite before account creation — a leaked or forwarded invite link is useless to anyone but the intended recipient. Invites also remain single-use and expire after 24 hours.

```mermaid
flowchart LR
    A[Admin creates invite] -->|forEmail: user@company.com| B[(Invite stored in DB)]
    B --> C{User signs in with Google}
    C -->|email matches forEmail| D[✅ Account created]
    C -->|email does not match| E[❌ INVITE_EMAIL_MISMATCH]
```

---
---

## 🛠 Tech Stack

**Backend**
- Node.js + Express
- Socket.IO — real-time sensor broadcast
- Gemini API — NLP risk scoring + RAG recommendations
- Natural — TF-IDF incident retrieval
- MongoDB Atlas — persistence

**Frontend**
- React + Vite
- Socket.IO client
- Pure SVG visualizations (no chart library)

**Deployment**
- Backend → Render
- Frontend → Render Static Site
- Database → MongoDB Atlas M0 (free tier)

---

## 📸 Product Walkthrough

> Replace the placeholder paths below with your screenshot files (e.g. place them in `/docs/screenshots/` in the repo and update paths). Suggested mapping based on the app's pages, in the order a user would naturally see them:

### 1. Landing Page
The entry point — branding, key stats (6,500+ fatal accidents/yr, <10min alert target, 4 live zones, real-time fusion), and Google login.

`![Landing Page](./docs/screenshots/landing-page.png)`

### 2. Live Operations Dashboard
Real-time view of all 4 zones (CokeOvenBattery-3, BlastFurnace-1, RollingMill-2, GasStorage-Yard) with gas/temp/risk readings, sparkline trends, time-to-critical predictions, and permit conflict badges.

`![Live Dashboard](./docs/screenshots/dashboard.png)`

### 3. Shift Handover
The core mismatch-detection interface — supervisor's current zone state vs. the handover note input box, with a sample note to try.

`![Shift Handover](./docs/screenshots/handover.png)`

### 4. Alert Feed
Live feed of all verbal-sensor mismatch alerts as they're detected (shown here in its "all clear" state).

`![Alert Feed](./docs/screenshots/alerts.png)`

### 5. Permit to Work
Active/closed permits list with the auto-detected permit conflict banner at the top, plus the "Issue New Permit" form.

`![Permit to Work](./docs/screenshots/permits.png)`

### 6. Plant Map
Animated geospatial view of the plant with pipeline/feed-line connections between zones and live per-zone risk %.

`![Plant Map](./docs/screenshots/plant-map.png)`

---

## 📐 Regulatory References

Shift Zero's alerts and recommendations are grounded in real Indian industrial safety standards:

- **OISD-STD-222** — Coke Oven Safety
- **OISD-STD-105** — Permit to Work systems
- **OISD-GDN-206** — Near-Miss Reporting
- **DGFASLI** — Fatal accident statistics
- **Factory Act, Section 7A** — Safety Officer duties

---

## 🌐 Live Demo

🔗 **[shift-zero-frontend.onrender.com](https://shift-zero-frontend.onrender.com)**

**Demo flow:**
1. Login → Dashboard (live sensor data streaming)
2. Go to **Handover** → Select `CokeOvenBattery-3`
3. Type: *"Gas level thoda high tha but sab normal hai"*
4. Submit → Watch the mismatch alert fire with an AI-generated recommendation
5. Go to **Dashboard** → Click **Download Shift Report PDF**
6. Go to **Admin Panel → Invites** → generate an invite for a specific email, then try opening it with a different account to see the email-lock in action

### Tested scenarios (DGFASLI-pattern validation)

| Scenario | Note style | Expected result |
|---|---|---|
| Calm language, escalating sensor | *"Gas level thoda fluctuate hua tha lekin ab stable hai, routine maintenance chal rahi hai"* | High mismatch score, alert fired |
| Honest critical reporting | *"Gas levels critically elevated at 85 ppm, exceeding OISD-116 threshold, immediate evacuation recommended"* | Low mismatch score — system correctly recognizes accurate self-reporting |
| Active permit + risky language | *"Welding work in progress, gas readings slightly high but team says manageable"* | Critical mismatch **and** Hot Work permit conflict flagged against OISD-STD-105 |
| Normal zone, calm language | Any routine note on a non-escalating zone | No mismatch, no false alert — confirms the system doesn't fire on keywords alone |

This table demonstrates that mismatch detection responds to the *gap between language and sensor data*, not to specific words — an honest critical report scores lower risk than a falsely calm one over real danger.

---

## 💻 Local Setup

### Backend
```bash
cd backend
npm install
cp .env.example .env
node server.js
```

Required environment variables:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Gemini API key for NLP risk scoring + recommendations |
| `JWT_SECRET` | Secret for signing session tokens |
| `EMAIL_USER` / `EMAIL_PASS` | Sender credentials for critical-alert emails (recipients are *not* configured here — they're pulled from the database at runtime) |
| `FRONTEND_URL` | Used to build invite links |

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

<div align="center">

*Closing the gap between what humans say and what sensors know — before it becomes a fatality.*

</div>