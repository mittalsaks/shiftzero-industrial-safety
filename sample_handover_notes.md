# Sample Handover Notes for Demo / Testing

Use these in the "Submit Shift-Handover Note" box on the dashboard.

## 1. Calm language + escalating sensor (triggers HIGH mismatch alert)
Zone: CokeOvenBattery-3
"Gas level thoda high tha but sab normal hai, routine hai. Nothing major, will check later."

## 2. Alarmed language + escalating sensor (low mismatch — words match reality)
Zone: CokeOvenBattery-3
"Gas reading is critical and escalating, immediate evacuation recommended. Confirmed leak."

## 3. Calm language + normal sensor (no mismatch — genuinely fine)
Zone: BlastFurnace-1
"All clear, everything as usual, no issues to report."

## 4. Mild downplay + normal sensor (low-moderate mismatch)
Zone: RollingMill-2
"Minor fluctuation, manageable, nothing urgent."

---
### Why this matters for the demo
Scenario 1 is the core story: it reproduces the exact pattern investigators found at
Visakhapatnam Steel Plant — sensors showing risk, human language downplaying it.
Run scenario 1 live during the pitch to show the Mismatch Score spike and alert fire
in real time.
