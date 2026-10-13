import os
import re
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
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=12)
if not app.config["SECRET_KEY"]:
    raise RuntimeError("SECRET_KEY is missing. Add it to backend/.env.")

allowed_origins = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
]
CORS(app, resources={r"/api/*": {"origins": allowed_origins}}, supports_credentials=True)
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
projects_collection = db["projects"]
reviews_collection = db["reviews"]
earnings_collection = db["earnings"]


def utc_now():
    return datetime.now(timezone.utc)


def serialize_document(document):
    if not document:
        return None
    result = dict(document)
    if "_id" in result:
        result["id"] = str(result.pop("_id"))
    for key, value in list(result.items()):
        if isinstance(value, ObjectId):
            result[key] = str(value)
        elif isinstance(value, datetime):
            result[key] = value.isoformat()
        elif isinstance(value, dict):
            result[key] = {
                k: str(v) if isinstance(v, ObjectId) else v.isoformat() if isinstance(v, datetime) else v
                for k, v in value.items()
            }
    return result


def public_user(user):
    if not user:
        return None
    return {"id": str(user["_id"]), "name": user.get("name", ""),
            "email": user.get("email", ""), "role": user.get("role", "")}


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


def resolve_creator_account(creator):
    """Resolve a marketplace listing to a real creator login account, if linked."""
    if creator.get("account_link_disabled") is True:
        return None
    for field in ("creator_user_id", "user_id", "account_id"):
        value = creator.get(field)
        if value:
            try:
                user = users_collection.find_one({"_id": ObjectId(str(value)), "role": "creator"})
            except Exception:
                user = None
            if user:
                return user
    email = str(creator.get("email", "")).strip().lower()
    if email:
        user = users_collection.find_one({"email": email, "role": "creator"})
        if user:
            return user
    return None



def ensure_creator_listing(user, profile=None):
    """Create or safely link a marketplace listing to a creator login account."""
    if not user or user.get("role") != "creator":
        return None
    user_id = str(user["_id"])
    email = str(user.get("email", "")).strip().lower()
    name = str(user.get("name", "Creator")).strip() or "Creator"
    try:
        listing = creators_collection.find_one({"$or": [
            {"creator_user_id": user_id}, {"user_id": user_id}, {"account_id": user_id},
            {"creator_user_id": user["_id"]}, {"user_id": user["_id"]}, {"account_id": user["_id"]},
        ]})
        if not listing and email:
            candidate = creators_collection.find_one({
                "email": {"$regex": "^" + re.escape(email) + "$", "$options": "i"},
                "account_link_disabled": {"$ne": True},
            })
            if candidate:
                current_owner = resolve_creator_account(candidate)
                if not current_owner or str(current_owner["_id"]) == user_id:
                    listing = candidate
        if profile is None:
            profile = creator_profiles_collection.find_one({"user_id": user_id}) or {}
        profile = profile or {}
        skills = profile.get("skills", [])
        if not isinstance(skills, list):
            skills = []
        skills = [str(item).strip() for item in skills if str(item).strip()]
        niche = str(profile.get("niche", "")).strip()
        tags = list(skills)
        if niche and niche not in tags:
            tags.append(niche)
        now = utc_now()
        links = {
            "name": name, "email": email, "creator_user_id": user_id,
            "user_id": user_id, "account_id": user_id,
            "account_link_disabled": False, "updated_at": now,
        }
        optional_profile_fields = {
            "bio": str(profile.get("bio", "")).strip(),
            "niche": niche,
            "location": str(profile.get("location", "")).strip(),
            "instagram": str(profile.get("instagram", "")).strip(),
            "youtube": str(profile.get("youtube", "")).strip(),
            "tiktok": str(profile.get("tiktok", "")).strip(),
            "website": str(profile.get("website", "")).strip(),
        }
        if listing:
            updates = dict(links)
            for field, value in optional_profile_fields.items():
                if value:
                    updates[field] = value
            if skills:
                updates["skills"] = skills
            if tags:
                updates["tags"] = tags
            if niche:
                updates["role"] = niche
            creators_collection.update_one({"_id": listing["_id"]}, {"$set": updates})
            return creators_collection.find_one({"_id": listing["_id"]})

        handle_base = re.sub(r"[^a-z0-9]+", "", name.lower()) or (email.split("@", 1)[0] if email else "creator")
        handle_base = handle_base[:28] or "creator"
        handle = handle_base
        suffix = 2
        while creators_collection.find_one({"handle": handle}):
            handle = f"{handle_base[:24]}{suffix}"
            suffix += 1
        listing_fields = {
            **links, **optional_profile_fields,
            "role": niche or "Creator", "niche": niche, "location": optional_profile_fields["location"],
            "tags": tags, "skills": skills,
            "portfolio_links": profile.get("portfolio_links", []) if isinstance(profile.get("portfolio_links", []), list) else [],
            "handle": handle, "created_at": now, "listing_source": "creator_registration",
        }
        result = creators_collection.insert_one(listing_fields)
        return creators_collection.find_one({"_id": result.inserted_id})
    except PyMongoError:
        app.logger.exception("Could not create or sync creator marketplace listing")
        return None


