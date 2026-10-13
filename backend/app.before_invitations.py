
import os
import re
import sys
from datetime import timedelta
from functools import wraps
from getpass import getpass

from dotenv import load_dotenv
from flask import Flask, jsonify, request, session
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import PyMongoError
from werkzeug.security import check_password_hash, generate_password_hash

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


load_dotenv()

app = Flask(__name__)

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is missing. Add it to D:\\Linkfluence\\backend\\.env"
    )

app.config.update(
    SECRET_KEY=SECRET_KEY,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=(
        os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
    ),
    PERMANENT_SESSION_LIFETIME=timedelta(hours=12),
)


CORS(
    app,
    resources={r"/api/*": {
        "origins": [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5174",
        ]
    }},
    supports_credentials=True,
)


MONGODB_URI = os.getenv(
    "MONGODB_URI",
    "mongodb://localhost:27017/",
)
MONGODB_DB = os.getenv("MONGODB_DB", "linkfluence")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=3000,
)
db = client[MONGODB_DB]

PUBLIC_ROLES = {"creator", "brand"}


def error_response(message, status=400):
    return jsonify({
        "success": False,
        "message": message,
    }), status


def normalize_email(value):
    if not isinstance(value, str):
        return ""
    return value.strip().lower()


def public_user(user):
    """Return safe user information; never expose password hashes."""
    return {
        "id": str(user["_id"]),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "auth_provider": user.get("auth_provider", "password"),
    }


def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None

    from bson import ObjectId
    from bson.errors import InvalidId

    try:
        user = db.users.find_one({"_id": ObjectId(user_id)})
    except (InvalidId, TypeError):
        session.clear()
        return None

    if not user:
        session.clear()
        return None

    return user


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()

        if not user:
            return error_response("Please log in first.", 401)

        return view(*args, **kwargs)

    return wrapped


def roles_required(*allowed_roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()

            if not user:
                return error_response("Please log in first.", 401)

            if user.get("role") not in allowed_roles:
                return error_response(
                    "You do not have permission to access this resource.",
                    403,
                )

            return view(*args, **kwargs)

        return wrapped
    return decorator


def establish_session(user):
    session.clear()
    session.permanent = True
    session["user_id"] = str(user["_id"])


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
        "message": "Welcome to the Linkfluence API",
    })


@app.get("/api/health")
def health():
    try:
        client.admin.command("ping")

        return jsonify({
            "status": "ok",
            "app": "Linkfluence API",
            "database": MONGODB_DB,
            "database_status": "connected",
        }), 200

    except PyMongoError:
        app.logger.exception("Database health check failed")

        return jsonify({
            "status": "error",
            "app": "Linkfluence API",
            "database": MONGODB_DB,
            "database_status": "disconnected",
        }), 503


# ---------------------------------------------------------
# AUTHENTICATION: PUBLIC REGISTRATION
# ---------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response("Request must contain a JSON object.")

    name = data.get("name")
    email = normalize_email(data.get("email"))
    password = data.get("password")
    role = data.get("role")

    if not isinstance(name, str) or not name.strip():
        return error_response("Please enter your name.")

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return error_response("Please enter a valid email address.")

    if not isinstance(password, str) or len(password) < 8:
        return error_response(
            "Password must contain at least 8 characters."
        )

    # Admin is deliberately excluded from public registration.
    if role not in PUBLIC_ROLES:
        return error_response(
            "Choose either the Creator or Brand/Agency role."
        )

    try:
        existing = db.users.find_one({"email": email})

        if existing:
            return error_response(
                "An account with this email already exists. Please log in.",
                409,
            )

        user = {
            "name": name.strip(),
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": role,
            "auth_provider": "password",
        }

        result = db.users.insert_one(user)
        user["_id"] = result.inserted_id

        establish_session(user)

        return jsonify({
            "success": True,
            "message": "Account created successfully.",
            "user": public_user(user),
        }), 201

    except PyMongoError:
        app.logger.exception("Registration failed")
        return error_response("Could not create your account.", 500)


# ---------------------------------------------------------
# AUTHENTICATION: EMAIL AND PASSWORD LOGIN
# ---------------------------------------------------------

def perform_password_login(data, required_role):
    if not isinstance(data, dict):
        return error_response("Request must contain a JSON object.")

    email = normalize_email(data.get("email"))
    password = data.get("password")

    if not email or not isinstance(password, str) or not password:
        return error_response("Email and password are required.")

    try:
        user = db.users.find_one({"email": email})

        if (
            not user
            or not user.get("password_hash")
            or not check_password_hash(user["password_hash"], password)
        ):
            return error_response("Invalid email or password.", 401)

        if user.get("role") != required_role:
            return error_response(
                "This account cannot use this login page.",
                403,
            )

        establish_session(user)

        return jsonify({
            "success": True,
            "message": "Login successful.",
            "user": public_user(user),
        }), 200

    except PyMongoError:
        app.logger.exception("Login failed")
        return error_response("Could not log you in.", 500)


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response("Request must contain a JSON object.")

    role = data.get("role")

    if role not in PUBLIC_ROLES:
        return error_response(
            "Choose either the Creator or Brand/Agency login page."
        )

    return perform_password_login(data, role)


@app.post("/api/auth/admin/login")
def admin_login():
    # This endpoint never accepts creator or brand accounts.
    return perform_password_login(
        request.get_json(silent=True),
        "admin",
    )


# ---------------------------------------------------------
# AUTHENTICATION: GOOGLE SIGN-IN
# ---------------------------------------------------------

