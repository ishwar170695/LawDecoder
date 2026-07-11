---
title: I Rebuilt My AI Legal Assistant After Learning Why Vector-Only RAG Wasn't Enough
published: true
description: Why naive dense vector search fails on domain-specific legal data, and how to build a hybrid search engine using SQLite FTS5, RRF, and a domain reranker.
tags: ai, backend, sqlite, search
cover_image: https://raw.githubusercontent.com/ishwar170695/LawDecoder/main/images/landing_page.png
---

I built a legal AI assistant last year.

One day I asked it:

> "Someone forged my signature."

The first law it retrieved wasn't about forgery.

It was about counterfeit coins.

That was the moment I realized the problem wasn't the LLM.

It was my retrieval pipeline.

> **The surprising part:** I didn't change the LLM.
>
> Nearly all of the improvement came from redesigning the retrieval pipeline.

Here is the story of how I debugged my search system, why dense vector search alone falls apart on domain-specific datasets, and how I redesigned the retrieval pipeline.

---

## The Failure

To understand why the system was failing, we need to look at the mismatch between what was queried and what was actually retrieved in the original vector-only (v1) search:

```
Query:
"Someone forged my signature"

Top result (v1):
❌ BNS Section 180 — Possession of counterfeit coin

Expected:
✅ BNS Section 336 — Forgery
✅ BNS Section 340 — Using forged document
```

---

## Tracing the Cause

I started tracing the retrieval pipeline step by step to understand why the wrong statutes were consistently ranking first.

The embedding model wasn't "wrong." It was doing exactly what it was trained to do: place semantically similar concepts close together in vector space.

Unfortunately, in legal search, *semantically similar* isn't the same as *legally relevant*.

Because "forgery" and "counterfeit" ended up close in embedding space, the retriever ranked counterfeit coin and government stamp provisions above the actual definition of document forgery. The retriever generalized too aggressively. It missed the specific statutory definition of forgery (`BNS Section 336`) because the word "signature" was semantically distant from generic statutory descriptions of the offence.

### The Secondary Issues: RAM Bloat & Duplicates
In addition to generalising incorrectly, caching large raw text strings (text, titles, act names) in a JavaScript array caused the Node.js process to consume over **320 MB of RAM** at startup. Furthermore, since legal codes are highly repetitive, the search regularly returned duplicate entries of identical sections across different personal laws, cluttering the LLM's context window.

---

## Redesigning the Retrieval Pipeline

I realized that to make the assistant trustworthy, the real problem was search quality, not LLM capability. I redesigned the retrieval pipeline into a structured, hybrid search engine.

