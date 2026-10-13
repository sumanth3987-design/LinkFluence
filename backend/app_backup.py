
import os
import sys
from datetime import datetime, timedelta, timezone
from functools import wraps

from bson import ObjectId
from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pymongo import MongoClient, DESCENDING
from pymongo.errors import PyMongoError
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

app = Flask(__name__)

# Configuration
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = (
    os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
)
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=12)

if not app.config["SECRET_KEY"]:
    raise RuntimeError("SECRET_KEY is missing. Add it to backend/.env.")

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
]

CORS(
    app,
    resources={r"/api/*": {"origins": allowed_origins}},
    supports_credentials=True,
)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "linkfluence")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")

mongo_client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = mongo_client[MONGO_DB_NAME]


users_collection = db["users"]
creator_profiles_collection = db["creator_profiles"]
creators_collection = db["creators"]
invitations_collection = db["invitations"]
campaigns_collection = db["campaigns"]
briefs_collection = db["briefs"]
saved_creators_collection = db["saved_creators"]
messages_collection = db["messages"]
notifications_collection = db["notifications"]



# Common helpers
def utc_now():
    return datetime.now(timezone.utc)


def serialize_document(document):
    result = dict(document)

    if "_id" in result:
        result["id"] = str(result.pop("_id"))

    for key, value in list(result.items()):
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()

    return result

# ============================================================
# CREATOR WORKSPACE: INVITATIONS, PROJECTS, REVIEWS, EARNINGS
# Add these routes before the app.run(...) section.
# ============================================================

from bson import ObjectId
from pymongo import DESCENDING


def _creator_id():
    """Return the logged-in creator's user ID as a string."""
    return str(current_user_id())


def _creator_records(collection, owner_fields):
    """
    Return only records assigned to the currently logged-in creator.
    Supports the owner field names used by different existing workflows.
    """
    creator_id = _creator_id()

    query = {
        "$or": [{field: creator_id} for field in owner_fields]
    }

    records = list(
        collection.find(query).sort("_id", DESCENDING).limit(200)
    )
    return [serialize_document(record) for record in records]


@app.route("/api/creator/invitations", methods=["GET"])
@roles_required("creator")
def creator_get_invitations():
    creator_id = _creator_id()

    records = list(
        invitations.find({"creator_user_id": creator_id})
        .sort("_id", DESCENDING)
        .limit(200)
    )

    return jsonify({
        "invitations": [serialize_document(item) for item in records]
    }), 200


@app.route("/api/creator/projects", methods=["GET"])
@roles_required("creator")
def creator_get_projects():
    records = _creator_records(
        projects,
        ["creator_user_id", "assigned_creator_id"]
    )
    return jsonify({"projects": records}), 200


@app.route("/api/creator/reviews", methods=["GET"])
@roles_required("creator")
def creator_get_reviews():
    records = _creator_records(
        reviews,
        ["creator_user_id"]
    )
    return jsonify({"reviews": records}), 200


@app.route("/api/creator/earnings", methods=["GET"])
@roles_required("creator")
def creator_get_earnings():
    records = _creator_records(
        earnings,
        ["creator_user_id"]
    )

    # Sum only earnings recorded as available or paid.
    # This does not calculate earnings from project budgets.
    total = 0.0

    for item in records:
        status = str(item.get("status", "")).lower()
        if status in {"available", "paid", "paid_out"}:
            try:
                total += float(
                    item.get("amount", item.get("net_amount", 0)) or 0
                )
            except (TypeError, ValueError):
                continue

    return jsonify({
        "earnings": records,
        "total": round(total, 2)
    }), 200


