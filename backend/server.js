require('dotenv').config();
const { generateLegalAnswer } = require('./utils/generateLegalAnswer');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8000;

// CORS for Streamlit frontend
app.use(cors({
  origin: '*', // Allow all for now; restrict in production
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

const FEEDBACK_FILE = path.join(__dirname, 'data', 'feedback.json');

// Ensure feedback file exists
if (!fs.existsSync(FEEDBACK_FILE)) {
  fs.writeFileSync(FEEDBACK_FILE, JSON.stringify([]));
}

// Health check endpoint
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Server is alive' });
});

// Middleware to skip Render health/fav requests
app.use((req, res, next) => {
  if (req.method === "GET" && (req.path === "/" || req.path === "/favicon.ico" || req.path === "/health")) {
    return res.sendStatus(200);
  }
  next();
});

// Main query endpoint
app.get('/query', async (req, res) => {
  const query = req.query.text?.trim();
  if (!query) {
    console.warn(' Query parameter missing');
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  console.log(` Query: "${query}"`);

  try {
    const { topSections, llmOutput, serverDown } = await generateLegalAnswer(query);
    return res.json({
      final_answer: llmOutput || ' AI could not generate a response.',
      top_sections: topSections || [],
      server_down: !!serverDown,
    });

  } catch (err) {
    console.error(' Server Error:', err);
    return res.status(500).json({
      final_answer: ' Internal server error while generating answer.',
      top_sections: [],
      server_down: true,
      details: err.message,
    });
  }
});

// Feedback endpoint (for thumbs up/down)
app.post('/feedback', (req, res) => {
  const { query, answer, feedback, comment } = req.body;

  if (!query || !answer || !feedback) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const entry = {
    timestamp: new Date().toISOString(),
    query,
    answer,
    feedback, // "positive" or "negative"
    comment: comment || ""
  };

  try {
    const existing = JSON.parse(fs.readFileSync(FEEDBACK_FILE, 'utf-8'));
    existing.push(entry);
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(existing, null, 2));
    res.json({ message: ' Feedback recorded successfully.' });
  } catch (err) {
    console.error(' Error saving feedback:', err);
    res.status(500).json({ error: 'Failed to save feedback.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(` Server running at http://localhost:${PORT}`);
});
