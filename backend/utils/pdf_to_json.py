import os
import fitz  # PyMuPDF
import re
import json

INPUT_DIR = r"D:\NeedtoUpdate\LawDecoder\backend\data"
OUTPUT_DIR = r"D:\NeedtoUpdate\LawDecoder\backend\data\parsed"
os.makedirs(OUTPUT_DIR, exist_ok=True)

LAW_NAME_PATTERN = re.compile(r'THE\s+(.+?)\s+(ACT|ADHINIYAM|SANHITA),\s*(\d{4})', re.IGNORECASE)
SECTION_PATTERN = re.compile(r'^\s*(\d+[A-Z]?\.?)\s+(.+)', re.MULTILINE)  # Handles 74, 74., 74A etc.
CHAPTER_PATTERN = re.compile(r'CHAPTER\s+([A-Z]+)[^\n]*', re.IGNORECASE)

def slugify(text):
    return re.sub(r'[^\w]+', '_', text.strip().lower()).strip('_')

def extract_sections(text):
    matches = list(SECTION_PATTERN.finditer(text))
    sections = []
    for i, match in enumerate(matches):
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        section_text = text[start:end].strip()
        sections.append({
            "raw_number": match.group(1).strip(),
            "title": match.group(2).strip(),
            "content": section_text
        })
    return sections

def detect_act_code(law_name):
    law_upper = law_name.upper()
    if "NYAYA SANHITA" in law_upper: return "BNS"
    if "NAGRIK SURAKSHA SANHITA" in law_upper: return "BNSS"
    if "SAKSHYA ADHINIYAM" in law_upper: return "BSA"
    if "CONSTITUTION" in law_upper: return "CONST"
    return "OTHER"

def parse_pdf(filepath):
    doc = fitz.open(filepath)
    full_text = "\n".join([page.get_text() for page in doc])
    doc.close()

    filename_raw = os.path.splitext(os.path.basename(filepath))[0]
    filename_law_name = filename_raw.replace('_', ' ').title()

    # Match law name from text (fallback to filename if missing)
    law_match = LAW_NAME_PATTERN.search(full_text)
    if law_match:
        law_name = f"The {law_match.group(1).strip()} {law_match.group(2).strip().title()}, {law_match.group(3)}"
    else:
        law_name = filename_law_name

    # Detect act code (BNS, BNSS, etc.)
    act_code = detect_act_code(law_name)

    # Split preamble and body
    arrangement_match = re.search(r'ARRANGEMENT OF SECTIONS', full_text, re.IGNORECASE)
    if arrangement_match:
        arrangement_index = arrangement_match.start()
        preamble_text = full_text[:arrangement_index].strip()
        body_text = full_text[arrangement_index:].strip()
    else:
        preamble_text = ""
        body_text = full_text.strip()

    # Extract sections and chapters
    sections = extract_sections(body_text)
    parsed_sections = []
    current_chapter = None

    # Add preamble as separate section
    law_slug = slugify(law_name)[:50]
    parsed_sections.append({
        "id": f"{law_slug}_preamble",
        "law_name": law_name,
        "law_code": act_code,
        "chapter": None,
        "title": "Preamble",
        "content": preamble_text
    })

    for section in sections:
        # Detect chapters separately
        if CHAPTER_PATTERN.match(section['title']):
            current_chapter = section['title']
            continue

        section_id = f"{law_slug}_{section['raw_number'].replace('.', '')}"
        parsed_sections.append({
            "id": section_id,
            "law_name": law_name,
            "law_code": act_code,
            "chapter": current_chapter,
            "title": f"{section['raw_number']} {section['title']}",
            "content": section['content']
        })

    return law_name, law_slug, parsed_sections

def convert_all():
    for filename in os.listdir(INPUT_DIR):
        if filename.lower().endswith(".pdf"):
            filepath = os.path.join(INPUT_DIR, filename)
            print(f" Processing: {filename}")
            law_name, law_slug, parsed_json = parse_pdf(filepath)

            out_name = law_slug + '.json'
            out_path = os.path.join(OUTPUT_DIR, out_name)

            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(parsed_json, f, ensure_ascii=False, indent=2)

            print(f"  Saved: {out_path}")

if __name__ == "__main__":
    convert_all()