@app.route("/api/creator/invitations/<invitation_id>", methods=["PATCH"])
@roles_required("creator")
def creator_update_invitation(invitation_id):
    if not ObjectId.is_valid(invitation_id):
        return jsonify({"error": "Invalid invitation ID."}), 400

    body = request.get_json(silent=True) or {}
    action = str(body.get("action", "")).strip().lower()

    allowed_statuses = {
        "accept": "accepted",
        "decline": "declined",
    }

    if action not in allowed_statuses:
        return jsonify({
            "error": "Action must be 'accept' or 'decline'."
        }), 400

    creator_id = _creator_id()
    invitation = invitations.find_one({
        "_id": ObjectId(invitation_id),
        "creator_user_id": creator_id,
        "status": "pending",
    })

    if not invitation:
        return jsonify({
            "error": "Pending invitation not found for your account."
        }), 404

    now = utc_now()
    new_status = allowed_statuses[action]

    invitations.update_one(
        {
            "_id": invitation["_id"],
            "creator_user_id": creator_id,
            "status": "pending",
        },
        {
            "$set": {
                "status": new_status,
                "updated_at": now,
            }
        },
    )

    # Notify the brand that owns this invitation.
    brand_id = str(invitation.get("brand_id", ""))

    if brand_id:
        notifications.insert_one({
            "user_id": brand_id,
            "title": "Creator invitation response",
            "message": (
                f"The creator {new_status} your invitation."
            ),
            "type": "invitation_response",
            "invitation_id": str(invitation["_id"]),
            "read": False,
            "created_at": now,
        })

    updated = invitations.find_one({"_id": invitation["_id"]})

    return jsonify({
        "message": f"Invitation {new_status}.",
        "invitation": serialize_document(updated),
    }), 200


def public_user(user):
    if not user:
        return None

    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", ""),
    }


def error_response(message, status=400):
    return jsonify({"message": message}), status


def get_current_user():
    user_id = session.get("user_id")

    if not user_id:
        return None

    try:
        user = users_collection.find_one({"_id": ObjectId(user_id)})
    except Exception:
        session.clear()
        return None

    if not user:
        session.clear()

    return user


def login_required(view_function):
    @wraps(view_function)
    def wrapped(*args, **kwargs):
        if not get_current_user():
            return error_response("Authentication required.", 401)
        return view_function(*args, **kwargs)
    return wrapped


def roles_required(*allowed_roles):
    def decorator(view_function):
        @wraps(view_function)
        def wrapped(*args, **kwargs):
            user = get_current_user()

            if not user:
                return error_response("Authentication required.", 401)

            if user.get("role") not in allowed_roles:
                return error_response("You do not have permission.", 403)

            return view_function(*args, **kwargs)
        return wrapped
    return decorator


def establish_session(user):
    session.clear()
    session.permanent = True
    session["user_id"] = str(user["_id"])
    session["role"] = user.get("role")


def current_user_id():
    return str(session["user_id"])


def find_creator(creator_id):
    creator = None

    if ObjectId.is_valid(creator_id):
        creator = creators_collection.find_one({"_id": ObjectId(creator_id)})

    if not creator:
        creator = creators_collection.find_one({"id": creator_id})

    return creator


# Health check
@app.get("/api/health")
def health():
    try:
        mongo_client.admin.command("ping")
        return jsonify({"status": "ok", "database": "connected"}), 200
    except PyMongoError:
        app.logger.exception("MongoDB health check failed")
        return jsonify({
            "status": "error",
            "database": "disconnected",
        }), 503


# Registration and authentication
@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")
    role = str(data.get("role", "")).strip().lower()

    if not name or not email or not password:
        return error_response("Name, email, and password are required.")

    if not isinstance(password, str) or len(password) < 8:
        return error_response("Password must contain at least 8 characters.")

    if role not in ("creator", "brand"):
        return error_response("Registration role must be creator or brand.")

    try:
        if users_collection.find_one({"email": email}):
            return error_response("An account with this email already exists.", 409)

        user = {
            "name": name,
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": role,
            "auth_provider": "password",
            "created_at": utc_now(),
        }

        result = users_collection.insert_one(user)
        user["_id"] = result.inserted_id
        establish_session(user)

        return jsonify({
            "message": "Registration successful.",
            "user": public_user(user),
        }), 201

    except PyMongoError:
        app.logger.exception("Registration failed")
        return error_response("Database error during registration.", 500)


def authenticate_password(data, required_role=None):
    email = str(data.get("email", "")).strip().lower()
    password = data.get("password", "")

    if not email or not isinstance(password, str) or not password:
        return error_response("Email and password are required.")

    try:
        user = users_collection.find_one({"email": email})
    except PyMongoError:
        app.logger.exception("Login database query failed")
        return error_response("Database error during login.", 500)

    if not user or not check_password_hash(
        user.get("password_hash", ""),
        password,
    ):
        return error_response("Invalid email or password.", 401)

    if required_role and user.get("role") != required_role:
        return error_response("This account cannot use this login.", 403)

    establish_session(user)
    return jsonify({
        "message": "Login successful.",
        "user": public_user(user),
    }), 200


