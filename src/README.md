# Mergington High School Activities API

A super simple FastAPI application that allows students to view and sign up for extracurricular activities.

## Features

- View all available extracurricular activities
- Teacher login for signing up and unregistering students
- Publicly view registered participants
- Import historical participation records (teachers only)
- Student lookup with activity history (teachers only)

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
| GET    | `/students/search?q=jose&limit=10`                                | Search students by email, ID or name (teacher login required)       |

## Editing Activities

Activities live in [`activities.json`](./activities.json), so you can change them
without touching any Python. Each activity is keyed by its name and needs:

```json
"Chess Club": {
  "description": "Learn strategies and compete in chess tournaments",
  "schedule": "Fridays, 3:30 PM - 5:00 PM",
  "max_participants": 12,
  "participants": ["michael@mergington.edu"]
}
```

Tips: keep a comma between activities (but not after the last one), use double
quotes, and restart the server after editing. If the file has a mistake the
server refuses to start and prints what to fix (including the line number for
JSON syntax errors). Set `ACTIVITIES_FILE` to use a different file.

## Activity Points

Each activity can define a default `"points"` value in `activities.json` (a whole
number from 0 to 10000; defaults to 0). Teachers award points per student and
activity from the Student Lookup panel, or with
`POST /activities/{activity_name}/points?email=<email>[&points=<n>]`
(teacher login required). Without `points` the activity's default is awarded;
with it, that value is recorded instead (use `0` to clear). The student must be
signed up for the activity or already have a record. Points are stored with the
participation records and the totals are cumulative: each student profile shows
points per activity and a `total_points` sum.

## Student Lookup

After logging in, teachers get a **Student Lookup** panel (or can call
`GET /students/search?q=<text>`). The search matches email, student ID or name:

- Name matching is case-insensitive and ignores accents (`jose` finds `José`).
- Partial matches work, and at most 10 students are returned; `total` reports
  how many matched.
- Each result has the name, email, student ID, grade, activity count and the
  list of activities (with points when imported records exist).
- Students come from the sample directory in `src/students.py`, activity
  sign-ups and imported participation records. Students without a directory
  entry get a name derived from their email.
- No matches shows a "no students found" message.

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