def creator_owned_query(owner_fields, user_id=None):
    user_id = user_id or current_user_id()
    values = [user_id]
    try:
        values.append(ObjectId(user_id))
    except Exception:
        pass
    return {"$or": [{field: value} for field in owner_fields for value in values]}


def creator_records(collection, owner_fields):
    return [serialize_document(record) for record in collection.find(
        creator_owned_query(owner_fields)
    ).sort("_id", DESCENDING).limit(200)]


@app.get("/api/health")
def health():
    try:
        mongo_client.admin.command("ping")
        return jsonify({"status": "ok", "database": "connected"}), 200
    except PyMongoError:
        app.logger.exception("MongoDB health check failed")
        return jsonify({"status": "error", "database": "disconnected"}), 503


# Authentication
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
        user = {"name": name, "email": email, "password_hash": generate_password_hash(password),
                "role": role, "auth_provider": "password", "created_at": utc_now()}
        result = users_collection.insert_one(user)
        user["_id"] = result.inserted_id
        if role == "creator":
            ensure_creator_listing(user)
        establish_session(user)
        return jsonify({"message": "Registration successful.", "user": public_user(user)}), 201
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
    if not user or not check_password_hash(user.get("password_hash", ""), password):
        return error_response("Invalid email or password.", 401)
    if required_role and user.get("role") != required_role:
        return error_response("This account cannot use this login.", 403)
    establish_session(user)
    return jsonify({"message": "Login successful.", "user": public_user(user)}), 200


@app.post("/api/auth/login")
def login():
    return authenticate_password(request.get_json(silent=True) or {})


@app.post("/api/auth/admin/login")
def admin_login():
    return authenticate_password(request.get_json(silent=True) or {}, required_role="admin")


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
        google_user = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)
        email = str(google_user.get("email", "")).strip().lower()
        name = str(google_user.get("name", "")).strip()
        if not email or not google_user.get("email_verified", False):
            return error_response("Google email could not be verified.", 401)
        user = users_collection.find_one({"email": email})
        if user:
            if user.get("role") != role:
                return error_response("This email is already registered with a different role.", 403)
        else:
            user = {"name": name or email.split("@")[0], "email": email, "role": role,
                    "auth_provider": "google", "created_at": utc_now()}
            result = users_collection.insert_one(user)
            user["_id"] = result.inserted_id
        if role == "creator":
            ensure_creator_listing(user)
        establish_session(user)
        return jsonify({"message": "Google sign-in successful.", "user": public_user(user)}), 200
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


# Creator profile
CREATOR_PROFILE_FIELDS = {"bio": 1000, "niche": 200, "location": 200, "profile_image_url": 1000,
                          "instagram": 300, "youtube": 300, "tiktok": 300, "website": 500}
