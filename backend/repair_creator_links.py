"""
Safely link a Linkfluence marketplace creator listing to a registered creator account.

Place this file in D:\\Linkfluence\\backend\\repair_creator_links.py and run:
    python repair_creator_links.py

This script does not modify app.py. It loads MongoDB settings from backend/.env,
shows marketplace listings and registered creator accounts, and requires an explicit
confirmation before changing a link.
"""
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.errors import PyMongoError


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "linkfluence")


def utc_now():
    return datetime.now(timezone.utc)


def as_text(value):
    return str(value or "").strip()


def resolve_linked_account(listing, users):
    if listing.get("account_link_disabled") is True:
        return None

    for field in ("creator_user_id", "user_id", "account_id"):
        value = listing.get(field)
        if value:
            try:
                account = users.find_one({
                    "_id": ObjectId(str(value)),
                    "role": "creator",
                })
            except Exception:
                account = None
            if account:
                return account

    email = as_text(listing.get("email")).lower()
    if email:
        return users.find_one({"email": email, "role": "creator"})
    return None


def main():
    print("\nLinkfluence — Creator Listing Link Repair")
    print("-----------------------------------------")
    print("Database:", MONGO_DB_NAME)
    print("This tool changes MongoDB link fields only; it does not edit app.py.\n")

    client = None
    try:
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
        client.admin.command("ping")
        db = client[MONGO_DB_NAME]
        users = db["users"]
        listings_collection = db["creators"]

        accounts = list(
            users.find({"role": "creator"}, {"password_hash": 0})
            .sort("created_at", -1)
            .limit(1000)
        )
        listings = list(listings_collection.find({}).sort("_id", -1).limit(1000))

        if not accounts:
            print("No registered creator accounts were found.")
            print("Register/log in with the intended creator account first.")
            return

        unlinked = [
            item for item in listings
            if not resolve_linked_account(item, users)
        ]

        print(f"Registered creator accounts: {len(accounts)}")
        print(f"Marketplace listings: {len(listings)}")
        print(f"Listings currently unresolved: {len(unlinked)}\n")

        if not unlinked:
            print("All marketplace listings currently resolve to creator accounts.")
            return

        print("UNLINKED MARKETPLACE LISTINGS")
        for index, item in enumerate(unlinked, start=1):
            print(
                f"[{index}] listing_id={item.get('_id')} | "
                f"name={as_text(item.get('name')) or '(no name)'} | "
                f"email={as_text(item.get('email')) or '(no email)'} | "
                f"handle={as_text(item.get('handle')) or '(no handle)'}"
            )

        print("\nREGISTERED CREATOR ACCOUNTS")
        for index, account in enumerate(accounts, start=1):
            print(
                f"[{index}] account_id={account.get('_id')} | "
                f"name={as_text(account.get('name')) or '(no name)'} | "
                f"email={as_text(account.get('email')) or '(no email)'}"
            )

        try:
            listing_choice = int(input("\nEnter the number of the listing to link: ").strip())
            account_choice = int(input("Enter the number of its matching creator account: ").strip())
        except ValueError:
            print("Cancelled: enter valid numbers.")
            return

        if not (1 <= listing_choice <= len(unlinked)):
            print("Cancelled: listing number is out of range.")
            return
        if not (1 <= account_choice <= len(accounts)):
            print("Cancelled: account number is out of range.")
            return

        listing = unlinked[listing_choice - 1]
        account = accounts[account_choice - 1]
        listing_id = listing["_id"]
        account_id = account["_id"]
        account_id_text = str(account_id)

        print("\nPLEASE VERIFY THIS MATCH")
        print(f"Listing: {as_text(listing.get('name'))} | {as_text(listing.get('email'))}")
        print(f"Account: {as_text(account.get('name'))} | {as_text(account.get('email'))}")

        listing_email = as_text(listing.get("email")).lower()
        account_email = as_text(account.get("email")).lower()
        if listing_email and account_email and listing_email != account_email:
            print("\nWARNING: The listing and account emails do not match.")
            print("Only continue if you have independently verified they belong together.")

        other = listings_collection.find_one({
            "_id": {"$ne": listing_id},
            "$or": [
                {"creator_user_id": account_id_text},
                {"user_id": account_id_text},
                {"account_id": account_id_text},
                {"creator_user_id": account_id},
                {"user_id": account_id},
                {"account_id": account_id},
            ],
        })
        if other:
            print(
                "\nCancelled: this account appears linked to another listing "
                f"(listing_id={other.get('_id')})."
            )
            return

        confirmation = input(
            "\nIf you verified the match, type LINK to continue: "
        ).strip()
        if confirmation != "LINK":
            print("Cancelled. No database changes were made.")
            return

        now = utc_now()
        updates = {
            "creator_user_id": account_id_text,
            "user_id": account_id_text,
            "account_id": account_id_text,
            "account_link_disabled": False,
            "linked_at": now,
            "updated_at": now,
        }
        if not as_text(listing.get("email")):
            updates["email"] = as_text(account.get("email"))
        if not as_text(listing.get("name")):
            updates["name"] = as_text(account.get("name")) or "Creator"

        result = listings_collection.update_one(
            {"_id": listing_id},
            {"$set": updates},
        )
        if result.matched_count != 1:
            print("No listing was updated. Please rerun the tool and check the database.")
            return

        print("\nSUCCESS: The listing was linked.")
        print("Listing ID:", listing_id)
        print("Creator account ID:", account_id_text)
        print("\nNext: restart the Flask backend if needed, refresh the brand dashboard,")
        print("and try inviting that creator again.")

    except PyMongoError as exc:
        print("\nMongoDB error:", exc)
        print("Check that MongoDB is running and backend/.env has the correct MONGO_URI.")
    finally:
        if client is not None:
            client.close()


if __name__ == "__main__":
    main()
