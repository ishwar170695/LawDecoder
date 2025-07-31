const { pipeline, env } = require('@xenova/transformers');
const path = require('path');

// Set offline mode (no external downloads after cache)
env.allowLocalModels = true;


env.cacheDir = path.resolve(__dirname, '../models');

async function cacheModels() {
  console.log(' Starting model caching...');

  try {
    // Cache Embedding Model
    console.log(' Caching embedding model: Xenova/all-MiniLM-L6-v2');
    const embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    await embeddingPipeline('Hello law'); // Dummy run to trigger tokenizer + weights caching
    console.log(' Embedding model cached!');

    // Cache Summarization Model
    console.log(' Caching summarization model: Xenova/distilbart-cnn-12-6');
    const summarizerPipeline = await pipeline('summarization', 'Xenova/distilbart-cnn-12-6');
    await summarizerPipeline('This is a test sentence for summarization.'); // Dummy run
    console.log(' Summarization model cached!');

    console.log(' All models cached successfully in:', env.cacheDir);
  } catch (err) {
    console.error(' Failed to cache models:', err);
  }
}

cacheModels();