CREATOR_PROFILE_LIST_FIELDS = {"skills": 30, "languages": 20, "portfolio_links": 20}


def get_creator_profile_document(user_id):
    return creator_profiles_collection.find_one({"user_id": user_id})


def serialize_creator_profile(profile, user):
    profile = profile or {}
    return {"user_id": str(user["_id"]), "name": user.get("name", ""), "email": user.get("email", ""),
            **{field: profile.get(field, "") for field in CREATOR_PROFILE_FIELDS},
            **{field: profile.get(field, []) for field in CREATOR_PROFILE_LIST_FIELDS},
            "created_at": profile.get("created_at").isoformat() if isinstance(profile.get("created_at"), datetime) else None,
            "updated_at": profile.get("updated_at").isoformat() if isinstance(profile.get("updated_at"), datetime) else None}


@app.get("/api/creator/profile")
@roles_required("creator")
def get_my_creator_profile():
    user = get_current_user()
    try:
        return jsonify({"profile": serialize_creator_profile(get_creator_profile_document(current_user_id()), user)}), 200
    except PyMongoError:
        app.logger.exception("Failed to load creator profile")
        return error_response("Unable to load creator profile.", 500)


@app.put("/api/creator/profile")
@roles_required("creator")
def update_my_creator_profile():
    user = get_current_user()
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A valid JSON object is required.")
    updates = {}

    # The current creator profile form includes name and email. Keep those
    # account fields in the users collection, not in creator_profiles.
    account_updates = {}
    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            return error_response("name must be non-empty text.")
        if len(name.strip()) > 120:
            return error_response("name must be 120 characters or fewer.")
        account_updates["name"] = name.strip()
    if "email" in data:
        email = data["email"]
        if not isinstance(email, str) or not email.strip() or "@" not in email:
            return error_response("A valid email is required.")
        email = email.strip().lower()
        duplicate = users_collection.find_one({
            "email": email, "_id": {"$ne": ObjectId(current_user_id())}
        })
        if duplicate:
            return error_response("That email is already in use.", 409)
        account_updates["email"] = email
    if account_updates:
        users_collection.update_one(
            {"_id": ObjectId(current_user_id())}, {"$set": account_updates}
        )
        user = get_current_user()

    for field, max_length in CREATOR_PROFILE_FIELDS.items():
        if field not in data:
            continue
        value = data[field]
        if not isinstance(value, str):
            return error_response(f"{field} must be text.")
        value = value.strip()
        if len(value) > max_length:
            return error_response(f"{field} must be {max_length} characters or fewer.")
        updates[field] = value
    for field, max_items in CREATOR_PROFILE_LIST_FIELDS.items():
        if field not in data:
            continue
        value = data[field]
        if not isinstance(value, list):
            return error_response(f"{field} must be a list.")
        if len(value) > max_items:
            return error_response(f"{field} cannot contain more than {max_items} items.")
        cleaned = []
        for item in value:
            if not isinstance(item, str):
                return error_response(f"Every item in {field} must be text.")
            item = item.strip()
            if item:
                if len(item) > 500:
                    return error_response(f"Items in {field} must be 500 characters or fewer.")
                cleaned.append(item)
        updates[field] = cleaned
    now = utc_now()
    try:
        creator_profiles_collection.update_one({"user_id": current_user_id()},
            {"$set": {**updates, "user_id": current_user_id(), "updated_at": now},
             "$setOnInsert": {"created_at": now}}, upsert=True)
        saved_profile = get_creator_profile_document(current_user_id())
        ensure_creator_listing(user, saved_profile)
        return jsonify({"message": "Creator profile saved successfully.",
                        "profile": serialize_creator_profile(saved_profile, user)}), 200
    except PyMongoError:
        app.logger.exception("Failed to save creator profile")
        return error_response("Unable to save creator profile.", 500)


