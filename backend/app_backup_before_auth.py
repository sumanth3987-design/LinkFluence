
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()

app = Flask(__name__)

CORS(
    app,
    resources={r"/api/*": {"origins": "http://localhost:5173"}}
)

MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb://localhost:27017/"
)
MONGODB_DB = os.getenv("MONGODB_DB", "linkfluence")

client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=3000
)

db = client[MONGODB_DB]


def serialize_creator(creator):
    """Convert a MongoDB creator document into JSON-safe data."""
    return {
        "id": str(creator["_id"]),
        "name": creator.get("name", ""),
        "handle": creator.get("handle", ""),
        "role": creator.get("role", ""),
        "location": creator.get("location", ""),
        "rate": creator.get("rate", 0),
        "rating": creator.get("rating", 0),
        "projects": creator.get("projects", 0),
        "match": creator.get("match", 0),
        "tags": creator.get("tags", []),
        "initials": creator.get("initials", ""),
        "symbol": creator.get("symbol", "✦"),
        "availability": creator.get("availability", "Available"),
    }


@app.get("/")
def home():
    return jsonify({
        "app": "Linkfluence",
        "message": "Welcome to the Linkfluence API"
    })


@app.get("/api/health")
def health():
    try:
        client.admin.command("ping")

        return jsonify({
            "status": "ok",
            "app": "Linkfluence API",
            "database": MONGODB_DB,
            "database_status": "connected"
        }), 200

    except PyMongoError:
        return jsonify({
            "status": "error",
            "app": "Linkfluence API",
            "database": MONGODB_DB,
            "database_status": "disconnected"
        }), 503


@app.get("/api/creators")
def get_creators():
    try:
        creators = db.creators.find().sort("name", 1)

        return jsonify({
            "success": True,
            "count": db.creators.count_documents({}),
            "creators": [
                serialize_creator(creator)
                for creator in creators
            ]
        }), 200

    except PyMongoError:
        app.logger.exception("Could not retrieve creators")

        return jsonify({
            "success": False,
            "message": "Could not retrieve creators"
        }), 500


@app.post("/api/creators")
def create_creator():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "success": False,
            "message": "Request must contain a JSON object"
        }), 400

    required_fields = [
        "name",
        "handle",
        "role",
        "location",
        "rate",
        "tags",
    ]

    missing_fields = [
        field for field in required_fields
        if field not in data
        or data[field] is None
        or data[field] == ""
    ]

    if missing_fields:
        return jsonify({
            "success": False,
            "message": "Required fields are missing",
            "missing_fields": missing_fields
        }), 400

    text_fields = ["name", "handle", "role", "location"]

    for field in text_fields:
        if not isinstance(data[field], str) or not data[field].strip():
            return jsonify({
                "success": False,
                "message": f"{field} must be a non-empty string"
            }), 400

    if (
        isinstance(data["rate"], bool)
        or not isinstance(data["rate"], (int, float))
        or data["rate"] <= 0
    ):
        return jsonify({
            "success": False,
            "message": "rate must be a positive number"
        }), 400

    if (
        not isinstance(data["tags"], list)
        or not all(
            isinstance(tag, str) and tag.strip()
            for tag in data["tags"]
        )
    ):
        return jsonify({
            "success": False,
            "message": "tags must be a list of non-empty strings"
        }), 400

    name = data["name"].strip()
    handle = data["handle"].strip()

    try:
        existing_creator = db.creators.find_one({
            "handle": handle
        })

        if existing_creator:
            return jsonify({
                "success": False,
                "message": "A creator with this handle already exists"
            }), 409

        initials = "".join(
            part[0] for part in name.split()[:2]
        ).upper()

        creator = {
            "name": name,
            "handle": handle,
            "role": data["role"].strip(),
            "location": data["location"].strip(),
            "rate": data["rate"],
            "rating": 0,
            "projects": 0,
            "match": 0,
            "tags": [
                tag.strip() for tag in data["tags"]
            ],
            "initials": initials,
            "symbol": "✦",
            "availability": "Available",
        }

        result = db.creators.insert_one(creator)
        creator["_id"] = result.inserted_id

        return jsonify({
            "success": True,
            "message": "Creator profile created successfully",
            "creator": serialize_creator(creator)
        }), 201

    except PyMongoError:
        app.logger.exception("Could not create creator")

        return jsonify({
            "success": False,
            "message": "Could not save creator profile"
        }), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