@app.post("/api/auth/login")
def login():
    return authenticate_password(request.get_json(silent=True) or {})


@app.post("/api/auth/admin/login")
def admin_login():
    return authenticate_password(
        request.get_json(silent=True) or {},
        required_role="admin",
    )


@app.post("/api/auth/google")
def google_login():
    if not GOOGLE_CLIENT_ID:
        return error_response("Google sign-in is not configured on the server.", 503)

    data = request.get_json(silent=True) or {}
    credential = data.get("credential")
    role = str(data.get("role", "")).strip().lower()

    if not credential:
        return error_response("Google credential is required.")

    if role not in ("creator", "brand"):
        return error_response("Choose a valid account role.")

    try:
        google_user = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )

        email = str(google_user.get("email", "")).strip().lower()
        name = str(google_user.get("name", "")).strip()

        if not email or not google_user.get("email_verified", False):
            return error_response("Google email could not be verified.", 401)

        user = users_collection.find_one({"email": email})

        if user:
            if user.get("role") != role:
                return error_response(
                    "This email is already registered with a different role.",
                    403,
                )
        else:
            user = {
                "name": name or email.split("@")[0],
                "email": email,
                "role": role,
                "auth_provider": "google",
                "created_at": utc_now(),
            }
            result = users_collection.insert_one(user)
            user["_id"] = result.inserted_id

        establish_session(user)
        return jsonify({
            "message": "Google sign-in successful.",
            "user": public_user(user),
        }), 200

    except ValueError:
        return error_response("Invalid or expired Google credential.", 401)
    except PyMongoError:
        app.logger.exception("Google sign-in database error")
        return error_response("Database error during Google sign-in.", 500)


@app.get("/api/auth/me")
def current_session():
    user = get_current_user()

    if not user:
        return error_response("Not logged in.", 401)

    return jsonify({"user": public_user(user)}), 200


@app.post("/api/auth/logout")
def logout():
    session.clear()
    response = jsonify({"message": "Logged out successfully."})
    response.delete_cookie("session")
    return response, 200


# Role-protected test routes
@app.get("/api/test/creator")
@roles_required("creator")
def creator_access_test():
    return jsonify({"message": "Creator access granted."}), 200


@app.get("/api/test/brand")
@roles_required("brand")
def brand_access_test():
    return jsonify({"message": "Brand access granted."}), 200


@app.get("/api/test/admin")
@roles_required("admin")
def admin_access_test():
    return jsonify({"message": "Admin access granted."}), 200


# Creator's private profile workspace
CREATOR_PROFILE_FIELDS = {
    "bio": 1000,
    "niche": 200,
    "location": 200,
    "profile_image_url": 1000,
    "instagram": 300,
    "youtube": 300,
    "tiktok": 300,
    "website": 500,
}

CREATOR_PROFILE_LIST_FIELDS = {
    "skills": 30,
    "languages": 20,
    "portfolio_links": 20,
}


def get_creator_profile_document(user_id):
    return creator_profiles_collection.find_one({"user_id": user_id})


def serialize_creator_profile(profile, user):
    profile = profile or {}

    result = {
        "user_id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "bio": profile.get("bio", ""),
        "niche": profile.get("niche", ""),
        "location": profile.get("location", ""),
        "profile_image_url": profile.get("profile_image_url", ""),
        "instagram": profile.get("instagram", ""),
        "youtube": profile.get("youtube", ""),
        "tiktok": profile.get("tiktok", ""),
        "website": profile.get("website", ""),
        "skills": profile.get("skills", []),
        "languages": profile.get("languages", []),
        "portfolio_links": profile.get("portfolio_links", []),
        "created_at": profile.get("created_at").isoformat()
        if isinstance(profile.get("created_at"), datetime)
        else None,
        "updated_at": profile.get("updated_at").isoformat()
        if isinstance(profile.get("updated_at"), datetime)
        else None,
    }

    return result


