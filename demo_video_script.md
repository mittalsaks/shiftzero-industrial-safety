# Shift Zero — Demo Video Script (3:30 target)

## [0:00–0:25] Hook — The Real Incident
"On 23rd January 2025, eight workers died when entrapped gases triggered an explosion
at Visakhapatnam Steel Plant's coke oven battery. The plant had gas detectors,
permit-to-work systems, SCADA. Investigators found the warning signals existed.
They just never reached a decision in time. That gap — data present, but unacted upon
— is the problem I built Shift Zero to close."
(Show: PDF/news headline screenshot of the incident as a visual backdrop)

## [0:25–0:55] The Insight
"Most safety platforms fuse sensor data. But the first sign of trouble in a real plant
usually isn't a sensor — it's a shift-handover note where someone downplays a risk:
'gas thoda high tha but sab normal hai.' Safety researchers call this normalization
of deviance — and it shows up before Bhopal, before Chernobyl, before Vizag.
Shift Zero treats that human language as a sensor in its own right."
(Show: simple animated diagram — handover text + sensor feed converging into "Mismatch Engine")

## [0:55–2:30] Live Demo
1. Open dashboard — show 4 plant zones with live sensor readings.
2. Point out CokeOvenBattery-3 sensor trend climbing (gas ppm, risk level rising).
3. Open the handover form, select CokeOvenBattery-3.
4. Type/paste: "Gas level thoda high tha but sab normal hai, routine hai."
5. Submit — show Mismatch Score spike on screen (e.g. 0 → 68).
6. Show the alert firing in the Live Alerts feed with the quote + sensor evidence attached.
7. Quickly show a contrasting example: submit an alarmed note for the same zone
   ("gas reading critical, evacuate") — show mismatch stays LOW because words now
   match the sensor reality. This proves the system isn't just flagging keywords —
   it's catching the *gap* between language and instruments.

## [2:30–3:00] Architecture in 20 seconds
"Under the hood: a React dashboard, a Node/Express backend with real-time sockets,
a rule-based NLP risk classifier on handover text — built to be swapped for an LLM
in production — and a sensor trend module. No new hardware. It runs on whatever
communication channel a plant already uses: text, WhatsApp, voice-to-text."

## [3:00–3:30] Close — Why It Matters
"This isn't another sensor dashboard. It's the missing layer between what a plant's
instruments already know and what a human is willing to say out loud before it's too
late. Shift Zero — predicting accidents before the sensors do."

---
## Recording Tips
- Screen-record the dashboard at 1080p, OBS Studio (free) or Windows/Mac built-in recorder.
- Record voiceover separately if camera-shy; sync in CapCut (free) or DaVinci Resolve (free).
- Keep energy high on the hook (0:00-0:25) — judges decide a lot of their impression there.
- Don't read this script word-for-word on camera — say it in your own words so it sounds natural.
