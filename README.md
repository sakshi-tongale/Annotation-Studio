# Annotation Studio

A local, dependency-light data annotation tool (Flask + vanilla JS).

**Features**
- Text classification (sentiment/topic labels)
- Named-entity (NER) span annotation by highlighting text
- Image bounding boxes (drag to draw)
- Upload `.txt` (one item per line), `.jsonl` (`{"text": ...}`), `.csv` (one text per line), or images
- Editable label sets, progress tracking, keyboard shortcuts
- Export: JSON, CSV, COCO (images)

## Run in VS Code
1. Unzip and open the folder in VS Code (`File > Open Folder`).
2. Open a terminal (`Ctrl+``) and run:
   ```
   python -m venv venv
   venv\Scripts\activate        # Windows
   source venv/bin/activate     # macOS / Linux
   pip install -r requirements.txt
   python app.py
   ```
   (Or press **F5** after selecting the venv interpreter.)
3. Open http://127.0.0.1:5000

## Shortcuts
`1-9` choose label · `N`/`P` next/previous · `Enter` mark done · `Del` remove last annotation

## Data
Everything is stored in `data/db.json`; uploaded images go to `data/images/`.
Delete `db.json` to reset (sample texts are re-seeded).
