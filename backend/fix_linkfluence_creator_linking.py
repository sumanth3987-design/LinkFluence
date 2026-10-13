"""Safely patch Linkfluence backend creator/listing linking.

Copy this file beside backend/app.py, then run:
    python fix_linkfluence_creator_linking.py

The script creates app.py.backup before modifying app.py.
"""
from pathlib import Path
import re
import shutil
import sys

APP_PATH = Path(__file__).resolve().parent / "app.py"
if not APP_PATH.exists():
    print("ERROR: app.py was not found beside this script.")
    print("Copy this file to D:\\Linkfluence\\backend, then run it there.")
    sys.exit(1)

text = APP_PATH.read_text(encoding="utf-8")
original = text

# The inserted helper uses regex to generate unique marketplace handles.
if "\nimport re\n" not in text and not text.startswith("import re\n"):
    if "import os\n" in text:
        text = text.replace("import os\n", "import os\nimport re\n", 1)
    else:
        raise SystemExit("ERROR: Could not find the expected import section. No changes made.")

marker = "\n\ndef creator_owned_query(owner_fields, user_id=None):"
helper = '''


def ensure_creator_listing(user, profile=None):
    """Ensure a creator login owns a marketplace listing; safe to call repeatedly."""
    if not user or user.get("role") != "creator":
        return None
    user_id = str(user["_id"])
    email = str(user.get("email", "")).strip().lower()
    name = str(user.get("name", "Creator")).strip() or "Creator"

    listing = creators_collection.find_one({"$or": [
        {"creator_user_id": user_id}, {"user_id": user_id}, {"account_id": user_id},
        {"creator_user_id": user["_id"]}, {"user_id": user["_id"]}, {"account_id": user["_id"]},
    ]})
    if not listing and email:
        listing = creators_collection.find_one({"email": {"$regex": "^" + re.escape(email) + "$", "$options": "i"}})

    if listing:
        link_fields = {"creator_user_id": user_id, "user_id": user_id,
                       "account_id": user_id, "email": email, "name": name,
                       "updated_at": utc_now()}
        if profile:
            for field in ("bio", "niche", "location", "profile_image_url", "instagram",
                          "youtube", "tiktok", "website", "skills", "languages", "portfolio_links"):
                if field in profile:
                    link_fields[field] = profile[field]
        creators_collection.update_one({"_id": listing["_id"]}, {"$set": link_fields})
        listing.update(link_fields)
        return listing

    # No older listing matched: create a minimal, account-linked marketplace listing.
    base = re.sub(r"[^a-z0-9]+", "-", (email.split("@")[0] if email else name.lower())).strip("-") or "creator"
    handle = base[:45]
    suffix = 2
    while creators_collection.find_one({"handle": handle}):
        handle = f"{base[:40]}-{suffix}"
        suffix += 1
    listing = {"name": name, "handle": handle, "email": email,
               "creator_user_id": user_id, "user_id": user_id, "account_id": user_id,
               "bio": (profile or {}).get("bio", ""),
               "niche": (profile or {}).get("niche", ""),
               "location": (profile or {}).get("location", ""),
               "profile_image_url": (profile or {}).get("profile_image_url", ""),
               "instagram": (profile or {}).get("instagram", ""),
               "youtube": (profile or {}).get("youtube", ""),
               "tiktok": (profile or {}).get("tiktok", ""),
               "website": (profile or {}).get("website", ""),
               "skills": (profile or {}).get("skills", []),
               "languages": (profile or {}).get("languages", []),
               "portfolio_links": (profile or {}).get("portfolio_links", []),
               "created_at": utc_now(), "updated_at": utc_now()}
    result = creators_collection.insert_one(listing)
    listing["_id"] = result.inserted_id
    return listing
'''
if "def ensure_creator_listing(user, profile=None):" not in text:
    if marker not in text:
        raise SystemExit("ERROR: Could not find the expected creator helper insertion point. No changes made.")
    text = text.replace(marker, helper + marker, 1)

old = '''        user["_id"] = result.inserted_id
        establish_session(user)
        return jsonify({"message": "Registration successful.", "user": public_user(user)}), 201'''
new = '''        user["_id"] = result.inserted_id
        if role == "creator":
            ensure_creator_listing(user)
        establish_session(user)
        return jsonify({"message": "Registration successful.", "user": public_user(user)}), 201'''
if old in text:
    text = text.replace(old, new, 1)
elif 'if role == "creator":\n            ensure_creator_listing(user)' not in text:
    raise SystemExit("ERROR: Could not find the expected password registration block. No changes made.")

old = '''            result = users_collection.insert_one(user)
            user["_id"] = result.inserted_id
        establish_session(user)
        return jsonify({"message": "Google sign-in successful.", "user": public_user(user)}), 200'''
