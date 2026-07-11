const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(__dirname, '../data/laws.db');
const PARSED_DIR = path.resolve(__dirname, '../data/parsed');

function initDatabase() {
  console.log('Checking database status...');
  const dbExists = fs.existsSync(DB_PATH);
  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrency performance
  db.pragma('journal_mode = WAL');

  // Create standard schema table
  db.exec(`
    CREATE TABLE IF NOT EXISTS laws (
      id TEXT PRIMARY KEY,
      law_name TEXT,
      law_code TEXT,
      chapter TEXT,
      title TEXT,
      content TEXT
    )
  `);

  // Create FTS5 virtual table for keyword matching
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS laws_fts USING fts5(
      id UNINDEXED,
      law_name,
      chapter,
      title,
      content
    )
  `);

  // Check if database needs ingestion
  const rowCount = db.prepare('SELECT count(*) as count FROM laws').get().count;
  if (rowCount > 0) {
    console.log(`✓ Structured database ready (${rowCount} sections loaded).`);
    return db;
  }

  console.log('Populating structured laws database from parsed JSON files...');
  const start = Date.now();

  if (!fs.existsSync(PARSED_DIR)) {
    console.error(`Parsed JSON directory missing: ${PARSED_DIR}`);
    return db;
  }

  const files = fs.readdirSync(PARSED_DIR).filter(f => f.endsWith('.json'));
  console.log(`Found ${files.length} JSON law definition files.`);

  // Prepare insert statements
  const insertLaw = db.prepare(`
    INSERT INTO laws (id, law_name, law_code, chapter, title, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const insertFts = db.prepare(`
    INSERT INTO laws_fts (id, law_name, chapter, title, content)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Ingest within a single fast SQL Transaction
  const transaction = db.transaction(() => {
    for (const file of files) {
      const filePath = path.join(PARSED_DIR, file);
      const actData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      for (const section of actData) {
        if (section.content && section.content.trim()) {
          const id = section.id;
          const lawName = section.law_name || file.replace('.json', '');
          const lawCode = section.law_code || 'UNKNOWN';
          const chapter = section.chapter || null;
          const title = section.title;
          const content = section.content;

          // Insert into both tables
          try {
            insertLaw.run(id, lawName, lawCode, chapter, title, content);
            insertFts.run(id, lawName, chapter, title, content);
          } catch (err) {
            // Ignore duplicates if they somehow exist
            if (!err.message.includes('UNIQUE constraint failed')) {
              console.warn(`Error inserting section ${id}: ${err.message}`);
            }
          }
        }
      }
    }
  });

  transaction();

  const totalLoaded = db.prepare('SELECT count(*) as count FROM laws').get().count;
  console.log(`✓ Structured database populated: Ingested ${totalLoaded} sections in ${Date.now() - start}ms.`);

  return db;
}

module.exports = { initDatabase };