@app.get("/api/creator/profile")
@roles_required("creator")
def get_my_creator_profile():
    user = get_current_user()
    user_id = current_user_id()

    try:
        profile = get_creator_profile_document(user_id)
        return jsonify({
            "profile": serialize_creator_profile(profile, user)
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load creator profile")
        return error_response("Unable to load creator profile.", 500)


@app.put("/api/creator/profile")
@roles_required("creator")
def update_my_creator_profile():
    user = get_current_user()
    user_id = current_user_id()
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response("A valid JSON object is required.")

    updates = {}

    for field, max_length in CREATOR_PROFILE_FIELDS.items():
        if field not in data:
            continue

        value = data[field]

        if not isinstance(value, str):
            return error_response(f"{field} must be text.")

        value = value.strip()

        if len(value) > max_length:
            return error_response(
                f"{field} must be {max_length} characters or fewer."
            )

        updates[field] = value

    for field, max_items in CREATOR_PROFILE_LIST_FIELDS.items():
        if field not in data:
            continue

        value = data[field]

        if not isinstance(value, list):
            return error_response(f"{field} must be a list.")

        if len(value) > max_items:
            return error_response(
                f"{field} cannot contain more than {max_items} items."
            )

        cleaned_items = []

        for item in value:
            if not isinstance(item, str):
                return error_response(
                    f"Every item in {field} must be text."
                )

            item = item.strip()

            if not item:
                continue

            if len(item) > 500:
                return error_response(
                    f"Items in {field} must be 500 characters or fewer."
                )

            cleaned_items.append(item)

        updates[field] = cleaned_items

    now = utc_now()

    try:
        creator_profiles_collection.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    **updates,
                    "user_id": user_id,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

        profile = get_creator_profile_document(user_id)

        return jsonify({
            "message": "Creator profile saved successfully.",
            "profile": serialize_creator_profile(profile, user),
        }), 200

    except PyMongoError:
        app.logger.exception("Failed to save creator profile")
        return error_response("Unable to save creator profile.", 500)


# Creator marketplace
@app.get("/api/creators")
def get_creators():
    try:
        creators = list(creators_collection.find({}).sort("_id", DESCENDING))
        return jsonify({
            "creators": [serialize_document(item) for item in creators]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load creators")
        return error_response("Unable to load creators.", 500)


@app.post("/api/creators")
@roles_required("admin")
def create_creator():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    handle = str(data.get("handle", "")).strip().lower()

    if not name or not handle:
        return error_response("Creator name and handle are required.")

    try:
        if creators_collection.find_one({"handle": handle}):
            return error_response("A creator with this handle already exists.", 409)

        creator = {
            key: value for key, value in data.items()
            if key not in ("_id", "id")
        }
        creator.update({
            "name": name,
            "handle": handle,
            "created_at": utc_now(),
        })

        result = creators_collection.insert_one(creator)
        creator["_id"] = result.inserted_id

        return jsonify({
            "message": "Creator created successfully.",
            "creator": serialize_document(creator),
        }), 201
    except PyMongoError:
        app.logger.exception("Failed to create creator")
        return error_response("Unable to create creator.", 500)


# Persistent invitations
@app.get("/api/invitations")
@roles_required("brand")
def get_invitations():
    try:
        items = list(invitations_collection.find({
            "brand_id": current_user_id()
        }).sort("created_at", DESCENDING))

        return jsonify({
            "invitations": [serialize_document(item) for item in items]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load invitations")
        return error_response("Unable to load invitations.", 500)


@app.post("/api/invitations")
@roles_required("brand")
def create_invitation():
    data = request.get_json(silent=True) or {}
    creator_id = str(data.get("creator_id", "")).strip()

    if not creator_id:
        return error_response("Creator ID is required.")

    try:
        creator = find_creator(creator_id)
        if not creator:
            return error_response("Creator was not found.", 404)

        brand_id = current_user_id()
        existing = invitations_collection.find_one({
            "brand_id": brand_id,
            "creator_id": creator_id,
            "status": {"$ne": "cancelled"},
        })

        if existing:
            return jsonify({
                "message": "You have already invited this creator.",
                "invitation": serialize_document(existing),
            }), 200

        invitation = {
            "brand_id": brand_id,
            "creator_id": creator_id,
            "creator_name": creator.get("name", ""),
            "message": str(data.get("message", "")).strip(),
            "status": "pending",
            "created_at": utc_now(),
            "updated_at": utc_now(),
        }

        result = invitations_collection.insert_one(invitation)
        invitation["_id"] = result.inserted_id

        notifications_collection.insert_one({
            "user_id": brand_id,
            "type": "invitation",
            "title": "Invitation created",
            "message": f"Your invitation to {creator.get('name', 'the creator')} was saved.",
            "read": False,
            "created_at": utc_now(),
        })

        return jsonify({
            "message": "Invitation created successfully.",
            "invitation": serialize_document(invitation),
        }), 201

    except PyMongoError:
        app.logger.exception("Failed to create invitation")
        return error_response("Unable to create invitation.", 500)


# Campaigns
@app.get("/api/campaigns")
@roles_required("brand")
def get_campaigns():
    try:
        items = list(campaigns_collection.find({
            "brand_id": current_user_id()
        }).sort("updated_at", DESCENDING))

        return jsonify({
            "campaigns": [serialize_document(item) for item in items]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load campaigns")
        return error_response("Unable to load campaigns.", 500)


@app.post("/api/campaigns")
@roles_required("brand")
def create_campaign():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()

    if not name:
        return error_response("Campaign name is required.")

    try:
        now = utc_now()
        campaign = {
            "brand_id": current_user_id(),
            "name": name,
            "description": str(data.get("description", "")).strip(),
            "platform": str(data.get("platform", "")).strip(),
            "budget": max(0, float(data.get("budget") or 0)),
            "goal": str(data.get("goal", "")).strip(),
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }

        result = campaigns_collection.insert_one(campaign)
        campaign["_id"] = result.inserted_id

        notifications_collection.insert_one({
            "user_id": current_user_id(),
            "type": "campaign",
            "title": "Campaign created",
            "message": f'Campaign "{name}" was saved as a draft.',
            "read": False,
            "created_at": now,
        })

        return jsonify({
            "message": "Campaign created successfully.",
            "campaign": serialize_document(campaign),
        }), 201
    except (PyMongoError, TypeError, ValueError):
        app.logger.exception("Failed to create campaign")
        return error_response("Unable to save campaign. Check the budget value.", 500)


# Creative briefs
@app.get("/api/briefs")
@roles_required("brand")
def get_briefs():
    try:
        items = list(briefs_collection.find({
            "brand_id": current_user_id()
        }).sort("updated_at", DESCENDING))

        return jsonify({
            "briefs": [serialize_document(item) for item in items]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load briefs")
        return error_response("Unable to load briefs.", 500)


@app.post("/api/briefs")
@roles_required("brand")
def create_brief():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", data.get("name", ""))).strip()

    if not title:
        return error_response("Brief title is required.")

    try:
        now = utc_now()
        brief = {
            "brand_id": current_user_id(),
            "title": title,
            "description": str(data.get("description", "")).strip(),
            "deliverables": str(data.get("deliverables", "")).strip(),
            "audience": str(data.get("audience", "")).strip(),
            "budget": max(0, float(data.get("budget") or 0)),
            "deadline": str(data.get("deadline", "")).strip(),
            "status": "draft",
            "created_at": now,
            "updated_at": now,
        }

        result = briefs_collection.insert_one(brief)
        brief["_id"] = result.inserted_id

        return jsonify({
            "message": "Brief saved successfully.",
            "brief": serialize_document(brief),
        }), 201
    except (PyMongoError, TypeError, ValueError):
        app.logger.exception("Failed to create brief")
        return error_response("Unable to save brief. Check the budget value.", 500)


# Saved creators
@app.get("/api/saved-creators")
@roles_required("brand")
def get_saved_creators():
    try:
        items = list(saved_creators_collection.find({
            "brand_id": current_user_id()
        }).sort("created_at", DESCENDING))

        return jsonify({
            "saved_creators": [serialize_document(item) for item in items]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load saved creators")
        return error_response("Unable to load saved creators.", 500)


@app.post("/api/saved-creators")
@roles_required("brand")
def save_creator():
    data = request.get_json(silent=True) or {}
    creator_id = str(data.get("creator_id", "")).strip()

    if not creator_id:
        return error_response("Creator ID is required.")

    try:
        creator = find_creator(creator_id)
        if not creator:
            return error_response("Creator was not found.", 404)

        query = {
            "brand_id": current_user_id(),
            "creator_id": creator_id,
        }

        saved_creators_collection.update_one(
            query,
            {"$setOnInsert": {
                **query,
                "creator_name": creator.get("name", ""),
                "created_at": utc_now(),
            }},
            upsert=True,
        )

        return jsonify({"message": "Creator saved successfully."}), 200
    except PyMongoError:
        app.logger.exception("Failed to save creator")
        return error_response("Unable to save creator.", 500)


@app.delete("/api/saved-creators/<creator_id>")
@roles_required("brand")
def unsave_creator(creator_id):
    try:
        saved_creators_collection.delete_one({
            "brand_id": current_user_id(),
            "creator_id": creator_id,
        })
        return jsonify({"message": "Creator removed from saved list."}), 200
    except PyMongoError:
        app.logger.exception("Failed to remove saved creator")
        return error_response("Unable to update saved creators.", 500)


# Messages: persistent brand-to-creator message history
@app.get("/api/messages")
@roles_required("brand")
def get_messages():
    query = {"brand_id": current_user_id()}
    creator_id = request.args.get("creator_id", "").strip()

    if creator_id:
        query["creator_id"] = creator_id

    try:
        items = list(messages_collection.find(query).sort("created_at", DESCENDING))
        return jsonify({
            "messages": [serialize_document(item) for item in items]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load messages")
        return error_response("Unable to load messages.", 500)


@app.post("/api/messages")
@roles_required("brand")
def send_message():
    data = request.get_json(silent=True) or {}
    creator_id = str(data.get("creator_id", "")).strip()
    body = str(data.get("message", "")).strip()

    if not creator_id or not body:
        return error_response("Creator ID and message are required.")

    try:
        creator = find_creator(creator_id)
        if not creator:
            return error_response("Creator was not found.", 404)

        message = {
            "brand_id": current_user_id(),
            "creator_id": creator_id,
            "creator_name": creator.get("name", ""),
            "sender_role": "brand",
            "message": body,
            "created_at": utc_now(),
        }

        result = messages_collection.insert_one(message)
        message["_id"] = result.inserted_id

        return jsonify({
            "message": "Message saved successfully.",
            "item": serialize_document(message),
        }), 201
    except PyMongoError:
        app.logger.exception("Failed to save message")
        return error_response("Unable to send message.", 500)


# Notifications
@app.get("/api/notifications")
@login_required
def get_notifications():
    try:
        items = list(notifications_collection.find({
            "user_id": current_user_id()
        }).sort("created_at", DESCENDING).limit(100))

        return jsonify({
            "notifications": [serialize_document(item) for item in items]
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load notifications")
        return error_response("Unable to load notifications.", 500)


@app.post("/api/notifications/read")
@login_required
def mark_notifications_read():
    try:
        notifications_collection.update_many(
            {"user_id": current_user_id(), "read": False},
            {"$set": {"read": True}},
        )
        return jsonify({"message": "Notifications marked as read."}), 200
    except PyMongoError:
        app.logger.exception("Failed to update notifications")
        return error_response("Unable to update notifications.", 500)


# Account settings
@app.get("/api/settings")
@login_required
def get_settings():
    user = get_current_user()
    return jsonify({"settings": public_user(user)}), 200


@app.patch("/api/settings")
@login_required
def update_settings():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()

    if not name or not email:
        return error_response("Name and email are required.")

    try:
        duplicate = users_collection.find_one({
            "email": email,
            "_id": {"$ne": ObjectId(current_user_id())},
        })

        if duplicate:
            return error_response("That email is already in use.", 409)

        users_collection.update_one(
            {"_id": ObjectId(current_user_id())},
            {"$set": {"name": name, "email": email}},
        )

        user = get_current_user()
        return jsonify({
            "message": "Settings updated successfully.",
            "settings": public_user(user),
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to update settings")
        return error_response("Unable to update settings.", 500)


# Admin account provisioning
def create_admin_account():
    email = input("Admin email: ").strip().lower()
    name = input("Admin name: ").strip()
    password = input("Admin password (minimum 8 characters): ")

    if not email or not name or len(password) < 8:
        print("Email, name, and a password of at least 8 characters are required.")
        return

    try:
        if users_collection.find_one({"email": email}):
            print("An account with this email already exists.")
            return

        users_collection.insert_one({
            "name": name,
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": "admin",
            "auth_provider": "password",
            "created_at": utc_now(),
        })
        print("Admin account created successfully.")
    except PyMongoError as error:
        print(f"Could not create admin account: {error}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "create-admin":
        create_admin_account()
    else:
        app.run(host="127.0.0.1", port=5000, debug=True)