# Marketplace creator listings
@app.get("/api/creators")
def get_creators():
    try:
        items = list(creators_collection.find({}).sort("_id", DESCENDING))
        return jsonify({"creators": [serialize_document(item) for item in items]}), 200
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
        creator = {key: value for key, value in data.items() if key not in ("_id", "id")}
        creator.update({"name": name, "handle": handle, "created_at": utc_now()})
        result = creators_collection.insert_one(creator)
        creator["_id"] = result.inserted_id
        return jsonify({"message": "Creator created successfully.", "creator": serialize_document(creator)}), 201
    except PyMongoError:
        app.logger.exception("Failed to create creator")
        return error_response("Unable to create creator.", 500)


# Brand invitations
@app.get("/api/invitations")
@roles_required("brand")
def get_invitations():
    try:
        items = list(invitations_collection.find({"brand_id": current_user_id()}).sort("created_at", DESCENDING))
        return jsonify({"invitations": [serialize_document(item) for item in items]}), 200
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
        creator_user = resolve_creator_account(creator)
        if not creator_user:
            return error_response("This marketplace listing is not linked to a creator login account yet. An admin must link the listing to the creator account before invitations can be delivered.", 409)
        brand_id = current_user_id()
        creator_user_id = str(creator_user["_id"])
        existing = invitations_collection.find_one({"brand_id": brand_id, "creator_user_id": creator_user_id,
                                                     "status": {"$ne": "cancelled"}})
        if existing:
            return jsonify({"message": "You have already invited this creator.",
                            "invitation": serialize_document(existing)}), 200
        now = utc_now()
        brand = users_collection.find_one({"_id": ObjectId(brand_id)})
        invitation = {"brand_id": brand_id, "brand_name": brand.get("name", "") if brand else "Brand",
                      "creator_id": creator_id, "creator_user_id": creator_user_id,
                      "creator_name": creator.get("name", creator_user.get("name", "Creator")),
                      "message": str(data.get("message", "")).strip(), "status": "pending",
                      "created_at": now, "updated_at": now}
        result = invitations_collection.insert_one(invitation)
        invitation["_id"] = result.inserted_id
        notifications_collection.insert_one({"user_id": creator_user_id, "type": "invitation",
            "title": "New brand invitation", "message": f'{invitation["brand_name"]} invited you to collaborate.',
            "invitation_id": str(result.inserted_id), "read": False, "created_at": now})
        notifications_collection.insert_one({"user_id": brand_id, "type": "invitation",
            "title": "Invitation created", "message": f'Your invitation to {invitation["creator_name"]} was saved.',
            "invitation_id": str(result.inserted_id), "read": False, "created_at": now})
        return jsonify({"message": "Invitation created successfully.", "invitation": serialize_document(invitation)}), 201
    except PyMongoError:
        app.logger.exception("Failed to create invitation")
        return error_response("Unable to create invitation.", 500)


# Creator workspace API
@app.get("/api/creator/invitations")
@roles_required("creator")
def creator_get_invitations():
    try:
        uid = current_user_id()
        items = list(invitations_collection.find({"$or": [{"creator_user_id": uid}, {"creator_id": uid}]}).sort("created_at", DESCENDING).limit(200))
        for item in items:
            if not item.get("brand_name") and item.get("brand_id"):
                try:
                    brand = users_collection.find_one({"_id": ObjectId(str(item["brand_id"]))})
                except Exception:
                    brand = None
                if brand:
                    item["brand_name"] = brand.get("name", "Brand")
        return jsonify({"invitations": [serialize_document(item) for item in items]}), 200
    except PyMongoError:
        app.logger.exception("Failed to load creator invitations")
        return error_response("Unable to load creator invitations.", 500)


