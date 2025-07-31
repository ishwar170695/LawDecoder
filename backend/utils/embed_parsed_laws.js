const fs = require('fs');
const path = require('path');
const { pipeline, env } = require('@xenova/transformers');

// Setup for local offline inference
env.allowLocalModels = true;
env.cacheDir = path.resolve(__dirname, '../models/all-MiniLM-L6-v2');

// Directory paths
const parsedDir = path.resolve(__dirname, '../data/parsed');
const outPath = path.resolve(__dirname, '../data/parsed_laws_vectors.json');

// Load all parsed sections from JSON files
function extractSectionsFromAllFiles(dir) {
  const all = [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const actData = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    for (const section of actData) {
      if (section.content && section.content.trim()) {
        all.push({
          id: section.id,
          law_name: section.law_name || file.replace('.json', ''),
          law_code: section.law_code || 'UNKNOWN', 
          chapter: section.chapter || null,
          title: section.title,
          content: section.content
        });
      }
    }
  }

  return all;
}

(async () => {
  console.log(' Loading parsed law sections...');
  const sections = extractSectionsFromAllFiles(parsedDir);
  console.log(` Found ${sections.length} valid sections with content.`);

  console.log(' Loading embedding pipeline...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const vectors = [];

  for (let i = 0; i < sections.length; i++) {
    const { id, law_name, law_code, chapter, title, content } = sections[i];
    const input = `${title}. ${content}`.slice(0, 1000); 

    console.log(` Embedding [${i + 1}/${sections.length}]: ${law_name} | ${title}`);
    const emb = await extractor(input, { pooling: 'mean', normalize: true });

    vectors.push({
      id,
      law_name,
      law_code, 
      chapter,
      title,
      content,
      embedding: emb.data
    });
  }

  fs.writeFileSync(outPath, JSON.stringify(vectors, null, 2));
  console.log(` Done! Saved ${vectors.length} embeddings to parsed_laws_vectors.json`);
})();
