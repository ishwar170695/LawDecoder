require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { pipeline, env } = require('@xenova/transformers');

//Local embedding setup with AMD GPU (WebGPU)
env.allowLocalModels = true;
env.cacheDir = path.resolve(__dirname, '../models');
env.backends.onnx.deviceType = 'webgpu'; //  Force GPU for AMD
console.log(' Using WebGPU backend for embeddings (AMD GPU).');

// Preload embedding pipeline on GPU
let extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { device: 'webgpu' });

const VECTORS_PATH = path.resolve(__dirname, '../data/parsed_laws_vectors.json');
if (!fs.existsSync(VECTORS_PATH)) {
  console.error(' parsed_laws_vectors.json missing. Run your embedding script first.');
  process.exit(1);
}
let allVectors = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf-8'));

// Load OpenRouter API keys from environment variables
const API_KEYS = Object.keys(process.env)
  .filter(k => /^OPENROUTER_API_KEY\d+$/i.test(k))
  .sort()
  .map(k => process.env[k])
  .filter(Boolean);

if (API_KEYS.length === 0) {
  console.error(' No OpenRouter API keys found! Add them in .env');
  process.exit(1);
}

let currentKeyIndex = 0;
function getNextApiKey() {
  const key = API_KEYS[currentKeyIndex];
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  return key;
}

function toArray(embedding) {
  if (Array.isArray(embedding)) return embedding;
  if (embedding.data) return Array.from(embedding.data);
  return Object.keys(embedding)
    .sort((a, b) => Number(a) - Number(b))
    .map(k => embedding[k]);
}

function cosineSim(vecA, vecB) {
  const dot = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dot / (magA * magB);
}

async function fetchWithRetry(url, options, retries = 4, timeoutMs = 50000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      return await res.json();
    } catch (err) {
      console.error(` Attempt ${attempt} failed: ${err.name} - ${err.message}`);
      if (attempt === retries) throw err;
    }
  }
}

async function getQueryEmbedding(query) {
  const extractor = await extractorPromise;
  const emb = await extractor(query, { pooling: 'mean', normalize: true });
  return emb.data;
}

function cleanLLMOutput(output) {
  return output.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\|.*?\|>/g, '').trim();
}

async function generateLegalAnswer(userQuery, topK = 5) {
  console.log(`[${new Date().toISOString()}]  Query: "${userQuery}"`);

  const queryEmbedding = await getQueryEmbedding(userQuery);
  if (!queryEmbedding.length) throw new Error('Failed to generate local embedding');

  const scored = allVectors.map(entry => ({
    ...entry,
    score: cosineSim(toArray(entry.embedding), queryEmbedding),
  }));

  const topSections = scored.sort((a, b) => b.score - a.score).slice(0, topK);

  const context = topSections.map(s =>
    `From the Act: ${s.law_name}\nSection: ${s.title}\nChapter: ${s.chapter || 'N/A'}\n\n${s.content}`
  ).join('\n\n---\n\n');

  const prompt = `
You are **LawDecoder**, an empathetic AI that explains Indian law clearly and practically.

 Rules:
- ONLY use the sections provided in the context. If none match, say so.
- Always refer to sections EXACTLY as written (e.g., "BNSS Section 167").

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
1. Empathetic reassurance.
2. Explain how the law protects them (using context).
3. Give 3–5 clear procedural steps.
4. End with reassurance they are not alone and help is available.

---
### Context:
${context}

Now answer naturally in 220–250 words for: "${userQuery}"
`;

  const models = [
    'qwen/qwen3-4b:free',
    'qwen/qwen3-235b-a22b:free',
    'google/gemini-2.0-flash-exp:free',
    'deepseek/deepseek-r1-0528:free',
  ];

  for (const model of models) {
    for (let k = 0; k < API_KEYS.length; k++) {
      const apiKey = getNextApiKey();
      try {
        console.log(`[${new Date().toISOString()}] Trying model: ${model}, key index: ${currentKeyIndex}`);

        const data = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            temperature: 0.15,
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: userQuery },
            ],
          }),
        });

        const rawContent = data?.choices?.[0]?.message?.content || '';
        if (rawContent) {
          return { topSections, llmOutput: cleanLLMOutput(rawContent) };
        }
      } catch (err) {
        console.warn(` ${model} failed on key index ${currentKeyIndex}: ${err.message}`);
      }
    }
  }

  return { topSections, llmOutput: ' All AI models failed. Please try again later.' };
}

module.exports = { generateLegalAnswer };
