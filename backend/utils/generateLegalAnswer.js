require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { pipeline, env } = require('@xenova/transformers');
const { initDatabase } = require('./init_db');

// Setup local offline inference
env.allowLocalModels = true;
env.cacheDir = path.resolve(__dirname, '../models');

// Pluggable LLM configuration
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Load OpenRouter API keys from environment variables
const API_KEYS = Object.keys(process.env)
  .filter(k => /^OPENROUTER_API_KEY\d+$/i.test(k))
  .sort()
  .map(k => process.env[k])
  .filter(Boolean);

let currentKeyIndex = 0;
function getNextApiKey() {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

// 🛡️ WebGPU to CPU graceful fallback setup
let extractorPromise = (async () => {
  try {
    console.log('Trying WebGPU...');
    env.backends.onnx.deviceType = 'webgpu'; // Force GPU for AMD
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'webgpu' });
    console.log('✓ WebGPU available');
    return extractor;
  } catch (err) {
    console.log('WebGPU unavailable. Falling back to CPU.');
    env.backends.onnx.deviceType = 'cpu';
    return await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'cpu' });
  }
})();

// Helper to convert dynamic embedding formats to Float32Array
function toFloat32Array(embedding) {
  if (embedding instanceof Float32Array) return embedding;
  if (Array.isArray(embedding)) return new Float32Array(embedding);
  if (embedding && embedding.data) return new Float32Array(Array.from(embedding.data));
  
  // It's an object with string keys like {"0": -0.09, "1": 0.1}
  const len = Object.keys(embedding).length;
  const arr = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = embedding[i];
  }
  return arr;
}

// 🚀 Initialize Structured SQLite Database (v2)
const db = initDatabase();

// 🚀 Load vector cache once at startup (metadata stripped to save RAM)
const VECTORS_PATH = path.resolve(__dirname, '../data/parsed_laws_vectors.json');
if (!fs.existsSync(VECTORS_PATH)) {
  console.error('parsed_laws_vectors.json missing. Run your embedding script first.');
  process.exit(1);
}

console.log('Loading law vectors cache...');
const dbStart = Date.now();
const allVectorsRaw = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));
console.log(`Loaded ${allVectorsRaw.length} vectors in ${Date.now() - dbStart}ms. Preprocessing embeddings...`);

const prepStart = Date.now();
const allVectors = allVectorsRaw.map(entry => ({
  id: entry.id,
  embedding: toFloat32Array(entry.embedding)
}));
console.log(`Preprocessed embeddings cache in ${Date.now() - prepStart}ms. Memory optimized (metadata discarded from RAM).`);

// Map for quick vector lookup in memory
const vectorMap = new Map();
allVectors.forEach(v => {
  vectorMap.set(v.id, v.embedding);
});