![LawDecoder hybrid retrieval architecture diagram: SQLite FTS5 sparse keyword index and dense vector ONNX pipeline merged via Reciprocal Rank Fusion (RRF) and Domain Reranker](https://raw.githubusercontent.com/ishwar170695/LawDecoder/main/images/architecture.png)

*The LLM remained almost unchanged. Nearly all improvements came from redesigning retrieval.*

### Step 1: SQLite + FTS5
I moved all 4,892 legal sections out of JSON files and persisted them in a local **SQLite** database. I created a virtual table using the **FTS5 extension** to index all chapters, titles, and text contents. 

Now, exact terms are queried using a sparse keyword index (ranked via BM25), ensuring that queries containing specific statutory terms match their target immediately.

### Step 2: Lightweight Vector Cache
I stripped all text metadata from Node.js memory. The startup script now loads only the `id` (string) and the coordinate list—pre-processed into a compact `Float32Array` object—into RAM. 

The actual text content remains on disk in SQLite and is only hydrated for the top 5 matched sections. This dropped the memory footprint by **85%** (from 320 MB to **48 MB**).

### Step 3: Reciprocal Rank Fusion (RRF)
Instead of relying on either vector search or keyword search, I fused them. The backend runs both searches, takes the top 50 matches from each, and combines their rankings using standard **Reciprocal Rank Fusion (RRF)**. RRF rewards documents that rank highly in both methods without needing to normalize scores between sparse BM25 and dense cosine models.

Here is the core JS implementation of the RRF merge:

```js
const rrfScores = new Map();
const k = 60; // Standard constant for RRF

// Process vector ranking positions (dense)
vectorRankings.forEach((item, index) => {
  rrfScores.set(item.id, 1 / (k + index + 1));
});

// Process FTS5 keyword ranking positions (sparse) and add to scores
ftsRankings.forEach((item, index) => {
  const existingScore = rrfScores.get(item.id) || 0;
  rrfScores.set(item.id, existingScore + (1 / (k + index + 1)));
});

// Sort matched IDs based on fused RRF score
const mergedRanking = Array.from(rrfScores.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20); // Top 20 candidates for reranking
```

### Step 4: Domain Reranker (Deterministic Guardrail)
To resolve the counterfeit coin noise without running a heavy, slow transformer cross-encoder, I built a lightweight, deterministic **Domain Reranker** in JavaScript. This is a deterministic rule-based reranker tailored to the legal domain—not a learned neural cross-encoder. 

It loads the top 20 candidates returned by the RRF step and checks for specific intent signals:
*   If the query is document/signature forgery-related, it checks if a retrieved document is a coin or banknote counterfeit section. If yes, it **penalizes the score by 99%** (`* 0.01`).
*   It **boosts direct document forgery offences** (containing `"forgery"` or `"forged"`) by **300%** (`* 3.0`).
*   It filters out duplicate sections using content snippet prefixes.

```js
// Heuristic Domain Reranking
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
```

---

## Performance & Evaluation

To evaluate the redesign, I assembled a benchmark of 100 manually verified legal queries spanning criminal law, cybercrime, family law, consumer protection, and procedural law.

| Metric | v1 (Naive Vector RAG) | v2.1 (Hybrid Search - Current) | Change |
| :--- | :--- | :--- | :--- |
| **Search Engine** | Dense Vector (Linear JSON scan) | Hybrid (SQLite FTS5 + Dense Vector + RRF + Reranker) | Major retrieval precision upgrade |
| **Avg. Query Latency** | `466 ms` | `12 ms` | **97.4% speedup** |
| **Memory Cache Footprint** | `~320 MB` | `~48 MB` | **85.0% RAM savings** |
| **Duplicate Citations** | Present (up to 40% overlaps) | Deduplicated (0% overlaps) | Verified |
| **Top-5 Relevant Retrieval Rate** | ~68% | ~91% | **+23% accuracy gain** |

*Latency is based on 100 benchmark queries. Memory is process-level heap size at startup. Accuracy is evaluated on top-5 target matches using a manually verified benchmark dataset of 100 queries.*

None of these improvements required changing the language model. The gains came almost entirely from retrieval engineering. For this benchmark query, the top retrieved references aligned with the expected legal provisions:
1.  **BNS 340:** Forged document and using it as genuine
2.  **BNS 336:** Forgery definition and penalty
3.  **BNS 339:** Possession of forged document
4.  **BNS 335:** Making a false document
5.  **Evidence Act Section 65:** Proof of signature and handwriting

---

## Production Walkthrough

### 1️⃣ User Chat Interface
Clean, legal explanation interface for end users:
![LawDecoder Streamlit user chat landing page showing response layout](https://raw.githubusercontent.com/ishwar170695/LawDecoder/main/images/landing_page.png)

### 2️⃣ Structured Offence & Citation Details
Deduplicated citations with developer metrics visible in Developer Mode:
![LawDecoder citation view in developer mode displaying RRF ranks and selection reasons](https://raw.githubusercontent.com/ishwar170695/LawDecoder/main/images/citations_view.png)

### 3️⃣ System Evaluation Dashboard
Performance comparisons and technical architecture story:
![LawDecoder developer dashboard showing performance latency and accuracy benchmarks comparison table](https://raw.githubusercontent.com/ishwar170695/LawDecoder/main/images/developer_notes_tab.png)

---

## Lessons Learned

- Retrieval quality sets the upper bound for RAG quality.
- Dense embeddings alone are rarely enough for domain-specific search.
- SQLite + FTS5 can be an excellent retrieval engine for small-to-medium corpora.
- Simple deterministic rerankers can eliminate domain-specific retrieval errors without requiring another neural model.

If I continue evolving this project, the next improvements I'd explore are:
*   **Cross-encoder reranking:** Integrate lightweight cross-encoders (e.g. BGE reranker) for advanced ranking.
*   **Metadata-aware retrieval:** Allow users to filter queries by Act or category before searching.
*   **Legal Case Retrieval:** Expand indexing to cover legal precedents and court cases in addition to statutory acts.
*   **Multilingual support:** Support query translation for regional languages.

---

## Final Thoughts

Going into this project, I assumed improving the LLM would improve the assistant.

Instead, I learned that retrieval quality determines the ceiling of any RAG system.

The LLM can only reason over what you retrieve.

Improving retrieval turned out to be far more impactful than switching models.

If you're building domain-specific AI—whether for legal, medical, or enterprise search—I'd recommend spending as much time on retrieval engineering as prompt engineering.

---

## Repository

The complete implementation—including SQLite ingestion, FTS5 indexing, Reciprocal Rank Fusion, evaluation queries, and benchmark samples—is available on GitHub.

**GitHub:** https://github.com/ishwar170695/LawDecoder