new = '''            result = users_collection.insert_one(user)
            user["_id"] = result.inserted_id
        if role == "creator":
            ensure_creator_listing(user)
        establish_session(user)
        return jsonify({"message": "Google sign-in successful.", "user": public_user(user)}), 200'''
if old in text:
    text = text.replace(old, new, 1)
elif 'if role == "creator":\n            ensure_creator_listing(user)' not in text:
    raise SystemExit("ERROR: Could not find the expected Google sign-in block. No changes made.")

old = '''        creator_profiles_collection.update_one({"user_id": current_user_id()},
            {"$set": {**updates, "user_id": current_user_id(), "updated_at": now},
             "$setOnInsert": {"created_at": now}}, upsert=True)
        return jsonify({"message": "Creator profile saved successfully.",
                        "profile": serialize_creator_profile(get_creator_profile_document(current_user_id()), user)}), 200'''
new = '''        creator_profiles_collection.update_one({"user_id": current_user_id()},
            {"$set": {**updates, "user_id": current_user_id(), "updated_at": now},
             "$setOnInsert": {"created_at": now}}, upsert=True)
        saved_profile = get_creator_profile_document(current_user_id()) or {}
        ensure_creator_listing(user, saved_profile)
        return jsonify({"message": "Creator profile saved successfully.",
                        "profile": serialize_creator_profile(saved_profile, user)}), 200'''
if old in text:
    text = text.replace(old, new, 1)
elif "ensure_creator_listing(user, saved_profile)" not in text:
    raise SystemExit("ERROR: Could not find the expected creator profile save block. No changes made.")

admin_marker = "\ndef create_admin_account():"
admin_routes = '''


# Admin repair tools for older marketplace listings that are not linked to creator accounts.
@app.get("/api/admin/creator-links")
@roles_required("admin")
def admin_get_creator_links():
    try:
        users = list(users_collection.find({"role": "creator"}, {"password_hash": 0}).sort("created_at", DESCENDING).limit(1000))
        listings = list(creators_collection.find({}).sort("_id", DESCENDING).limit(2000))
        linked = []
        unlinked = []
        for listing in listings:
            account = resolve_creator_account(listing)
            row = serialize_document(listing)
            row["linked_user"] = public_user(account) if account else None
            (linked if account else unlinked).append(row)
        return jsonify({
            "unlinked_listings": unlinked,
            "linked_listings": linked,
            "creator_accounts": [public_user(user) for user in users],
        }), 200
    except PyMongoError:
        app.logger.exception("Failed to load admin creator-link data")
        return error_response("Unable to load creator-link data.", 500)


@app.post("/api/admin/creator-links")
@roles_required("admin")
def admin_link_creator_listing():
    data = request.get_json(silent=True) or {}
    creator_id = str(data.get("creator_id", "")).strip()
    creator_user_id = str(data.get("creator_user_id", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    if not creator_id:
        return error_response("Marketplace creator_id is required.")
    try:
        listing = find_creator(creator_id)
        if not listing:
            return error_response("Marketplace listing was not found.", 404)
        if creator_user_id:
            try:
                creator_user = users_collection.find_one({"_id": ObjectId(creator_user_id), "role": "creator"})
            except Exception:
                creator_user = None
        elif email:
            creator_user = users_collection.find_one({"email": email, "role": "creator"})
        else:
            return error_response("Provide creator_user_id or the creator account email.")
        if not creator_user:
            return error_response("Creator login account was not found.", 404)
        user_id = str(creator_user["_id"])
        now = utc_now()
        creators_collection.update_one({"_id": listing["_id"]}, {"$set": {
            "creator_user_id": user_id, "user_id": user_id, "account_id": user_id,
            "email": creator_user.get("email", ""), "updated_at": now,
        }})
        return jsonify({"message": "Marketplace listing linked to creator account successfully.",
                        "creator": serialize_document(creators_collection.find_one({"_id": listing["_id"]})),
                        "user": public_user(creator_user)}), 200
    except PyMongoError:
        app.logger.exception("Failed to link marketplace listing to creator account")
        return error_response("Unable to link creator listing.", 500)
'''
if "def admin_get_creator_links():" not in text:
    if admin_marker not in text:
        raise SystemExit("ERROR: Could not find admin-route insertion point. No changes made.")
    text = text.replace(admin_marker, admin_routes + admin_marker, 1)

if text == original:
    print("No changes were needed; the creator-linking fix appears to be installed already.")
    sys.exit(0)

backup = APP_PATH.with_name("app.py.backup")
if not backup.exists():
    shutil.copy2(APP_PATH, backup)
APP_PATH.write_text(text, encoding="utf-8")
print("Creator-linking fix installed successfully.")
print(f"Original backup: {backup}")
print("Next: restart Flask, register a test creator (or log in and save their profile), then retry the brand invitation.")
print("Admin repair API: GET /api/admin/creator-links and POST /api/admin/creator-links")
