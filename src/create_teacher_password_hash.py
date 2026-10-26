"""Generate a PBKDF2 password hash for the local teacher credentials file."""

import getpass

from app import hash_password


def main():
    password = getpass.getpass("Teacher password: ")
    confirmation = getpass.getpass("Confirm password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    if not password:
        raise SystemExit("Password cannot be empty.")
    print(hash_password(password))


if __name__ == "__main__":
    main()
