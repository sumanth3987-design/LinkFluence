
import json
from pathlib import Path

from pymongo.errors import PyMongoError
from app import creators_collection, utc_now


DATA_FILE = Path(__file__).with_name("creators_data.json")


def main():
    with DATA_FILE.open("r", encoding="utf-8") as file:
        creators = json.load(file)

    if not isinstance(creators, list):
        raise ValueError("The JSON file must contain a list of creators.")

    valid_creators = []
    seen_handles = set()

    for index, creator in enumerate(creators, start=1):
        name = str(creator.get("name", "")).strip()
        handle = str(creator.get("handle", "")).strip().lower().lstrip("@")

        # Ignore untouched template entries.
        if not name and not handle:
            continue

        if not name or not handle:
            raise ValueError(
                f"Entry {index}: both name and handle are required."
            )

        if handle in seen_handles:
            raise ValueError(f"Duplicate handle in JSON: @{handle}")

        seen_handles.add(handle)

        creator.pop("_id", None)
        creator.pop("id", None)
        creator["name"] = name
        creator["handle"] = handle
        valid_creators.append(creator)

    if not valid_creators:
        print("No completed creator profiles found. No records inserted.")
        return

    handles = [creator["handle"] for creator in valid_creators]

    existing = {
        item["handle"].lower()
        for item in creators_collection.find(
            {"handle": {"$in": handles}},
            {"handle": 1}
        )
        if item.get("handle")
    }

    new_creators = []

    for creator in valid_creators:
        if creator["handle"] in existing:
            print(f"Skipping existing creator: @{creator['handle']}")
            continue

        creator["created_at"] = utc_now()
        new_creators.append(creator)

    if not new_creators:
        print("No new creators to insert.")
        return

    try:
        result = creators_collection.insert_many(
            new_creators,
            ordered=True
        )
        print(f"Successfully inserted {len(result.inserted_ids)} creators.")

        for creator in new_creators:
            print(f"- {creator['name']} (@{creator['handle']})")

        print("Refresh Linkfluence to reload the marketplace.")

    except PyMongoError as error:
        print(f"MongoDB insertion failed: {error}")
        raise


if __name__ == "__main__":
    main()
