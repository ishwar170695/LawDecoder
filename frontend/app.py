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

# Session state
if "final_answer" not in st.session_state:
    st.session_state.final_answer = ""
if "last_query" not in st.session_state:
    st.session_state.last_query = ""
if "feedback" not in st.session_state:
    st.session_state.feedback = ""
if "feedback_comment" not in st.session_state:
    st.session_state.feedback_comment = ""

# === INPUT FIELD ===
user_query = st.text_input("Describe your legal issue:", key="user_query", placeholder="e.g. Someone built his house on my land")
search = st.button("🔍 Search")

# Backend API URL
BACKEND_URL = "http://localhost:8000/query"  # Local testing
FEEDBACK_URL = "http://localhost:8000/feedback"  # Feedback endpoint (to be added in backend)

# === QUERY HANDLING ===
if search and user_query.strip():
    with st.spinner("Connecting to server..."):
        start_time = time.time()
        try:
            response = requests.get(BACKEND_URL, params={"text": user_query}, timeout=120)
            latency = time.time() - start_time

            if latency > 40:
                st.info(f" Server was waking up (cold start). This took {int(latency)}s. Future responses will be faster.")

            data = response.json()
            st.session_state.final_answer = data.get("final_answer") or "[No answer returned]"
            st.session_state.last_query = user_query
            st.session_state.feedback = ""
            st.session_state.feedback_comment = ""

        except Exception as e:
            st.error(f" Error fetching response: {e}")
            st.info("The server may be waking up. Please wait a few seconds and try again.")

# DISPLAY FINAL ANSWER
if st.session_state.final_answer:
    st.subheader(" Final Answer")
    st.markdown(st.session_state.final_answer)

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

    # Optional feedback text box
    if st.session_state.feedback in ["positive", "negative"]:
        st.session_state.feedback_comment = st.text_area("Add a quick comment (optional):", key="feedback_comment_box")
        if st.button("Submit Feedback"):
            try:
                res = requests.post(FEEDBACK_URL, json={
                    "query": st.session_state.last_query,
                    "answer": st.session_state.final_answer,
                    "feedback": st.session_state.feedback,
                    "comment": st.session_state.feedback_comment
                })
                if res.status_code == 200:
                    st.success("✅ Feedback recorded. Thank you!")
                else:
                    st.error("⚠️ Failed to submit feedback.")
            except Exception as e:
                st.error(f"⚠️ Error submitting feedback: {e}")

    st.markdown("---")

    # Download answer
    st.download_button(
        label="📄 Download Answer",
        data=st.session_state.final_answer,
        file_name="law_answer.txt",
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

# === FOOTER ===
st.markdown(
    "<p class='footer'>© 2025 LawDecoder | Disclaimer & Privacy included above.</p>",
    unsafe_allow_html=True
)
