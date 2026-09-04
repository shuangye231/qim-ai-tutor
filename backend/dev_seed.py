"""Create local demo accounts and contest data. Never run this in production."""

from datetime import datetime

from backend.database import connect
from backend.security import hash_password
from backend.services.classes import create_class, init_class_db, join_class
from backend.services.contests import init_contest_db
from backend.services.judge import init_judge_db
from backend.services.institutions import create_institution, init_institution_db


DEMO_PASSWORD = "QimaTest123!"


def ensure_user(username: str, role: str) -> None:
    conn = connect()
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at, role) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role",
        (username, hash_password(DEMO_PASSWORD), datetime.now().isoformat(), role),
    )
    conn.commit()
    conn.close()


def seed() -> dict:
    init_class_db(); init_contest_db(); init_judge_db()
    init_institution_db()
    ensure_user("demo_developer", "developer")
    ensure_user("demo_teacher", "teacher")
    ensure_user("demo_student", "user")
    ensure_user("demo_student2", "user")

    conn = connect()
    institution = conn.execute("SELECT code FROM institutions WHERE code = 'QIMA-DEMO'").fetchone()
    conn.close()
    if not institution:
        create_institution("启码演示机构", "QIMA-DEMO", "demo_developer")
    conn = connect()
    conn.execute("UPDATE users SET institution_code = 'QIMA-DEMO' WHERE username = 'demo_teacher'")
    conn.commit()
    conn.close()

    conn = connect()
    class_row = conn.execute("SELECT id, invite_code FROM teaching_classes WHERE teacher = ? AND name = ?", ("demo_teacher", "Python 体验班")).fetchone()
    conn.close()
    classroom = {"id": class_row["id"], "invite_code": class_row["invite_code"]} if class_row else create_class("demo_teacher", "Python 体验班")
    for student in ("demo_student", "demo_student2"):
        try:
            join_class(student, classroom["invite_code"])
        except ValueError as error:
            if "已经加入" not in str(error):
                raise

    return {"developer": "demo_developer", "teacher": "demo_teacher", "institution_code": "QIMA-DEMO", "students": ["demo_student", "demo_student2"], "password": DEMO_PASSWORD, "class_invite_code": classroom["invite_code"], "contest_id": None}


if __name__ == "__main__":
    print(seed())
