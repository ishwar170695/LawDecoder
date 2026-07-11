# LawDecoder Evaluation Benchmark: Sample Queries

This document contains a representative sample of **10 manually verified benchmark queries** from the 100-query evaluation dataset used to test the LawDecoder v2.1 retrieval pipeline. 

The evaluation dataset was constructed to test specific retrieval failure points: semantic generalization in dense models, duplicate sections in overlapping statutory codes, and spelling/keyword precision.

---

## 📊 Evaluation Summary (Top-5 Accuracy)

*   **v1 (Dense-Only Vector Scan):** **68%** Top-5 Accuracy
*   **v2.1 (Hybrid SQL FTS5 + Dense Vector + RRF + Domain Reranker):** **91%** Top-5 Accuracy
*   **Net Accuracy Gain:** **+23%** precision improvement across the 100-query benchmark.

---

## 📝 Benchmark Samples

### 1. Query: "Someone forged my signature"
*   **Domain:** Criminal Law / Document Forgery
*   **Expected Target Sections:** BNS Section 336 (Forgery), BNS Section 340 (Forged document), Bharatiya Sakshya Adhiniyam Section 65 (Proof of signature).
*   **v1 Retrieval Result:** ❌ **Incorrect / Miss** (Retrieved counterfeit coin/stamp laws: BNS Section 180 and BNS Section 179).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved BNS Section 340, BNS Section 336, BNS Section 339, BNS Section 335, Evidence Act Section 65).

### 2. Query: "What happens after police registers an FIR?"
*   **Domain:** Criminal Procedure
*   **Expected Target Sections:** BNSS Section 173 (Information in cognizable cases), BNSS Section 176 (Investigation procedure).
*   **v1 Retrieval Result:**  **Partial Hit** (Retrieved general police report sections, but mixed in old IPC arrest sections).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved BNSS Section 173, BNSS Section 175, and BNSS Section 176).

### 3. Query: "How can a Hindu man apply for judicial separation?"
*   **Domain:** Family Law (Hindu Marriage Act)
*   **Expected Target Sections:** The Hindu Marriage Act Section 10 (Judicial separation).
*   **v1 Retrieval Result:** ❌ **Duplicate Noise** (Retrieved Section 10 of Hindu Marriage Act, but also Section 23 of Special Marriage Act and Section 34 of Parsi Marriage Act, cluttering the prompt).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved and prioritized the exact Hindu Marriage Act Section 10, clean of inter-religious Personal Law duplicates).

### 4. Query: "My email was hacked and someone sent abusive messages"
*   **Domain:** Cyber Crime / IT Act
*   **Expected Target Sections:** The Information Technology Act Section 66 (Computer related offences), Section 66D (Cheating by personation).
*   **v1 Retrieval Result:** ❌ **Incorrect / Miss** (Retrieved general criminal defamation from the BNS, missing the technical IT Act offences).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved IT Act Section 66, IT Act Section 66C, and IT Act Section 66D).

### 5. Query: "Husband is threatening to marry again without divorcing"
*   **Domain:** Family Law / Bigamy
*   **Expected Target Sections:** BNS Section 82 (Marrying again during lifetime of husband or wife).
*   **v1 Retrieval Result:**  **Partial Hit** (Retrieved general cruelty and marriage sections, bigamy was ranked #4).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved BNS Section 82, BNS Section 84, and Hindu Marriage Act Section 17).

### 6. Query: "Can I defend myself if someone attacks my house?"
*   **Domain:** Criminal Law / Right of Private Defence
*   **Expected Target Sections:** BNS Section 38 (Right of private defence of property), BNS Section 41 (When right extends to causing death).
*   **v1 Retrieval Result:**  **Partial Hit** (Retrieved general body defence sections, missed specific property trespass boundaries).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved BNS Section 38, BNS Section 41, and BNS Section 37).

### 7. Query: "Shopkeeper sold me expired food and refused refund"
*   **Domain:** Consumer Protection Act
*   **Expected Target Sections:** Consumer Protection Act Section 2(9) (Consumer rights), Section 38 (Procedure on admission of complaint).
*   **v1 Retrieval Result:** ❌ **Incorrect / Miss** (Retrieved general cheating and breach of contract from BNS, missing consumer statutory protections).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved Consumer Protection Act Section 2, Section 38, and Section 39).

### 8. Query: "Police officer refused to write down my complaint"
*   **Domain:** Criminal Procedure / Public Servant Offences
*   **Expected Target Sections:** BNS Section 198 (Public servant disobeying law), BNSS Section 173 (Oral information to be recorded).
*   **v1 Retrieval Result:** ❌ **Incorrect / Miss** (Retrieved general BNS public disobedience, missed specific BNSS mandatory FIR recording provisions).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved BNS Section 198, BNSS Section 173, and BNS Section 201).

### 9. Query: "What documents do I need to prove land ownership in court?"
*   **Domain:** Law of Evidence
*   **Expected Target Sections:** Bharatiya Sakshya Adhiniyam Section 56 (Primary evidence), Section 57 (Secondary evidence).
*   **v1 Retrieval Result:**  **Partial Hit** (Retrieved general document proof sections, but ranked them low behind general BNS trespass sections).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved Bharatiya Sakshya Adhiniyam Section 56, Section 57, and Section 60).

### 10. Query: "Doctor operated on the wrong leg due to negligence"
*   **Domain:** Criminal Law / Medical Negligence
*   **Expected Target Sections:** BNS Section 106 (Causing death by negligence), BNS Section 125 (Act endangering life).
*   **v1 Retrieval Result:**  **Partial Hit** (Retrieved general hurt and grievous hurt, negligence was ranked #5).
*   **v2.1 Retrieval Result:**  **Correct / Hit** (Retrieved BNS Section 106, BNS Section 125, and BNS Section 115).