@app.patch("/api/creator/invitations/<invitation_id>")
@roles_required("creator")
def creator_update_invitation(invitation_id):
    if not ObjectId.is_valid(invitation_id):
        return error_response("Invalid invitation ID.")
    data = request.get_json(silent=True) or {}
    action = str(data.get("action", "")).strip().lower()
    statuses = {"accept": "accepted", "decline": "declined"}
    if action not in statuses:
        return error_response("Action must be 'accept' or 'decline'.")
    uid = current_user_id()
    try:
        invitation = invitations_collection.find_one({"_id": ObjectId(invitation_id),
            "$or": [{"creator_user_id": uid}, {"creator_id": uid}], "status": "pending"})
        if not invitation:
            return error_response("Pending invitation not found for your account.", 404)
        now = utc_now()
        new_status = statuses[action]
        invitations_collection.update_one({"_id": invitation["_id"], "status": "pending"},
            {"$set": {"status": new_status, "updated_at": now}})
        brand_id = str(invitation.get("brand_id", ""))
        if brand_id:
            notifications_collection.insert_one({"user_id": brand_id, "title": "Creator invitation response",
                "message": f'The creator {new_status} your invitation.', "type": "invitation_response",
                "invitation_id": invitation_id, "read": False, "created_at": now})
        updated = invitations_collection.find_one({"_id": invitation["_id"]})
        return jsonify({"message": f"Invitation {new_status}.", "invitation": serialize_document(updated)}), 200
    except PyMongoError:
        app.logger.exception("Failed to update creator invitation")
        return error_response("Unable to update invitation.", 500)


@app.get("/api/creator/projects")
@roles_required("creator")
def creator_get_projects():
    try:
        return jsonify({"projects": creator_records(projects_collection,
            ["creator_user_id", "assigned_creator_id", "creator_id"])}), 200
    except PyMongoError:
        app.logger.exception("Failed to load creator projects")
        return error_response("Unable to load creator projects.", 500)


@app.get("/api/creator/reviews")
@roles_required("creator")
def creator_get_reviews():
    try:
        return jsonify({"reviews": creator_records(reviews_collection, ["creator_user_id", "creator_id"])}), 200
    except PyMongoError:
        app.logger.exception("Failed to load creator reviews")
        return error_response("Unable to load creator reviews.", 500)


@app.get("/api/creator/earnings")
@roles_required("creator")
def creator_get_earnings():
    try:
        items = creator_records(earnings_collection, ["creator_user_id", "creator_id"])
        total = 0.0
        for item in items:
            if str(item.get("status", "")).lower() in {"available", "paid", "paid_out"}:
                try:
                    total += float(item.get("amount", item.get("net_amount", 0)) or 0)
                except (TypeError, ValueError):
                    pass
        return jsonify({"earnings": items, "total": round(total, 2)}), 200
    except PyMongoError:
        app.logger.exception("Failed to load creator earnings")
        return error_response("Unable to load creator earnings.", 500)


# Campaigns
@app.get("/api/campaigns")
@roles_required("brand")
def get_campaigns():
    try:
        items = list(campaigns_collection.find({"brand_id": current_user_id()}).sort("updated_at", DESCENDING))
        return jsonify({"campaigns": [serialize_document(item) for item in items]}), 200
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
        budget = float(data.get("budget") or 0)
        if budget < 0:
            return error_response("Budget cannot be negative.")
        now = utc_now()
        item = {"brand_id": current_user_id(), "name": name,
            "description": str(data.get("description", "")).strip(),
            "platform": str(data.get("platform", "")).strip(), "budget": budget,
            "goal": str(data.get("goal", "")).strip(), "status": "draft",
            "created_at": now, "updated_at": now}
        result = campaigns_collection.insert_one(item)
        item["_id"] = result.inserted_id
        notifications_collection.insert_one({"user_id": current_user_id(), "type": "campaign",
            "title": "Campaign created", "message": f'Campaign "{name}" was saved as a draft.',
            "read": False, "created_at": now})
        return jsonify({"message": "Campaign created successfully.", "campaign": serialize_document(item)}), 201
    except (PyMongoError, TypeError, ValueError):
        app.logger.exception("Failed to create campaign")
        return error_response("Unable to save campaign. Check the budget value.", 400)


