// RAG retrieval layer: given a mismatch trigger (handover text + zone context),
// retrieve the most relevant historical/synthetic incident records and use
// the Gemini API to generate a grounded, actionable recommendation citing them.
//
// PART 5 — genericized. Previously written assuming an "industrial plant" and
// referencing steel-plant-specific incident language directly. Now works for
// any zone in any industry: the prompt no longer assumes a plant/factory
// setting, and takes an optional `zoneContext` (e.g. the zone's configured
// metric labels) so the recommendation can reference the actual metrics an
// admin chose to track instead of assuming gas/temperature.
//
// Retrieval step uses TF-IDF cosine similarity (via `natural`) — fast, free,
// runs entirely locally, no embedding API call needed for retrieval itself.
// Generation step calls the Gemini API, with a non-LLM fallback so the demo
// never breaks, and retry-with-backoff so transient 429s self-heal.

const natural = require('natural');
const TfIdf = natural.TfIdf;
const { incidents } = require('./incidentCorpus');

const tfidf = new TfIdf();
incidents.forEach(inc => {
  tfidf.addDocument(`${inc.title} ${inc.summary} ${inc.tags.join(' ')}`);
});

function retrieveTopIncidents(queryText, topN = 2) {
  const scores = [];
  tfidf.tfidfs(queryText, (i, measure) => {
    scores.push({ index: i, score: measure });
  });
  scores.sort((a, b) => b.score - a.score);
  return scores
    .slice(0, topN)
    .filter(s => s.score > 0)
    .map(s => incidents[s.index]);
}

function fallbackRecommendation(zone, handoverText, matched) {
  if (matched.length === 0) {
    return 'No closely matching historical pattern found. Escalate to the on-duty supervisor for manual review given the status-vs-reading mismatch.';
  }
  const top = matched[0];
  return `This pattern resembles "${top.title}" (${top.id}). Recommended action: ${top.recommendedAction}`;
}

// Industry-agnostic system prompt. `zoneContext` (optional) is a short string
// like "tracked metrics: Gas (ppm), Temp (°C)" or "tracked metrics: Occupancy,
// Noise (dB)" built from the zone's own metricConfig, so the model grounds
// its recommendation in whatever that specific zone actually measures.
function buildSystemPrompt(zoneContext) {
  return `You are a safety/operations recommendation assistant used across many industries (manufacturing, warehousing, healthcare, construction, data centers, retail, and others).
You are given: a zone name${zoneContext ? ' (with its tracked metrics)' : ''}, a shift-handover note that shows a mismatch between what the note says and what the zone's readings/status actually indicate, and 1-2 retrieved incident records that resemble this pattern from other organizations.
Write a short, concrete, actionable recommendation (2-3 sentences max) for the on-duty supervisor or safety officer. Reference the matched incident ID(s) explicitly. Be specific and operational for THIS zone and industry — do not assume it is a factory, plant, or any single specific setting unless the zone name or metrics make that clear.
Do not add disclaimers or hedge excessively — this is for a live operational alert, not a report.`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
          : (1000 * Math.pow(2, attempt)) + Math.random() * 300;
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

async function tryWithKey(apiKey, userMessage) {
  const response = await callGeminiWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 200, temperature: 0.2 }
    }
  );
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response');
  return text;
}

async function generateRecommendation(zone, handoverText, matchedIncidents, zoneContext) {
  const apiKey = process.env.GEMINI_API_KEY;
  const backupKey = process.env.GEMINI_API_KEY_BACKUP;

  if (!apiKey || matchedIncidents.length === 0) {
    return fallbackRecommendation(zone, handoverText, matchedIncidents);
  }

  const context = matchedIncidents
    .map(inc => `[${inc.id}] ${inc.title}\nSummary: ${inc.summary}\nReference: ${inc.regulatoryReference}\nKnown recommended action: ${inc.recommendedAction}`)
    .join('\n\n');

  const userMessage = `${buildSystemPrompt(zoneContext)}\n\nZone: ${zone}${zoneContext ? `\nZone context: ${zoneContext}` : ''}\nHandover note: "${handoverText}"\n\nRetrieved matching incidents:\n${context}\n\nWrite a short, concrete, actionable recommendation (2-3 sentences) for the on-duty supervisor. Reference the matched incident ID(s) explicitly. Be specific and operational.`;

  try {
    return await tryWithKey(apiKey, userMessage);
  } catch (err) {
    console.error('Primary Gemini key failed:', err.message);
    if (backupKey) {
      try {
        console.warn('Retrying with backup Gemini key...');
        return await tryWithKey(backupKey, userMessage);
      } catch (backupErr) {
        console.error('Backup Gemini key also failed, using fallback:', backupErr.message);
      }
    }
    return fallbackRecommendation(zone, handoverText, matchedIncidents);
  }
}

// `zoneContext` is optional — pass a short human-readable string built from
// the zone's metricConfig (e.g. "tracked metrics: Gas (ppm), Temp (°C)") so
// the recommendation is grounded in what this specific zone measures. Callers
// that don't have it (or don't need it) can omit it entirely.
async function getIncidentBackedRecommendation(zone, handoverText, zoneContext = '') {
  const matched = retrieveTopIncidents(handoverText + ' ' + zone, 2);
  const recommendation = await generateRecommendation(zone, handoverText, matched, zoneContext);
  return {
    matchedIncidents: matched.map(m => ({ id: m.id, title: m.title, regulatoryReference: m.regulatoryReference })),
    recommendation
  };
}

module.exports = { getIncidentBackedRecommendation, retrieveTopIncidents };
