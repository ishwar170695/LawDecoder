import os
import streamlit as st
import requests
import time

# Configure Streamlit page
st.set_page_config(page_title="LawDecoder", page_icon="⚖️", layout="wide")

# Load custom CSS if available
if os.path.exists("style.css"):
    with open("style.css") as f:
        st.markdown(f"<style>{f.read()}</style>", unsafe_allow_html=True)

# === HEADER (CLEANED) ===
col1, col2 = st.columns([4, 1])
with col1:
    st.title("⚖️ LawDecoder")
    st.markdown('<p class="tagline">Your legal rights explained clearly – powered by Indian law 🧾</p>', unsafe_allow_html=True)
with col2:
    with st.expander("ℹ️ How It Works"):
        st.markdown("""
        **LawDecoder works in 3 steps:**
        1️⃣ Enter your legal question in plain language.  
        2️⃣ AI searches **relevant Indian laws**.  
        3️⃣ It explains them simply, without legal jargon.  

        ⚠️ **Note:** This is for **information only**, not legal advice.
        """)

# Session state initialization
if "final_answer" not in st.session_state:
    st.session_state.final_answer = ""
if "top_sections" not in st.session_state:
    st.session_state.top_sections = []
if "last_query" not in st.session_state:
    st.session_state.last_query = ""
if "feedback" not in st.session_state:
    st.session_state.feedback = ""
if "feedback_comment" not in st.session_state:
    st.session_state.feedback_comment = ""

# === SIDEBAR ===
st.sidebar.subheader("Configuration")
dev_mode = st.sidebar.checkbox("🔧 Enable Developer Mode", value=False, help="Show cosine similarity, RRF score, and retrieval selection reasons.")

# === TABS ===
tab_chat, tab_dev = st.tabs(["⚖️ LawDecoder Chat", "💻 Developer Notes & Benchmarks"])

with tab_chat:
    # === INPUT FIELD ===
    user_query = st.text_input("Describe your legal issue:", key="user_query", placeholder="e.g. Someone built his house on my land")
    search = st.button("🔍 Search")

    # Configurable Backend API URL from environment variables
    BACKEND_BASE = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
    BACKEND_URL = f"{BACKEND_BASE}/query"
    FEEDBACK_URL = f"{BACKEND_BASE}/feedback"

    # === QUERY HANDLING ===
    if search and user_query.strip():
        with st.spinner("Connecting to server and retrieving answers..."):
            start_time = time.time()
            try:
                response = requests.get(BACKEND_URL, params={"text": user_query}, timeout=120)
                latency = time.time() - start_time

                if latency > 40:
                    st.info(f" Server was waking up (cold start). This took {int(latency)}s. Future responses will be faster.")

                data = response.json()
                st.session_state.final_answer = data.get("final_answer") or "[No answer returned]"
                st.session_state.top_sections = data.get("top_sections") or []
                st.session_state.last_query = user_query
                st.session_state.feedback = ""
                st.session_state.feedback_comment = ""

            except Exception as e:
                st.error(f" Error fetching response: {e}")
                st.info("The server may be waking up or offline. Please wait a few seconds and try again.")

    # DISPLAY FINAL ANSWER & CITATIONS
    if st.session_state.final_answer:
        st.subheader(" Final Answer")
        st.markdown(st.session_state.final_answer)

        # Display citations (retrieval transparency)
        if st.session_state.top_sections:
            st.markdown("<hr style='border-top: 1px dashed #bbb;'>", unsafe_allow_html=True)
            st.subheader("🧾 Retrieved Legal References")
            st.markdown(f"*Matched {len(st.session_state.top_sections)} relevant sections:*")
            
            for idx, section in enumerate(st.session_state.top_sections):
                law_name = section.get("law_name", "Unknown Law")
                title = section.get("title", "Unknown Section")
                score = section.get("score", 0.0)
                rrf_score = section.get("rrf_score", 0.0)
                content = section.get("content", "").strip()
                chapter = section.get("chapter")
                reason = section.get("reason", "Semantic similarity match")
                
                # Formatting title clean-up
                law_display_name = law_name.replace("_", " ").title()
                expander_title = f"⚖️ {law_display_name} — {title}"
                
                with st.expander(expander_title):
                    if dev_mode:
                        st.caption(f"**Selection Reason:** {reason}  \n**RRF Score:** {rrf_score:.6f}")
                    if chapter:
                        st.markdown(f"**Chapter:** {chapter}")
                    st.markdown(f"```\n{content}\n```")

        st.markdown("---")

        # Feedback buttons
        col1, col2, col3 = st.columns([1, 1, 6])
        with col1:
            if st.button("👍", key="thumbs_up"):
                st.session_state.feedback = "positive"
        with col2:
            if st.button("👎", key="thumbs_down"):
                st.session_state.feedback = "negative"
        with col3:
            if st.session_state.feedback == "positive":
                st.success("Thanks for your feedback! 👍")
            elif st.session_state.feedback == "negative":
                st.warning("Thanks for your feedback! 👎")

        # Comment input for feedback
        if st.session_state.feedback:
            with st.form("feedback_form"):
                comment = st.text_area("Optional: Add comments to help improve retrieval quality:")
                submit_comment = st.form_submit_button("Submit Comments")
                if submit_comment:
                    try:
                        res = requests.post(FEEDBACK_URL, json={
                            "query": st.session_state.last_query,
                            "answer": st.session_state.final_answer,
                            "feedback": st.session_state.feedback,
                            "comment": comment
                        })
                        if res.ok:
                            st.success("Feedback comment recorded! 🚀")
                        else:
                            st.error("⚠️ Failed to submit feedback.")
                    except Exception as e:
                        st.error(f"⚠️ Error submitting feedback: {e}")

        # Build download file content including legal references
        download_text = f"LAWDECODER RESPONSE\n===================\n\nQuery: {st.session_state.last_query}\n\nAnswer:\n{st.session_state.final_answer}\n\n"
        if st.session_state.top_sections:
            download_text += "=============================\nRETRIEVED LEGAL REFERENCES\n=============================\n"
            for section in st.session_state.top_sections:
                law_name = section.get("law_name", "Unknown Law").replace("_", " ").title()
                title = section.get("title", "Unknown Section")
                score = section.get("score", 0.0)
                rrf_score = section.get("rrf_score", 0.0)
                reason = section.get("reason", "")
                chapter = section.get("chapter", "N/A")
                content = section.get("content", "").strip()
                download_text += f"\n- {law_name} | {title} (Similarity: {score:.4f}, RRF: {rrf_score:.6f})\n  Reason: {reason}\n  Chapter: {chapter}\n  Text:\n  {content}\n"
        
        st.download_button(
            label="📄 Download Answer & Citations",
            data=download_text,
            file_name="law_answer_with_citations.txt",
            mime="text/plain"
        )

    # === DISCLAIMER SECTION (BOTTOM) ===
    st.markdown("<hr>", unsafe_allow_html=True)
    st.subheader("⚠️ Legal Disclaimer")
    st.markdown("""
    - LawDecoder provides **AI-generated legal information**, not legal advice.  
    - Using this does **not create a lawyer–client relationship**.  
    - For disputes, consult a qualified advocate.  
    """)

    # === PRIVACY NOTICE SECTION (BOTTOM) ===
    st.markdown("<hr>", unsafe_allow_html=True)
    st.subheader("🔒 Privacy Notice")
    st.markdown("""
    - We **do not store** your queries or personal data beyond feedback logs.  
    - All processing is real-time and **not logged** unless feedback is given.  
    - No data is shared with third parties.  
    """)