# Creative briefs
@app.get("/api/briefs")
@roles_required("brand")
def get_briefs():
    try:
        items = list(briefs_collection.find({"brand_id": current_user_id()}).sort("updated_at", DESCENDING))
        return jsonify({"briefs": [serialize_document(item) for item in items]}), 200
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
        budget = float(data.get("budget") or 0)
        if budget < 0:
            return error_response("Budget cannot be negative.")
        now = utc_now()
        item = {"brand_id": current_user_id(), "title": title,
            "description": str(data.get("description", "")).strip(),
            "deliverables": str(data.get("deliverables", "")).strip(),
            "audience": str(data.get("audience", "")).strip(), "budget": budget,
            "deadline": str(data.get("deadline", "")).strip(), "status": "draft",
            "created_at": now, "updated_at": now}
        result = briefs_collection.insert_one(item)
        item["_id"] = result.inserted_id
        return jsonify({"message": "Brief saved successfully.", "brief": serialize_document(item)}), 201
    except (PyMongoError, TypeError, ValueError):
        app.logger.exception("Failed to create brief")
        return error_response("Unable to save brief. Check the budget value.", 400)


# Saved creators
@app.get("/api/saved-creators")
@roles_required("brand")
def get_saved_creators():
    try:
        items = list(saved_creators_collection.find({"brand_id": current_user_id()}).sort("created_at", DESCENDING))
        return jsonify({"saved_creators": [serialize_document(item) for item in items]}), 200
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
        query = {"brand_id": current_user_id(), "creator_id": creator_id}
        saved_creators_collection.update_one(query, {"$setOnInsert": {**query,
            "creator_name": creator.get("name", ""), "created_at": utc_now()}}, upsert=True)
        return jsonify({"message": "Creator saved successfully."}), 200
    except PyMongoError:
        app.logger.exception("Failed to save creator")
        return error_response("Unable to save creator.", 500)


@app.delete("/api/saved-creators/<creator_id>")
@roles_required("brand")
def unsave_creator(creator_id):
    try:
        saved_creators_collection.delete_one({"brand_id": current_user_id(), "creator_id": creator_id})
        return jsonify({"message": "Creator removed from saved list."}), 200
    except PyMongoError:
        app.logger.exception("Failed to remove saved creator")
        return error_response("Unable to update saved creators.", 500)


# Brand-side messages (kept separate from creator workspace access)
@app.get("/api/messages")
@roles_required("brand")
def get_messages():
    query = {"brand_id": current_user_id()}
    creator_id = request.args.get("creator_id", "").strip()
    if creator_id:
        query["creator_id"] = creator_id
    try:
        items = list(messages_collection.find(query).sort("created_at", DESCENDING).limit(500))
        return jsonify({"messages": [serialize_document(item) for item in items]}), 200
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
        item = {"brand_id": current_user_id(), "creator_id": creator_id,
            "creator_name": creator.get("name", ""), "sender_role": "brand",
            "message": body, "created_at": utc_now()}
        result = messages_collection.insert_one(item)
        item["_id"] = result.inserted_id
        return jsonify({"message": "Message saved successfully.", "item": serialize_document(item)}), 201
    except PyMongoError:
        app.logger.exception("Failed to save message")
        return error_response("Unable to send message.", 500)


# Notifications
@app.get("/api/notifications")
@login_required
def get_notifications():
    try:
        items = list(notifications_collection.find({"user_id": current_user_id()}).sort("created_at", DESCENDING).limit(100))
        return jsonify({"notifications": [serialize_document(item) for item in items]}), 200
    except PyMongoError:
        app.logger.exception("Failed to load notifications")
        return error_response("Unable to load notifications.", 500)


@app.post("/api/notifications/read")
@login_required
def mark_notifications_read():
    try:
        notifications_collection.update_many({"user_id": current_user_id(), "read": False}, {"$set": {"read": True}})
        return jsonify({"message": "Notifications marked as read."}), 200
    except PyMongoError:
        app.logger.exception("Failed to update notifications")
        return error_response("Unable to update notifications.", 500)


