"""Import and aggregate historical participation records.

Records are keyed by (student email, activity), so re-importing the same file
updates existing entries instead of creating duplicates.
"""

import csv
import io
import json
import os
import re
import tempfile
import threading
from pathlib import Path

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_POINTS = 10_000
REQUIRED_FIELDS = ("email", "activity")

_lock = threading.Lock()


class ImportFormatError(ValueError):
    """The uploaded file cannot be parsed as the requested format."""


def storage_path() -> Path:
    return Path(
        os.environ.get(
            "PARTICIPATION_FILE", str(Path(__file__).parent / "participation.json")
        )
    )


def load_records() -> dict[str, dict[str, int]]:
    try:
        records = json.loads(storage_path().read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    if not isinstance(records, dict):
        raise ImportFormatError("Stored participation data has an invalid format.")
    return records


def _save_records(records: dict[str, dict[str, int]]) -> None:
    path = storage_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, delete=False, suffix=".tmp"
    ) as temp_file:
        json.dump(records, temp_file, indent=2, sort_keys=True)
    os.replace(temp_file.name, path)


def parse_rows(content: str, file_format: str) -> list[tuple[int, object]]:
    """Return (row number, raw row) pairs. Row numbers match the file lines
    for CSV (header is row 1) and the 1-based position for JSON."""
    if file_format == "csv":
        reader = csv.DictReader(io.StringIO(content))
        if reader.fieldnames is None:
            raise ImportFormatError("The CSV file is empty.")
        headers = {name.strip().lower() for name in reader.fieldnames if name}
        missing = [field for field in REQUIRED_FIELDS if field not in headers]
        if missing:
            raise ImportFormatError(
                f"The CSV header is missing required columns: {', '.join(missing)}."
            )
        return [
            (
                line_number,
                {
                    (key or "").strip().lower(): value
                    for key, value in row.items()
                },
            )
            for line_number, row in enumerate(reader, start=2)
        ]

    if file_format == "json":
        try:
            data = json.loads(content)
        except json.JSONDecodeError as error:
            raise ImportFormatError(f"Invalid JSON: {error.msg}.") from error
        if not isinstance(data, list):
            raise ImportFormatError("The JSON file must contain a list of records.")
        return list(enumerate(data, start=1))

    raise ImportFormatError("Format must be 'csv' or 'json'.")


def validate_row(raw_row: object, activity_names: set[str]):
    """Return ((email, activity, points), None) or (None, error message)."""
    if not isinstance(raw_row, dict):
        return None, "Row must be an object with student, activity and points."

    row = {str(key).strip().lower(): value for key, value in raw_row.items()}
    email = str(row.get("email") or "").strip().lower()
    activity = str(row.get("activity") or "").strip()
    raw_points = row.get("points")

    if not email:
        return None, "Missing required field: email."
    if not EMAIL_PATTERN.match(email):
        return None, f"Invalid email format: {email}."
    if not activity:
        return None, "Missing required field: activity."
    if activity not in activity_names:
        return None, f"Unknown activity: {activity}."

    points = 0
    if raw_points not in (None, ""):
        try:
            points = int(str(raw_points).strip())
        except ValueError:
            return None, f"Points must be a whole number, got: {raw_points}."
        if not 0 <= points <= MAX_POINTS:
            return None, f"Points must be between 0 and {MAX_POINTS}."

    return (email, activity, points), None


def import_records(content: str, file_format: str, activity_names: set[str]) -> dict:
    rows = parse_rows(content, file_format)
    errors = []
    valid = []
    for row_number, raw_row in rows:
        parsed, error = validate_row(raw_row, activity_names)
        if error:
            errors.append({"row": row_number, "error": error})
        else:
            valid.append(parsed)

    added = updated = unchanged = 0
    with _lock:
        records = load_records()
        for email, activity, points in valid:
            student = records.setdefault(email, {})
            if activity not in student:
                added += 1
            elif student[activity] != points:
                updated += 1
            else:
                unchanged += 1
            student[activity] = points
        if valid:
            _save_records(records)

    return {
        "total_rows": len(rows),
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "errors": errors,
    }


def summarize(records: dict[str, dict[str, int]] | None = None) -> list[dict]:
    """Group records by student with activity counts and point totals."""
    if records is None:
        with _lock:
            records = load_records()
    return [
        {
            "email": email,
            "activities_count": len(activities),
            "total_points": sum(activities.values()),
            "activities": dict(sorted(activities.items())),
        }
        for email, activities in sorted(records.items())
    ]
