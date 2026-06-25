# Shift Zero
### Predicting Industrial Accidents Before the Sensors Do
**ET AI Hackathon 2.0 — Problem Statement 1: AI-Powered Industrial Safety Intelligence for Zero-Harm Operations**

## The Problem
On 23 Jan 2025, eight workers died in an explosion at the coke oven battery of Visakhapatnam Steel Plant — a facility with working gas detectors, permit-to-work systems, and SCADA. Investigations found the warning signals existed. Nobody connected them to a decision in time.

This is not a sensors problem. It's an *intelligence* problem.

## The Insight
Most industrial near-misses are verbally downplayed before they're officially flagged — a documented safety phenomenon called **normalization of deviance**. A shift supervisor says *"gas thoda high tha but sab normal hai"* hours before instruments confirm a real escalation.

**Shift Zero treats human language as a primary safety sensor.** It scores shift-handover notes for risk-minimizing language, compares that against real sensor trend velocity, and raises an alert the moment words and machines disagree — the **Verbal-Sensor Mismatch Score**.

## Architecture
```
[Shift Handover Note] --> [NLP Risk Scorer] --\
                                                >--> [Mismatch Engine] --> [Alert + Dashboard]
[Plant Sensors (simulated)] --> [Trend Analyzer] --/
```

## Tech Stack
- **Frontend:** React, Socket.IO client
- **Backend:** Node.js, Express, Socket.IO (real-time alerts)
- **AI Layer:** Rule-based risk-language classifier (demo) — designed to swap in an LLM-based classifier for production
- **Data:** Synthetic plant sensor simulator (gas/temp/pressure) calibrated to realistic industrial ranges

## Running Locally

### Backend
```bash
cd backend
npm install
node server.js
# runs on http://localhost:5000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
# runs on http://localhost:5173
```

## Demo Flow
1. Dashboard shows 4 plant zones with live simulated sensor data.
2. `CokeOvenBattery-3` is set to an "escalating" sensor trend (mirrors the Vizag scenario).
3. Submit a calm-sounding handover note for that zone (e.g. *"sab normal hai, routine hai"*).
4. Watch the Mismatch Score spike and an alert fire — because the words say calm, but the sensor trend says otherwise.

## Roadmap
- Real SCADA/IoT integration via OPC-UA
- Voice-to-text pipeline for verbal handovers
- Permit-to-work cross-referencing (hot work near elevated gas zones)
- OISD / Factory Act / DGMS compliance reporting module

## Author
Sakshi Mittal — solo build (Product, AI/NLP, Full-stack)
