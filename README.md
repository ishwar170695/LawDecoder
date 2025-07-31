  # LawDecoder

  **LawDecoder** is an AI-powered legal explainer for Indian law. It uses Retrieval-Augmented Generation (RAG) to answer user queries with references to actual law sections, providing clear, empathetic, and actionable guidance. The system consists of a Python Streamlit frontend and a Node.js backend with local embeddings and OpenRouter API integration.

  ---

  ## Features

  - **Ask legal questions** in plain English and get answers grounded in Indian law.
  - **References to actual law sections** (IPC, BNSS, IT Act, etc.) with context.
  - **Empathetic, step-by-step guidance** for real-world situations.
  - **Runs locally** with AMD GPU (WebGPU) or CPU fallback for embeddings.

  ---

  ## Project Structure

  ```
  LawDecoder/
    backend/      # Node.js + Express server, embeddings, RAG logic
    frontend/     # Streamlit Python app
    .env.example  # Example environment variables
    .gitignore
    README.md
  ```

  ---

  ## Setup Instructions

  ### 1. Clone the Repository

  ```bash
  git clone https://github.com/ishwar170695/LawDecoder.git
  cd LawDecoder
  ```

  ---

  ### 2. Backend Setup (Node.js)

  #### a. Install dependencies

  ```bash
  cd backend
  npm install
  ```

  #### b. Environment variables

  - Copy `.env.example` to `.env` and fill in your OpenRouter API keys:
    ```
    cp .env.example .env
    ```
  - You can add multiple keys as `OPENROUTER_API_KEY1`, `OPENROUTER_API_KEY2`, etc.

  #### c. Generate embeddings

  - Make sure you have your law section JSONs ready (see `backend/data/parsed_laws_vectors.json`).
  - If not present, run the embedding script as per your project instructions.

  #### d. Start the backend server

  ```bash
  npm start
  ```
  - The server runs on [http://localhost:5000](http://localhost:5000) by default.

  ---

  ### 3. Frontend Setup (Python/Streamlit)


  #### a. Install dependencies

  ```bash
  cd ../frontend
  pip install -r requirements.txt
  ```

  > **Note:** The `requirements.txt` includes all necessary Python packages. Python 3.8 or newer is recommended.

  #### b. Run the Streamlit app

  ```bash
  streamlit run app.py
  ```
  - The app will open in your browser (usually at [http://localhost:8501](http://localhost:8501)).

  ---

  ## Environment Variables

  Create a `.env` file in the `backend/` directory with the following:

  ```
  OPENROUTER_API_KEY1=your_first_openrouter_key
  OPENROUTER_API_KEY2=your_second_openrouter_key
  # Add more keys as needed
  ```

  ---

  ## AMD GPU / CPU Fallback

  - The backend uses [@xenova/transformers](https://github.com/xenova/transformers.js) with WebGPU for fast local embeddings on AMD GPUs.
  - If no compatible GPU is found, it will automatically fall back to CPU (slower).

  ---

  ## Disclaimer

  > **LawDecoder is for informational purposes only and does not constitute legal advice.**
  > Always consult a qualified lawyer for legal matters. The AI may make mistakes or provide outdated information.

  ---

  ## License

  MIT License.
