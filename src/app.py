"""
High School Management System API

A super simple FastAPI application that allows students to view and sign up
for extracurricular activities at Mergington High School.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
from pathlib import Path

from fastapi.responses import RedirectResponse
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:
    from . import analytics, participation, students
except ImportError:
    import analytics
    import participation
    import students

MAX_IMPORT_BYTES = 1_000_000

app = FastAPI(title="Mergington High School API",
              description="API for viewing and signing up for extracurricular activities")

logger = logging.getLogger(__name__)
SESSION_COOKIE = "teacher_session"
SESSION_DURATION_SECONDS = 8 * 60 * 60
PASSWORD_HASH_ITERATIONS = 600_000
configured_session_secret = os.environ.get("SESSION_SECRET", "").encode("utf-8")
if configured_session_secret and len(configured_session_secret) < 32:
    raise RuntimeError("SESSION_SECRET must contain at least 32 bytes.")
SESSION_SECRET = configured_session_secret or secrets.token_bytes(32)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)


def _encode_urlsafe(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS
    )
    return (
        f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}"
        f"${_encode_urlsafe(salt)}${_encode_urlsafe(digest)}"
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt, expected_digest = password_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        iteration_count = int(iterations)
        if not 1 <= iteration_count <= 2_000_000:
            return False
        salt_bytes = base64.urlsafe_b64decode(salt + "=" * (-len(salt) % 4))
        expected_bytes = base64.urlsafe_b64decode(
            expected_digest + "=" * (-len(expected_digest) % 4)
        )
    except (ValueError, TypeError):
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt_bytes, iteration_count
    )
    return hmac.compare_digest(actual_digest, expected_bytes)


def load_teacher_credentials() -> dict[str, str]:
    credentials_path = Path(
        os.environ.get(
            "TEACHER_CREDENTIALS_FILE",
            str(Path(__file__).parent / "teachers.json"),
        )
    )
    try:
        credentials = json.loads(credentials_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise HTTPException(
            status_code=503,
            detail="Teacher accounts are not configured on this server.",
        ) from error
    except (OSError, json.JSONDecodeError) as error:
        logger.exception("Unable to read teacher credentials from %s", credentials_path)
        raise HTTPException(
            status_code=503,
            detail="Teacher account configuration could not be loaded.",
        ) from error

    if not isinstance(credentials, dict) or not credentials or not all(
        isinstance(username, str)
        and isinstance(password_hash, str)
        for username, password_hash in credentials.items()
    ):
        logger.error("Teacher credentials file has an invalid format: %s", credentials_path)
        raise HTTPException(
            status_code=503,
            detail="Teacher account configuration has an invalid format.",
        )
    return credentials


def create_session_token(username: str) -> str:
    payload = json.dumps(
        {"username": username, "expires": int(time.time()) + SESSION_DURATION_SECONDS},
        separators=(",", ":"),
    ).encode("utf-8")
    encoded_payload = _encode_urlsafe(payload)
    signature = hmac.new(
        SESSION_SECRET, encoded_payload.encode("ascii"), hashlib.sha256
    ).digest()
    return f"{encoded_payload}.{_encode_urlsafe(signature)}"


def get_session_username(token: str | None) -> str | None:
    if not token:
        return None

    try:
        encoded_payload, encoded_signature = token.split(".")
        signature = base64.urlsafe_b64decode(
            encoded_signature + "=" * (-len(encoded_signature) % 4)
        )
        expected_signature = hmac.new(
            SESSION_SECRET, encoded_payload.encode("ascii"), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(signature, expected_signature):
            return None

        payload = base64.urlsafe_b64decode(
            encoded_payload + "=" * (-len(encoded_payload) % 4)
        )
        session = json.loads(payload)
        username = session["username"]
        expires = session["expires"]
        if not isinstance(username, str) or not isinstance(expires, int):
            return None
        if expires <= int(time.time()):
            return None
        return username
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        return None


def require_teacher(request: Request) -> str:
    username = get_session_username(request.cookies.get(SESSION_COOKIE))
    if username is None:
        raise HTTPException(status_code=401, detail="Teacher login required.")
    return username


# Mount the static files directory
current_dir = Path(__file__).parent
app.mount("/static", StaticFiles(directory=os.path.join(Path(__file__).parent,
          "static")), name="static")

REQUIRED_ACTIVITY_FIELDS = {
    "description": str,
    "schedule": str,
    "max_participants": int,
    "participants": list,
}


def load_activities() -> dict:
    """Load activities from activities.json, failing with a clear message
    so teachers know exactly what to fix after editing the file."""
    path = Path(
        os.environ.get("ACTIVITIES_FILE", str(current_dir / "activities.json"))
    )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise RuntimeError(f"Activities file not found: {path}") from error
    except json.JSONDecodeError as error:
        raise RuntimeError(
            f"{path.name} is not valid JSON (line {error.lineno}, "
            f"column {error.colno}): {error.msg}. Check for a missing or "
            "extra comma or quote."
        ) from error

    if not isinstance(data, dict) or not data:
        raise RuntimeError(f"{path.name} must contain an object of activities.")
    for name, details in data.items():
        if not isinstance(details, dict):
            raise RuntimeError(f"Activity '{name}' in {path.name} must be an object.")
        for field, expected_type in REQUIRED_ACTIVITY_FIELDS.items():
            value = details.get(field)
            if not isinstance(value, expected_type) or isinstance(value, bool):
                raise RuntimeError(
                    f"Activity '{name}' in {path.name} needs a "
                    f"'{field}' of type {expected_type.__name__}."
                )
        if "points" in details:
            try:
                participation.validate_points(details["points"])
            except ValueError as error:
                raise RuntimeError(
                    f"Activity '{name}' in {path.name} has invalid 'points': {error}"
                ) from error
    return data


# In-memory activity database, loaded from activities.json at startup
activities = load_activities()


@app.get("/")
def root():
    return RedirectResponse(url="/static/index.html")


@app.get("/activities")
def get_activities():
    return activities


@app.post("/auth/login")
def login(credentials: LoginRequest, response: Response):
    teacher_credentials = load_teacher_credentials()
    password_hash = teacher_credentials.get(credentials.username)
    if password_hash is None or not verify_password(
        credentials.password, password_hash
    ):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    response.set_cookie(
        key=SESSION_COOKIE,
        value=create_session_token(credentials.username),
        max_age=SESSION_DURATION_SECONDS,
        httponly=True,
        secure=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
        samesite="strict",
        path="/",
    )
    return {"message": "Signed in.", "username": credentials.username}


@app.get("/auth/session")
def get_auth_session(request: Request):
    username = get_session_username(request.cookies.get(SESSION_COOKIE))
    return {"authenticated": username is not None, "username": username}


@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE, httponly=True, samesite="strict", path="/"
    )
    return {"message": "Signed out."}


@app.post("/participation/import")
async def import_participation(request: Request, format: str = "csv"):
    """Import historical participation records from a CSV or JSON body"""
    require_teacher(request)

    body = await request.body()
    if len(body) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Import file is too large.")
    try:
        content = body.decode("utf-8-sig")
        return participation.import_records(content, format.lower(), set(activities))
    except UnicodeDecodeError as error:
        raise HTTPException(
            status_code=400, detail="Import file must be UTF-8 text."
        ) from error
    except participation.ImportFormatError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/participation")
def get_participation(request: Request):
    """Get imported participation grouped by student"""
    require_teacher(request)
    try:
        return participation.summarize()
    except participation.ImportFormatError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/students/search")
def search_students(
    request: Request,
    q: str = "",
    limit: int = students.MAX_RESULTS,
    track: bool = True,
):
    """Search students by email, ID or name and show their activity history.

    Pass track=false for refreshes that are not a newly submitted search so
    the analytics count each submitted search only once."""
    require_teacher(request)
    if len(q) > 100:
        raise HTTPException(status_code=400, detail="Search text is too long.")
    try:
        imported = participation.load_records()
    except participation.ImportFormatError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    result = students.search(q, activities, imported, limit)
    if track and q.strip():
        try:
            analytics.record_search(q, result["total"])
        except OSError:
            logger.exception("Unable to record search analytics")
    return result


@app.get("/analytics/searches")
def get_search_analytics(request: Request):
    """Aggregate student search usage (teacher login required)"""
    require_teacher(request)
    return analytics.summarize()


@app.post("/activities/{activity_name}/points")
def award_activity_points(
    activity_name: str, email: str, request: Request, points: int | None = None
):
    """Award points to a student; defaults to the activity's points value"""
    require_teacher(request)

    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")
    activity = activities[activity_name]
    email = email.strip().lower()

    try:
        records = participation.load_records()
    except participation.ImportFormatError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    is_participant = email in {p.strip().lower() for p in activity["participants"]}
    if not is_participant and activity_name not in records.get(email, {}):
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity",
        )

    try:
        awarded = participation.validate_points(
            activity.get("points", 0) if points is None else points
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    total = participation.award_points(email, activity_name, awarded)
    return {
        "message": f"Awarded {awarded} points to {email} for {activity_name}",
        "points": awarded,
        "total_points": total,
    }


@app.post("/activities/{activity_name}/signup")
def signup_for_activity(activity_name: str, email: str, request: Request):
    """Sign up a student for an activity"""
    require_teacher(request)

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is not already signed up
    if email in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is already signed up"
        )

    # Add student
    activity["participants"].append(email)
    return {"message": f"Signed up {email} for {activity_name}"}


@app.delete("/activities/{activity_name}/unregister")
def unregister_from_activity(activity_name: str, email: str, request: Request):
    """Unregister a student from an activity"""
    require_teacher(request)

    # Validate activity exists
    if activity_name not in activities:
        raise HTTPException(status_code=404, detail="Activity not found")

    # Get the specific activity
    activity = activities[activity_name]

    # Validate student is signed up
    if email not in activity["participants"]:
        raise HTTPException(
            status_code=400,
            detail="Student is not signed up for this activity"
        )

    # Remove student
    activity["participants"].remove(email)
    return {"message": f"Unregistered {email} from {activity_name}"}