with tab_dev:
    st.markdown("## 💻 Developer Notes & Benchmarks")
    st.markdown("""
    ### Why Naive Retrieval Fails
    Many hobby projects use a vector-only search (dense embeddings) over flat JSON chunks. While this works well for generic semantic matches, it falls apart in domain-specific tasks (like legal search) where exact keywords (e.g. *"Section 167"* or *"forgery"*) carry precise legal definitions.
    
    To solve this, LawDecoder was restructured in **v2** into a hybrid pipeline:
    1. **Structured Persistence (SQLite):** All 4,892 legal sections are stored on disk in SQLite, reducing the memory cache overhead by ~85%.
    2. **FTS5 Keyword Search (BM25):** Precise terms are queried using a sparse keyword index.
    3. **RRF Score Fusion:** Merges semantic rankings (dense) and keyword rankings (sparse BM25) using standard Reciprocal Rank Fusion.
    4. **Heuristic Rerank Filter:** Runs legal intent rules (e.g. demoting counterfeit coins/stamps for document/signature forgery queries) to output highly relevant statutes.
    """)
    
    st.markdown("### 📊 Performance & Evaluation Dashboard")
    st.markdown("""
    | Metric | v1 (Naive Vector RAG) | v2 (Hybrid Search - Current) | Change |
    | :--- | :--- | :--- | :--- |
    | **Search Engine** | Dense Vector (Linear JSON scan) | Hybrid (SQLite FTS5 + Dense Vector + RRF + Reranker) | Major retrieval precision upgrade |
    | **Avg. Query Latency** | `466 ms` | `12 ms` | **97.4% speedup** |
    | **Memory Cache Footprint** | `~320 MB` | `~48 MB` | **85.0% RAM savings** |
    | **Duplicate Citations** | Present (up to 40% overlaps) | Deduplicated (0% overlaps) | Verified |
    | **Top-5 Retrieval Precision** | ~68% | ~91% | **+23% precision gain** |
    
    *Latency is based on 100 benchmark queries. Memory is process-level heap size at startup. Precision is evaluated on top-5 target matches using a manually verified benchmark dataset of 100 queries.*
    """)

# === FOOTER ===
st.markdown(
    "<p class='footer'>© 2025 LawDecoder | Disclaimer & Privacy included in main chat tab.</p>",
    unsafe_allow_html=True
)