@app.post("/api/auth/google")
def google_login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response("Request must contain a JSON object.")

    role = data.get("role")
    credential = data.get("credential")

    if role not in PUBLIC_ROLES:
        return error_response(
            "Google sign-in is available only for Creator and Brand/Agency."
        )

    if not GOOGLE_CLIENT_ID:
        return error_response(
            "Google sign-in is not configured on the server.",
            503,
        )

    if not isinstance(credential, str) or not credential:
        return error_response("Google credential is missing.")

    try:
        google_user = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )

        email = normalize_email(google_user.get("email"))
        email_verified = google_user.get("email_verified") is True
        name = google_user.get("name") or email.split("@")[0]

        if not email or not email_verified:
            return error_response(
                "Google must provide a verified email address.",
                401,
            )

        user = db.users.find_one({"email": email})

        if user:
            # Google sign-in must never change an existing account's role.
            if user.get("role") != role:
                return error_response(
                    "This email is registered with a different account role.",
                    403,
                )
        else:
            user = {
                "name": name,
                "email": email,
                "role": role,
                "auth_provider": "google",
                "google_sub": google_user.get("sub"),
            }

            result = db.users.insert_one(user)
            user["_id"] = result.inserted_id

        establish_session(user)

        return jsonify({
            "success": True,
            "message": "Google sign-in successful.",
            "user": public_user(user),
        }), 200

    except ValueError:
        return error_response("Google credential is invalid or expired.", 401)

    except PyMongoError:
        app.logger.exception("Google sign-in database error")
        return error_response("Could not complete Google sign-in.", 500)


# ---------------------------------------------------------
# AUTHENTICATION: CURRENT USER AND LOGOUT
# ---------------------------------------------------------

@app.get("/api/auth/me")
@login_required
def auth_me():
    user = current_user()

    return jsonify({
        "success": True,
        "user": public_user(user),
    }), 200


@app.post("/api/auth/logout")
def logout():
    session.clear()

    response = jsonify({
        "success": True,
        "message": "Logged out successfully.",
    })
    response.delete_cookie(
        app.config["SESSION_COOKIE_NAME"],
        path="/",
        samesite=app.config["SESSION_COOKIE_SAMESITE"],
    )
    return response, 200


# ---------------------------------------------------------
# ROLE-PROTECTED TEST ENDPOINTS
# These confirm backend role enforcement.
# ---------------------------------------------------------

@app.get("/api/creator/dashboard")
@roles_required("creator")
def creator_dashboard():
    return jsonify({
        "success": True,
        "message": "Creator access confirmed.",
    }), 200


@app.get("/api/brand/dashboard")
@roles_required("brand")
def brand_dashboard():
    return jsonify({
        "success": True,
        "message": "Brand/Agency access confirmed.",
    }), 200


@app.get("/api/admin/dashboard")
@roles_required("admin")
def admin_dashboard():
    return jsonify({
        "success": True,
        "message": "Admin access confirmed.",
    }), 200


# ---------------------------------------------------------
# EXISTING CREATOR API - PRESERVED
# ---------------------------------------------------------

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
            ],
        }), 200

    except PyMongoError:
        app.logger.exception("Could not retrieve creators")

        return jsonify({
            "success": False,
            "message": "Could not retrieve creators",
        }), 500


@app.post("/api/creators")
def create_creator():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return error_response(
            "Request must contain a JSON object."
        )

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
            "missing_fields": missing_fields,
        }), 400

    for field in ["name", "handle", "role", "location"]:
        if (
            not isinstance(data[field], str)
            or not data[field].strip()
        ):
            return error_response(
                f"{field} must be a non-empty string."
            )

    rate = data["rate"]

    if (
        isinstance(rate, bool)
        or not isinstance(rate, (int, float))
        or rate <= 0
    ):
        return error_response("rate must be a positive number.")

    if (
        not isinstance(data["tags"], list)
        or not all(
            isinstance(tag, str) and tag.strip()
            for tag in data["tags"]
        )
    ):
        return error_response(
            "tags must be a list of non-empty strings."
        )

    name = data["name"].strip()
    handle = data["handle"].strip()

    try:
        existing_creator = db.creators.find_one({
            "handle": handle,
        })

        if existing_creator:
            return error_response(
                "A creator with this handle already exists.",
                409,
            )

        initials = "".join(
            part[0] for part in name.split()[:2]
        ).upper()

        creator = {
            "name": name,
            "handle": handle,
            "role": data["role"].strip(),
            "location": data["location"].strip(),
            "rate": rate,
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
            "creator": serialize_creator(creator),
        }), 201

    except PyMongoError:
        app.logger.exception("Could not create creator")

        return jsonify({
            "success": False,
            "message": "Could not save creator profile",
        }), 500


# ---------------------------------------------------------
# ONE-TIME ADMIN PROVISIONING COMMAND
# Run: python app.py create-admin
# ---------------------------------------------------------

def create_admin():
    print("Linkfluence Admin Account Setup")
    print("This command creates an admin account in MongoDB.")

    email = normalize_email(input("Admin email: "))

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        print("Invalid email address.")
        return

    password = getpass("New admin password (minimum 12 characters): ")

    if len(password) < 12:
        print("Admin password must contain at least 12 characters.")
        return

    confirm = getpass("Confirm admin password: ")

    if password != confirm:
        print("Passwords do not match.")
        return

    try:
        existing = db.users.find_one({"email": email})

        if existing:
            print(
                "That email already has an account. "
                "No account was changed."
            )
            return

        user = {
            "name": "Linkfluence Admin",
            "email": email,
            "password_hash": generate_password_hash(password),
            "role": "admin",
            "auth_provider": "password",
        }

        db.users.insert_one(user)
        print("Admin account created successfully.")

    except PyMongoError:
        app.logger.exception("Admin provisioning failed")
        print("Could not create the admin account.")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "create-admin":
        create_admin()
    else:
        app.run(debug=True, port=5000)