# Admin dashboard APIs. Every endpoint below is protected by the admin role.
@app.get("/api/admin/overview")
@roles_required("admin")
def admin_overview():
    try:
        statuses = {"pending": 0, "accepted": 0, "declined": 0}
        total_invitations = invitations_collection.count_documents({})
        for item in invitations_collection.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]):
            if item.get("_id") in statuses:
                statuses[item["_id"]] = item.get("count", 0)
        total_users = users_collection.count_documents({})
        creator_users = users_collection.count_documents({"role": "creator"})
        brand_users = users_collection.count_documents({"role": "brand"})
        admin_users = users_collection.count_documents({"role": "admin"})
        total_listings = creators_collection.count_documents({})
        linked_listings = 0
        for listing in creators_collection.find({}, {"creator_user_id": 1, "user_id": 1, "account_id": 1, "email": 1, "account_link_disabled": 1}):
            if resolve_creator_account(listing):
                linked_listings += 1
        return jsonify({"overview": {
            "total_users": total_users, "creator_users": creator_users,
            "brand_users": brand_users, "admin_users": admin_users,
            "total_listings": total_listings, "linked_listings": linked_listings,
            "unlinked_listings": max(total_listings - linked_listings, 0),
            "total_invitations": total_invitations,
            "pending_invitations": statuses["pending"],
            "accepted_invitations": statuses["accepted"],
            "declined_invitations": statuses["declined"],
            "total_campaigns": campaigns_collection.count_documents({}),
        }}), 200
    except PyMongoError:
        app.logger.exception("Failed to load admin overview")
        return error_response("Unable to load admin overview.", 500)


@app.get("/api/admin/users")
@roles_required("admin")
def admin_get_users():
    role = str(request.args.get("role", "")).strip().lower()
    search = str(request.args.get("search", "")).strip()
    query = {}
    if role in ("creator", "brand", "admin"):
        query["role"] = role
    if search:
        escaped = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": escaped, "$options": "i"}},
            {"email": {"$regex": escaped, "$options": "i"}},
            {"role": {"$regex": escaped, "$options": "i"}},
        ]
    try:
        items = list(users_collection.find(query, {"password_hash": 0}).sort("created_at", DESCENDING).limit(1000))
        return jsonify({"users": [serialize_document(item) for item in items]}), 200
    except PyMongoError:
        app.logger.exception("Failed to load admin users")
        return error_response("Unable to load users.", 500)


@app.get("/api/admin/creators/listings")
@roles_required("admin")
def admin_get_creator_listings():
    try:
        listings = []
        for listing in creators_collection.find({}).sort("_id", DESCENDING).limit(1000):
            item = serialize_document(listing)
            account = resolve_creator_account(listing)
            item["linked_user"] = public_user(account) if account else None
            item["linked_user_id"] = str(account["_id"]) if account else ""
            listings.append(item)
        accounts = list(users_collection.find({"role": "creator"}, {"password_hash": 0}).sort("created_at", DESCENDING).limit(1000))
        return jsonify({"listings": listings, "creator_accounts": [serialize_document(item) for item in accounts]}), 200
    except PyMongoError:
        app.logger.exception("Failed to load admin creator listings")
        return error_response("Unable to load creator listings.", 500)