// Optimized cosine similarity loop using typed arrays
function cosineSim(vecA, vecB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = vecA.length;
  for (let i = 0; i < len; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

async function fetchWithTimeout(url, options, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function getQueryEmbedding(query) {
  const extractor = await extractorPromise;
  const emb = await extractor(query, { pooling: 'mean', normalize: true });
  return toFloat32Array(emb.data);
}

function cleanLLMOutput(output) {
  return output.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\|.*?\|>/g, '').trim();
}

// 🤖 Direct Google Gemini API Call
async function callGemini(systemPrompt, userQuery) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: userQuery }]
        }
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.15
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${errText}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini response is empty or malformed: ${JSON.stringify(data)}`);
  }
  return text;
}

// 🤖 OpenRouter API Call
async function callOpenRouter(systemPrompt, userQuery) {
  if (API_KEYS.length === 0) {
    throw new Error('No OpenRouter API keys found! Add them in .env');
  }
  const models = [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemma-4-31b-it:free',
    'qwen/qwen3-coder:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'nousresearch/hermes-3-llama-3.1-405b:free',
    'openrouter/free',
    // Very cheap paid fallbacks (fractions of a cent) if free models are rate-limited
    'meta-llama/llama-3.2-3b-instruct',
    'google/gemini-2.5-flash',
    'qwen/qwen-2.5-7b-instruct'
  ];
  
  for (const model of models) {
    for (let k = 0; k < API_KEYS.length; k++) {
      const apiKey = getNextApiKey();
      try {
        const keyUsedIndex = (currentKeyIndex - 1 + API_KEYS.length) % API_KEYS.length;
        console.log(`[${new Date().toISOString()}] Trying OpenRouter model: ${model}, key index: ${keyUsedIndex}`);
        const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.15,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userQuery },
            ],
          }),
        });
        
        if (!res.ok) {
          const errText = await res.text();
          console.warn(`OpenRouter HTTP Error ${res.status} for ${model}: ${errText}`);
          continue;
        }
        
        const data = await res.json();
        const rawContent = data?.choices?.[0]?.message?.content || '';
        if (rawContent) {
          return rawContent;
        }
        if (data && data.error) {
          console.warn(`OpenRouter API error: ${JSON.stringify(data.error)}`);
        }
      } catch (err) {
        const keyUsedIndex = (currentKeyIndex - 1 + API_KEYS.length) % API_KEYS.length;
        console.warn(`OpenRouter ${model} failed on key index ${keyUsedIndex}: ${err.message}`);
      }
    }
  }
  throw new Error('All OpenRouter models/keys failed.');
}

async function generateLegalAnswer(userQuery, topK = 5) {
  console.log(`[${new Date().toISOString()}] Query: "${userQuery}"`);

  // 1. Vector generation
  const queryEmbedding = await getQueryEmbedding(userQuery);
  if (!queryEmbedding || !queryEmbedding.length) throw new Error('Failed to generate local embedding');

  // 2. Dense Vector Scan (Rank top 50 in memory)
  const vectorScores = allVectors.map(entry => ({
    id: entry.id,
    score: cosineSim(entry.embedding, queryEmbedding)
  }));
  
  const vectorRankings = vectorScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 50);

  // 3. SQLite FTS5 Sparse Keyword Search (Rank top 50 based on BM25)
  let ftsRankings = [];
  const cleanTerms = userQuery
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => `"${w}"`)
    .join(' OR ');

  if (cleanTerms) {
    try {
      const stmt = db.prepare(`
        SELECT id, bm25(laws_fts) as fts_score
        FROM laws_fts
        WHERE laws_fts MATCH ?
        ORDER BY fts_score
        LIMIT 50
      `);
      ftsRankings = stmt.all(cleanTerms);
    } catch (err) {
      console.warn(`FTS5 keyword search error: ${err.message}`);
    }
  }

  // 4. Reciprocal Rank Fusion (RRF) Merge
  const rrfScores = new Map();
  const k = 60; // standard constant for RRF

  // Process vector ranking positions
  vectorRankings.forEach((item, index) => {
    rrfScores.set(item.id, 1 / (k + index + 1));
  });

  // Process FTS5 keyword ranking positions and add to scores
  ftsRankings.forEach((item, index) => {
    const existingScore = rrfScores.get(item.id) || 0;
    rrfScores.set(item.id, existingScore + (1 / (k + index + 1)));
  });

  // Sort matched IDs based on fused RRF score
  const mergedRanking = Array.from(rrfScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20); // Retrieve top 20 candidates for heuristic reranking

  // 5. Hydrate Documents from SQLite DB, Apply Heuristics, & Deduplicate
  const selectStmt = db.prepare('SELECT id, law_name, law_code, chapter, title, content FROM laws WHERE id = ?');
  const hydrated = [];

  const queryLower = userQuery.toLowerCase();
  const isDocumentForgeryRelated = queryLower.includes('signature') || queryLower.includes('sign') || queryLower.includes('document');

  for (const [id, rrfScore] of mergedRanking) {
    const row = selectStmt.get(id);
    if (row) {
      // Calculate standard cosine similarity for UI visualization
      const emb = vectorMap.get(id);
      const scoreVal = emb ? cosineSim(emb, queryEmbedding) : 0;

      // Determine retriever type flags
      const isFts = ftsRankings.some(f => f.id === id);
      const isVector = vectorRankings.some(v => v.id === id);
      
      let reason = "Retrieved by: ✓ Semantic similarity only (vector)";
      if (isFts && isVector) {
        reason = "Retrieved by: ✓ Keyword search, ✓ Semantic similarity";
      } else if (isFts) {
        reason = "Retrieved by: ✓ Keyword search only (FTS5)";
      }

      // --- Heuristic Reranker Phase ---
      let adjustedScore = rrfScore;
      const contentLower = row.content.toLowerCase();
      const titleLower = row.title.toLowerCase();

      // If document/signature forgery is queried, penalize counterfeit coins/stamps/currency notes
      if (isDocumentForgeryRelated) {
        const isCoinOrStampOrCurrency = 
          titleLower.includes('coin') || titleLower.includes('stamp') || 
          titleLower.includes('currency') || titleLower.includes('bank-note') ||
          contentLower.includes('coin') || contentLower.includes('stamp') || 
          contentLower.includes('currency-note');

        if (isCoinOrStampOrCurrency) {
          adjustedScore *= 0.01; // heavily penalize counterfeit coin/stamps (reduce by 99%)
        } else if (titleLower.includes('forgery') || titleLower.includes('forged')) {
          adjustedScore *= 3.0; // strong boost for direct forgery definitions/offences
        }
      }

      hydrated.push({
        id: row.id,
        law_name: row.law_name,
        law_code: row.law_code,
        chapter: row.chapter,
        title: row.title,
        content: row.content,
        score: Number(scoreVal.toFixed(4)),
        rrf_score: Number(rrfScore.toFixed(6)),
        adjusted_score: adjustedScore,
        reason: reason
      });
    }
  }

  // Sort hydrated candidates based on the adjusted score and apply deduplication
  const sortedHydrated = hydrated.sort((a, b) => b.adjusted_score - a.adjusted_score);
  const seen = new Set();
  const topSections = [];

  for (const s of sortedHydrated) {
    if (topSections.length >= topK) break;

    const contentSnippet = s.content.substring(0, 80);
    const uniqueKey = `${s.law_name}-${s.title}-${contentSnippet}`;
    
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      topSections.push(s);
    }
  }

  const context = topSections.map(s =>
    `From the Act: ${s.law_name}\nSection: ${s.title}\nChapter: ${s.chapter || 'N/A'}\n\n${s.content}`
  ).join('\n\n---\n\n');

  const prompt = `
