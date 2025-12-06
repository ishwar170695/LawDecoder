# ⚖️ LawDecoder

**LawDecoder** is an AI-powered legal explainer for **Indian law**, built using **RAG (Retrieval-Augmented Generation)**.
It retrieves relevant law sections (IPC, BNSS, IT Act, etc.) and explains them **clearly, empathetically, and practically**.

Backend runs on **Node.js (Express)** with local embeddings (via `@xenova/transformers`) + **OpenRouter API** for LLM inference.
Frontend is a **Streamlit app (Python)** providing a simple, no-login interface.

---

## 🚀 Features

* ✅ **Ask in plain English:** Natural queries like *"Someone built a house on my land"*.
* ✅ **Grounded in law:** Answers cite relevant sections (e.g., *BNSS Section 167*).
* ✅ **Step-by-step guidance:** Explains what to do (FIR, police, documents).
* ✅ **Local embeddings:** Runs on AMD GPU (WebGPU) or CPU fallback.
* ✅ **Feedback system:** Users can thumbs up/down and comment on responses.
* ✅ **Privacy-first:** Queries aren’t stored except optional feedback.

## ⚙️ Setup & Installation

### 1️⃣ Clone Repository

```bash
git clone https://github.com/ishwar170695/LawDecoder.git
cd LawDecoder
```

---

### 2️⃣ Backend (Node.js API)

**Install dependencies:**

```bash
cd backend
npm install
```

**Configure environment:**


Fill in your OpenRouter keys:

```env
OPENROUTER_API_KEY1=your_first_key
OPENROUTER_API_KEY2=your_second_key   # (Optional, auto-rotates if multiple keys)
```

**Start backend:**

```bash
npm start
```

Backend runs at: [http://localhost:8000](http://localhost:8000)

---

### 3️⃣ Frontend (Streamlit UI)

**Install dependencies:**

```bash
cd ../frontend
pip install -r requirements.txt
```

**Run UI:**

```bash
streamlit run app.py
```

UI will open in browser at: [http://localhost:8501](http://localhost:8501)

---

## 🧠 How It Works (RAG Pipeline)

1. **User Query → Embedding:** Query is converted to a vector using local MiniLM model (`Xenova/all-MiniLM-L6-v2`).
2. **Vector Search:** Finds top `k` matching sections in `parsed_laws_vectors.json`.
3. **LLM Call:** Query + retrieved sections are passed to OpenRouter (Qwen, Gemini, DeepSeek).
4. **Answer Generation:** AI responds empathetically with cited sections + clear guidance.
5. **Feedback Loop:** Users can thumbs up/down, stored in `feedback.json`.

---

## 📦 Data & Embeddings

* Law texts (IPC, BNSS, IT Act, Constitution) are pre-parsed into JSON in `backend/data/`.
* Embeddings (`parsed_laws_vectors.json`) are **too large for GitHub** and must be generated locally:

  ```bash
  node backend\utils\cache_embedding.js
  node backend\utils\embed_parsed_laws.js
  ```

  *(Script will use MiniLM for embeddings and save them locally.)*

---

## 🔒 Privacy & Disclaimer

* **No tracking:** Queries aren’t logged beyond session.
* **Optional feedback:** Thumbs-up/down is stored locally in `feedback.json`.
* **Disclaimer:**

  > *LawDecoder is for **informational purposes only** and is **not legal advice**.
  > Always consult a qualified lawyer for disputes.*

---

## 🖥 Requirements

* **Backend:** Node.js 18+, `npm`, AMD GPU (optional, WebGPU) or CPU.
* **Frontend:** Python 3.8+, `streamlit`.
* **LLM API:** [OpenRouter](https://openrouter.ai) free-tier or personal keys.

---

## 🛠 Tech Stack

* **Backend:** Node.js, Express, `@xenova/transformers` (local embeddings)
* **Frontend:** Python, Streamlit
* **LLMs:** Qwen 72B, Gemini Flash, DeepSeek R1 (via OpenRouter)
* **RAG:** Vector search over parsed law JSON

---

## 🤝 Contributing

PRs welcome!

* Keep PRs focused (UI, backend, docs, etc.).
* Use `.gitignore` to avoid committing large files (`parsed_laws_vectors.json`).
* For major law updates (e.g., new Acts), run local embedding script.

---

## 📜 License

MIT License.
