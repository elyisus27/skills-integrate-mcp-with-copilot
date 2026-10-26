"""Student directory and lookup across activities.

Students come from the directory below, from activity sign-ups and from
imported participation records, so every known email is searchable.
"""

import re
import unicodedata

MAX_RESULTS = 10

# Sample directory (in memory, like the activities).
DIRECTORY = {
    "michael@mergington.edu": {"name": "Michael Brown", "student_id": "S1001", "grade": "10"},
    "daniel@mergington.edu": {"name": "Daniel García", "student_id": "S1002", "grade": "11"},
    "emma@mergington.edu": {"name": "Emma Wilson", "student_id": "S1003", "grade": "9"},
    "sophia@mergington.edu": {"name": "Sofía Martínez", "student_id": "S1004", "grade": "12"},
    "john@mergington.edu": {"name": "John Smith", "student_id": "S1005", "grade": "10"},
    "olivia@mergington.edu": {"name": "Olivia Johnson", "student_id": "S1006", "grade": "11"},
    "liam@mergington.edu": {"name": "Liam Anderson", "student_id": "S1007", "grade": "9"},
    "noah@mergington.edu": {"name": "Noé Hernández", "student_id": "S1008", "grade": "12"},
    "ava@mergington.edu": {"name": "Ava Thompson", "student_id": "S1009", "grade": "10"},
    "mia@mergington.edu": {"name": "Mía López", "student_id": "S1010", "grade": "11"},
    "amelia@mergington.edu": {"name": "Amelia Clark", "student_id": "S1011", "grade": "9"},
    "harper@mergington.edu": {"name": "Harper Lewis", "student_id": "S1012", "grade": "12"},
    "ella@mergington.edu": {"name": "Ella Rodríguez", "student_id": "S1013", "grade": "10"},
    "scarlett@mergington.edu": {"name": "Scarlett Walker", "student_id": "S1014", "grade": "11"},
    "james@mergington.edu": {"name": "James Hall", "student_id": "S1015", "grade": "9"},
    "benjamin@mergington.edu": {"name": "Benjamín Torres", "student_id": "S1016", "grade": "12"},
    "charlotte@mergington.edu": {"name": "Charlotte Young", "student_id": "S1017", "grade": "10"},
    "henry@mergington.edu": {"name": "Henry King", "student_id": "S1018", "grade": "11"},
}


def normalize(text: str) -> str:
    """Lowercase and strip accents so "José" and "jose" compare equal."""
    decomposed = unicodedata.normalize("NFKD", str(text))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", stripped).strip().casefold()


def _name_from_email(email: str) -> str:
    return email.split("@")[0].replace(".", " ").replace("_", " ").title()


def build_students(activities: dict, imported: dict[str, dict[str, int]]) -> dict:
    """Merge directory, sign-ups and imported records keyed by lowercase email."""
    students = {}

    def entry(email: str) -> dict:
        if email not in students:
            profile = DIRECTORY.get(email, {})
            students[email] = {
                "name": profile.get("name") or _name_from_email(email),
                "email": email,
                "student_id": profile.get("student_id"),
                "grade": profile.get("grade"),
                "activities": {},
            }
        return students[email]

    for activity_name, details in activities.items():
        for participant in details["participants"]:
            student = entry(participant.strip().lower())
            student["activities"].setdefault(
                activity_name, {"name": activity_name, "points": None}
            )

    for email, records in imported.items():
        student = entry(email.strip().lower())
        for activity_name, points in records.items():
            student["activities"][activity_name] = {
                "name": activity_name,
                "points": points,
            }

    return students


def search(
    query: str,
    activities: dict,
    imported: dict[str, dict[str, int]],
    limit: int = MAX_RESULTS,
) -> dict:
    """Find students by email, student ID or name (partial, accent-insensitive)."""
    needle = normalize(query)
    limit = max(1, min(limit, MAX_RESULTS))
    if not needle:
        return {"query": query, "total": 0, "results": []}

    matches = []
    for student in build_students(activities, imported).values():
        haystacks = (
            normalize(student["name"]),
            student["email"],
            normalize(student["student_id"] or ""),
        )
        if any(needle in haystack for haystack in haystacks):
            matches.append(student)

    matches.sort(key=lambda student: (normalize(student["name"]), student["email"]))
    results = []
    for student in matches[:limit]:
        history = sorted(student["activities"].values(), key=lambda item: item["name"])
        results.append(
            {
                "name": student["name"],
                "email": student["email"],
                "student_id": student["student_id"],
                "grade": student["grade"],
                "activities_count": len(history),
                "total_points": sum(item["points"] or 0 for item in history),
                "activities": history,
            }
        )
    return {"query": query, "total": len(matches), "results": results}
