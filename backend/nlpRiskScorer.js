// LLM-based risk-language classifier using the FREE Google Gemini API.
// Scores a shift-handover note for how much it ACKNOWLEDGES vs DOWNPLAYS risk.
// Falls back to the rule-based scorer if the API call fails (e.g. no key set,
// offline demo, or rate limit) so the live dashboard never breaks mid-pitch.

const CALMING_PHRASES = [
  'sab normal', 'theek hai', 'all clear', 'no issue', 'nothing major',
  'minor', 'thoda high tha but', 'usually like this', 'manageable',
  'will check later', 'not urgent', 'routine', 'as usual'
];
const ALARM_PHRASES = [
  'urgent', 'immediate', 'evacuate', 'critical', 'dangerous', 'spike',
  'unsafe', 'escalating', 'failure', 'leak confirmed', 'shut down'
];

function fallbackScore(text) {
  const lower = text.toLowerCase();
  let calmHits = CALMING_PHRASES.filter(p => lower.includes(p)).length;
  let alarmHits = ALARM_PHRASES.filter(p => lower.includes(p)).length;
  let score = 0.5 + (alarmHits * 0.2) - (calmHits * 0.2);
  return Math.min(1, Math.max(0, score));
}

const SYSTEM_PROMPT = `You are a safety-language classifier for industrial shift-handover notes
(often Hindi-English code-mixed). Given a note, output ONLY a single decimal number between
0 and 1 representing how much the note's LANGUAGE acknowledges risk:
- 0.0-0.3 = the note downplays, normalizes, or minimizes a potential hazard
  (e.g. "sab normal hai", "minor, will check later", "nothing major")
- 0.4-0.6 = neutral / routine / no strong signal either way
- 0.7-1.0 = the note clearly flags urgency, danger, or escalation
  (e.g. "critical", "evacuate", "confirmed leak")
Output nothing except the number. No words, no explanation.`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Reads the Retry-After header if Gemini sends one, otherwise uses exponential
// backoff with jitter. Caps total wait so the live demo never hangs too long.
async function callGeminiWithRetry(url, body, maxRetries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (response.ok) return response;

    if (response.status === 429) {
      lastErr = new Error(`API error: 429 (attempt ${attempt + 1}/${maxRetries + 1})`);
      if (attempt < maxRetries) {
        const retryAfterHeader = response.headers.get('retry-after');
        const waitMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : (1000 * Math.pow(2, attempt)) + Math.random() * 300; // exp backoff + jitter
        console.warn(`Gemini 429 — retrying in ${Math.round(waitMs)}ms`);
        await sleep(waitMs);
        continue;
      }
    } else {
      lastErr = new Error(`API error: ${response.status}`);
    }
    break;
  }
  throw lastErr;
}

async function tryWithKey(apiKey, text) {
  const response = await callGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\nNote: "${text}"` }] }],
      generationConfig: { maxOutputTokens: 10, temperature: 0.1 }
    }
  );
  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  const score = parseFloat(raw);
  if (isNaN(score) || score < 0 || score > 1) throw new Error(`Bad model output: ${raw}`);
  return score;
}

async function scoreHandoverText(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  const backupKey = process.env.GEMINI_API_KEY_BACKUP;

  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set — using fallback rule-based scorer.');
    return fallbackScore(text);
  }

  try {
    return await tryWithKey(apiKey, text);
  } catch (err) {
    console.error('Primary Gemini key failed:', err.message);
    if (backupKey) {
      try {
        console.warn('Retrying with backup Gemini key...');
        return await tryWithKey(backupKey, text);
      } catch (backupErr) {
        console.error('Backup Gemini key also failed, falling back to rule-based scorer:', backupErr.message);
      }
    }
    return fallbackScore(text);
  }
}

module.exports = { scoreHandoverText };