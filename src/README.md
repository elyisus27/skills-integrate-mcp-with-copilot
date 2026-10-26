# Mergington High School Activities API

A super simple FastAPI application that allows students to view and sign up for extracurricular activities.

## Features

- View all available extracurricular activities
- Teacher login for signing up and unregistering students
- Publicly view registered participants
- Import historical participation records (teachers only)

## Getting Started

1. Install the dependencies:

   ```
   pip install fastapi uvicorn
   ```

2. Create teacher credentials. The password hash helper prompts for a password:

   ```
   python src/create_teacher_password_hash.py
   ```

   Save the printed hash in `src/teachers.json` (this local credentials file is
   ignored by Git):

   ```json
   {
     "teacher": "pbkdf2_sha256$600000$..."
   }
   ```

   Set a stable session-signing secret before deploying, and enable secure
   cookies when serving over HTTPS:

   ```
   SESSION_SECRET=<random secret>
   COOKIE_SECURE=true
   ```

   `SESSION_SECRET` can be generated with
   `python -c "import secrets; print(secrets.token_urlsafe(32))"`.

3. Run the application:

   ```
   uvicorn src.app:app --reload
   ```

4. Open your browser and go to:
   - API documentation: http://localhost:8000/docs
   - Alternative documentation: http://localhost:8000/redoc

## API Endpoints

| Method | Endpoint                                                          | Description                                                         |
| ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/activities`                                                     | Get all activities with their details and current participant count |
| POST   | `/auth/login`                                                     | Sign in as a teacher and receive an HTTP-only session cookie         |
| GET    | `/auth/session`                                                   | Check the current login session                                     |
| POST   | `/auth/logout`                                                    | Sign out and clear the session cookie                               |
| POST   | `/activities/{activity_name}/signup?email=student@mergington.edu` | Sign up a student (teacher login required)                          |
| DELETE | `/activities/{activity_name}/unregister?email=student@mergington.edu` | Unregister a student (teacher login required)                   |
| POST   | `/participation/import?format=csv\|json`                          | Import historical participation records (teacher login required)    |
| GET    | `/participation`                                                  | Imported participation grouped by student (teacher login required)  |

## Importing Historical Participation

Teachers can load past participation data after logging in. Send the file as
the request body to `POST /participation/import?format=csv` (or `format=json`).

CSV needs a header row with `email` and `activity`; `points` is optional:

```
email,activity,points
ana@mergington.edu,Chess Club,5
ana@mergington.edu,Art Club,3
```

JSON is a list of objects with the same fields:

```json
[{"email": "ana@mergington.edu", "activity": "Chess Club", "points": 5}]
```

Rules:

- `email` must be a valid address; `activity` must be an existing activity;
  `points` must be a whole number from 0 to 10000 (default 0).
- Invalid rows are not imported and are reported in the response with their row
  number (CSV row 1 is the header). Valid rows are still imported.
- Records are keyed by student and activity, so re-importing the same file never
  creates duplicates: the response counts `added`, `updated` and `unchanged`.
- Files are limited to 1 MB and must be UTF-8.
- Data is saved to `src/participation.json` (override with `PARTICIPATION_FILE`;
  the file is ignored by Git) so it survives restarts.
- `GET /participation` returns each student's activities, activity count and
  point total.

## Data Model

The application uses a simple data model with meaningful identifiers:

1. **Activities** - Uses activity name as identifier:

   - Description
   - Schedule
   - Maximum number of participants allowed
   - List of student emails who are signed up

2. **Students** - Uses email as identifier:
   - Name
   - Grade level

All data is stored in memory, which means data will be reset when the server restarts.
