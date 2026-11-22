"""Annotation Studio - text classification, NER spans and image bounding boxes."""
import csv, io, json, os, threading, uuid
from flask import Flask, Response, jsonify, render_template, request, send_from_directory

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "data")
IMG = os.path.join(DATA, "images")
DB = os.path.join(DATA, "db.json")
os.makedirs(IMG, exist_ok=True)

app = Flask(__name__)
lock = threading.Lock()

DEFAULT = {
    "labels": {
        "text": ["Positive", "Negative", "Neutral"],
        "entity": ["PERSON", "ORG", "LOCATION", "DATE"],
        "image": ["car", "person", "dog", "other"],
    },
    "items": [],
    "annotations": {},
}


def new_id():
    return uuid.uuid4().hex[:10]


def load():
    if not os.path.exists(DB):
        db = json.loads(json.dumps(DEFAULT))
        sample = os.path.join(DATA, "sample_texts.txt")
        if os.path.exists(sample):
            for line in open(sample, encoding="utf-8"):
                if line.strip():
                    db["items"].append({"id": new_id(), "kind": "text", "text": line.strip()})
        save(db)
        return db
    with open(DB, encoding="utf-8") as f:
        return json.load(f)


def save(db):
    with open(DB, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def state():
    return jsonify(load())


@app.route("/api/labels", methods=["POST"])
def set_labels():
    body = request.get_json()
    with lock:
        db = load()
        db["labels"][body["kind"]] = [l.strip() for l in body["labels"] if l.strip()]
        save(db)
    return jsonify(ok=True)


@app.route("/api/upload", methods=["POST"])
def upload():
    added = 0
    with lock:
        db = load()
        for f in request.files.getlist("files"):
            name = f.filename or ""
            ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
            if ext in ("png", "jpg", "jpeg", "gif", "webp", "bmp"):
                fname = f"{new_id()}.{ext}"
                f.save(os.path.join(IMG, fname))
                db["items"].append({"id": new_id(), "kind": "image", "file": fname, "name": name})
                added += 1
            elif ext in ("txt", "jsonl", "csv"):
                for line in f.read().decode("utf-8", "ignore").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    if ext == "jsonl":
                        try:
                            line = json.loads(line).get("text", "")
                        except Exception:
                            continue
                    if line:
                        db["items"].append({"id": new_id(), "kind": "text", "text": line})
                        added += 1
        save(db)
    return jsonify(added=added)


@app.route("/api/annotate/<item_id>", methods=["POST"])
def annotate(item_id):
    with lock:
        db = load()
        db["annotations"][item_id] = request.get_json()
        save(db)
    return jsonify(ok=True)


@app.route("/api/item/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    with lock:
        db = load()
        db["items"] = [i for i in db["items"] if i["id"] != item_id]
        db["annotations"].pop(item_id, None)
        save(db)
    return jsonify(ok=True)


@app.route("/images/<path:name>")
def images(name):
    return send_from_directory(IMG, name)


@app.route("/api/export")
def export():
    fmt = request.args.get("format", "json")
    db = load()
    ann = db["annotations"]
    if fmt == "coco":
        cats = db["labels"]["image"]
        out = {"images": [], "annotations": [], "categories": [{"id": i + 1, "name": c} for i, c in enumerate(cats)]}
        aid = 1
        for n, it in enumerate([i for i in db["items"] if i["kind"] == "image"], 1):
            a = ann.get(it["id"], {})
            out["images"].append({"id": n, "file_name": it["file"], "width": a.get("w"), "height": a.get("h")})
            for b in a.get("boxes", []):
                out["annotations"].append({"id": aid, "image_id": n, "category_id": cats.index(b["label"]) + 1 if b["label"] in cats else 0,
                                           "bbox": [b["x"], b["y"], b["w"], b["h"]], "area": b["w"] * b["h"], "iscrowd": 0})
                aid += 1
        return Response(json.dumps(out, indent=2), mimetype="application/json",
                        headers={"Content-Disposition": "attachment; filename=coco.json"})
    rows = []
    for it in db["items"]:
        a = ann.get(it["id"], {})
        rows.append({"id": it["id"], "kind": it["kind"], "text": it.get("text", ""), "file": it.get("file", ""),
                     "class": a.get("cls", ""), "entities": a.get("spans", []), "boxes": a.get("boxes", []),
                     "done": a.get("done", False)})
    if fmt == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["id", "kind", "text", "file", "class", "entities", "boxes", "done"])
        for r in rows:
            w.writerow([r["id"], r["kind"], r["text"], r["file"], r["class"],
                        json.dumps(r["entities"]), json.dumps(r["boxes"]), r["done"]])
        return Response(buf.getvalue(), mimetype="text/csv",
                        headers={"Content-Disposition": "attachment; filename=annotations.csv"})
    return Response(json.dumps(rows, indent=2, ensure_ascii=False), mimetype="application/json",
                    headers={"Content-Disposition": "attachment; filename=annotations.json"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