@app.post("/api/admin/creators/<listing_id>/link")
@roles_required("admin")
def admin_link_creator_listing(listing_id):
    data = request.get_json(silent=True) or {}
    creator_user_id = str(data.get("creator_user_id", "")).strip()
    if not ObjectId.is_valid(creator_user_id):
        return error_response("Choose a valid registered creator account.")
    try:
        listing = find_creator(listing_id)
        if not listing:
            return error_response("Marketplace listing was not found.", 404)
        account = users_collection.find_one({"_id": ObjectId(creator_user_id), "role": "creator"})
        if not account:
            return error_response("The selected account is not a registered creator.", 400)
        other = creators_collection.find_one({"_id": {"$ne": listing["_id"]}, "$or": [
            {"creator_user_id": creator_user_id}, {"user_id": creator_user_id}, {"account_id": creator_user_id},
            {"creator_user_id": account["_id"]}, {"user_id": account["_id"]}, {"account_id": account["_id"]},
        ]})
        if other:
            return error_response("This creator account is already linked to another marketplace listing.", 409)
        now = utc_now()
        updates = {"creator_user_id": creator_user_id, "user_id": creator_user_id,
            "account_id": creator_user_id, "account_link_disabled": False,
            "linked_at": now, "linked_by": current_user_id(), "updated_at": now}
        if not str(listing.get("email", "")).strip():
            updates["email"] = account.get("email", "")
        if not str(listing.get("name", "")).strip():
            updates["name"] = account.get("name", "Creator")
        creators_collection.update_one({"_id": listing["_id"]}, {"$set": updates})
        updated = creators_collection.find_one({"_id": listing["_id"]})
        return jsonify({"message": "Marketplace listing linked to the creator account successfully.", "listing": serialize_document(updated)}), 200
    except PyMongoError:
        app.logger.exception("Failed to link creator listing")
        return error_response("Unable to link creator listing.", 500)


@app.post("/api/admin/creators/<listing_id>/unlink")
@roles_required("admin")
def admin_unlink_creator_listing(listing_id):
    try:
        listing = find_creator(listing_id)
        if not listing:
            return error_response("Marketplace listing was not found.", 404)
        creators_collection.update_one({"_id": listing["_id"]}, {
            "$set": {"account_link_disabled": True, "updated_at": utc_now(), "unlinked_by": current_user_id()},
            "$unset": {"creator_user_id": "", "user_id": "", "account_id": "", "linked_at": "", "linked_by": ""},
        })
        return jsonify({"message": "Marketplace listing unlinked. Invitations to this listing will be blocked until it is linked again."}), 200
    except PyMongoError:
        app.logger.exception("Failed to unlink creator listing")
        return error_response("Unable to unlink creator listing.", 500)


@app.get("/api/admin/invitations")
@roles_required("admin")
def admin_get_invitations():
    try:
        items = list(invitations_collection.find({}).sort("created_at", DESCENDING).limit(2000))
        user_cache = {}
        output = []
        for invitation in items:
            item = serialize_document(invitation)
            for field, id_field, fallback in (("brand_name", "brand_id", "Brand"), ("creator_name", "creator_user_id", "Creator")):
                if not item.get(field) and item.get(id_field):
                    key = str(item[id_field])
                    if key not in user_cache:
                        try:
                            user_cache[key] = users_collection.find_one({"_id": ObjectId(key)})
                        except Exception:
                            user_cache[key] = None
                    found = user_cache[key]
                    item[field] = found.get("name", fallback) if found else fallback
            output.append(item)
        return jsonify({"invitations": output}), 200
    except PyMongoError:
        app.logger.exception("Failed to load admin invitations")
        return error_response("Unable to load invitations.", 500)


# Account settings
@app.get("/api/settings")
@login_required
def get_settings():
    return jsonify({"settings": public_user(get_current_user())}), 200


@app.patch("/api/settings")
@login_required
def update_settings():
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    if not name or not email:
        return error_response("Name and email are required.")
    try:
        duplicate = users_collection.find_one({"email": email, "_id": {"$ne": ObjectId(current_user_id())}})
        if duplicate:
            return error_response("That email is already in use.", 409)
        users_collection.update_one({"_id": ObjectId(current_user_id())}, {"$set": {"name": name, "email": email}})
        return jsonify({"message": "Settings updated successfully.", "settings": public_user(get_current_user())}), 200
    except PyMongoError:
        app.logger.exception("Failed to update settings")
        return error_response("Unable to update settings.", 500)


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
        users_collection.insert_one({"name": name, "email": email,
            "password_hash": generate_password_hash(password), "role": "admin",
            "auth_provider": "password", "created_at": utc_now()})
        print("Admin account created successfully.")
    except PyMongoError as error:
        print(f"Could not create admin account: {error}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "create-admin":
        create_admin_account()
    else:
        app.run(host="127.0.0.1", port=5000, debug=True)
