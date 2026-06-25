// RAG retrieval layer: given a mismatch trigger (handover text + zone context),
// retrieve the most relevant historical/synthetic incident records and use
// the Gemini API to generate a grounded, actionable recommendation citing them.
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
    return 'No closely matching historical pattern found. Escalate to safety officer for manual review given the verbal-sensor mismatch.';
  }
  const top = matched[0];
  return `This pattern resembles "${top.title}" (${top.id}). Recommended action: ${top.recommendedAction}`;
}

const RECOMMENDATION_SYSTEM_PROMPT = `You are a safety recommendation assistant for an industrial plant.
You are given: a zone name, a shift-handover note that shows a verbal-sensor mismatch (the note sounds calm
but live sensors show escalating risk), and 1-2 retrieved historical/incident records that resemble this
pattern. Write a short, concrete, actionable recommendation (2-3 sentences max) for the on-duty safety
officer. Reference the matched incident ID(s) explicitly. Be specific and operational, not generic.
Do not add disclaimers or hedge excessively — this is for a control-room alert, not a report.`;

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

async function generateRecommendation(zone, handoverText, matchedIncidents) {
  const apiKey = process.env.GEMINI_API_KEY;
  const backupKey = process.env.GEMINI_API_KEY_BACKUP;

  if (!apiKey || matchedIncidents.length === 0) {
    return fallbackRecommendation(zone, handoverText, matchedIncidents);
  }

  const context = matchedIncidents
    .map(inc => `[${inc.id}] ${inc.title}\nSummary: ${inc.summary}\nRegulatory ref: ${inc.regulatoryReference}\nKnown recommended action: ${inc.recommendedAction}`)
    .join('\n\n');

  const userMessage = `${RECOMMENDATION_SYSTEM_PROMPT}\n\nZone: ${zone}\nHandover note: "${handoverText}"\n\nRetrieved matching incidents:\n${context}\n\nWrite a short, concrete, actionable recommendation (2-3 sentences) for the on-duty safety officer. Reference the matched incident ID(s) explicitly. Be specific and operational.`;

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

async function getIncidentBackedRecommendation(zone, handoverText) {
  const matched = retrieveTopIncidents(handoverText + ' ' + zone, 2);
  const recommendation = await generateRecommendation(zone, handoverText, matched);
  return {
    matchedIncidents: matched.map(m => ({ id: m.id, title: m.title, regulatoryReference: m.regulatoryReference })),
    recommendation
  };
}

module.exports = { getIncidentBackedRecommendation, retrieveTopIncidents };