You are **LawDecoder**, an empathetic AI that explains Indian law clearly and practically.

 Rules:
- ONLY use the sections provided in the context. If none match, say so.
- Always refer to sections EXACTLY as written (e.g., "BNSS Section 167").
- **Statutory Definitions Guardrail:** Do NOT aggressively paraphrase or rewrite legal definitions. Preserve statutory terms, and explain their practical implications instead. Under the "Relevant Offence & Applicable Law" section, list each relevant provision as a distinct bullet point with a brief, 1-sentence statement of what it covers (e.g., "• BNS Section 336: Defines the offence of forgery and its punishment").
- **Categorized/Personal Laws:** If the context cites sections from different mutually exclusive laws (e.g., Hindu Marriage Act vs. Special Marriage Act vs. Parsi Law), clearly separate them in your explanation (e.g., "If married under Hindu law...", "For a civil marriage...") and note that the exact path depends on their specific registration/community.
- **Safety Guardrail:** Avoid making optimistic, reassuring promises about the outcome of the dispute (e.g., do NOT say "justice will prevail" or "you will win"). Remain legally objective. Explicitly state that a qualified advocate can advise them on the best course of action based on their specific circumstances.

 Style:
- Speak warmly, like talking to a worried friend.
- Begin with empathy (e.g., "I know this is distressing, but you’re not powerless").
- Explain legal terms simply, with analogies if needed.

 Practical Guidance Required:
- Include where to go (police station, cyber cell, court).
- Mention what to carry (evidence, ID, documents).
- Whom to contact (legal aid, lawyer, police).
- Provide any official links or portals if relevant.
- Explain what happens after (e.g., FIR → Investigation).

 Structure:
Provide your response strictly structured under these exact bold subheadings:
1. **Relevant Offence & Applicable Law**: List the relevant provisions in bullet points showing what they define, and explain their practical implications (using context).
2. **Possible Punishment**: Outline the legal penalties/imprisonment terms.
3. **Evidence You Will Need**: List physical or digital records to gather.
4. **Next Steps & Legal Safeguards**: Emphasize legal aid/consulting a lawyer as the safest next step, and list the procedural steps.

---
### Context:
${context}

Now answer naturally in 220–250 words for: "${userQuery}"
`;

  const provider = (process.env.LLM_PROVIDER || 'auto').toLowerCase();
  let llmOutput = '';
  let success = false;
  
  if (provider === 'gemini') {
    try {
      console.log(`[${new Date().toISOString()}] Routing to Gemini...`);
      llmOutput = await callGemini(prompt, userQuery);
      success = true;
    } catch (err) {
      console.error(`Gemini provider failed: ${err.message}`);
      throw err;
    }
  } else if (provider === 'openrouter') {
    try {
      console.log(`[${new Date().toISOString()}] Routing to OpenRouter...`);
      llmOutput = await callOpenRouter(prompt, userQuery);
      success = true;
    } catch (err) {
      console.error(`OpenRouter provider failed: ${err.message}`);
      throw err;
    }
  } else {
    // 'auto' mode: try Gemini if key exists, then fallback to OpenRouter
    if (GEMINI_API_KEY) {
      try {
        console.log(`[${new Date().toISOString()}] [Auto] Trying Gemini...`);
        llmOutput = await callGemini(prompt, userQuery);
        success = true;
      } catch (err) {
        console.warn(`[Auto] Gemini failed, falling back to OpenRouter: ${err.message}`);
      }
    }
    if (!success) {
      try {
        console.log(`[${new Date().toISOString()}] [Auto] Routing to OpenRouter...`);
        llmOutput = await callOpenRouter(prompt, userQuery);
        success = true;
      } catch (err) {
        console.error(`[Auto] OpenRouter failed: ${err.message}`);
      }
    }
  }

  if (success && llmOutput) {
    return { topSections, llmOutput: cleanLLMOutput(llmOutput) };
  }

  return { topSections, llmOutput: 'All AI models/providers failed. Please check your credentials and connection.', serverDown: true };
}

module.exports = { generateLegalAnswer };
