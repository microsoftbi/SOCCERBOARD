"""SQLite 数据层：球队库 + 多场比赛。

数据库只保存媒体文件的相对路径，照片与视频都以独立文件存放：
  data/media/photos/{teamId}/{playerId}.{ext}
  data/media/videos/{teamId}/{playerId}.{ext}

旧版（主客队单场比赛）数据会在首次启动时自动迁移为新结构，
并生成一场示例比赛；迁移前会备份原数据库。
"""

from __future__ import annotations

import base64
import binascii
import json
import os
import re
import shutil
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

SIDES = ("home", "away")
VIEWS = ("matches", "teams", "match", "new")

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("SOCCERBOARD_DATA_DIR", str(ROOT / "data")))
DB_PATH = DATA_DIR / "soccerboard.db"
BACKUP_PATH = DATA_DIR / "soccerboard.v1.bak.db"
PHOTO_DIR = DATA_DIR / "media" / "photos"
VIDEO_DIR = DATA_DIR / "media" / "videos"

SCHEMA = """
CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL DEFAULT '',
  code       TEXT    NOT NULL DEFAULT '',
  color      TEXT    NOT NULL DEFAULT '#c8102e',
  coach      TEXT    NOT NULL DEFAULT '',
  updated_at TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS players (
  team_id    INTEGER NOT NULL,
  id         INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  num        TEXT    NOT NULL DEFAULT '',
  name       TEXT    NOT NULL DEFAULT '',
  pos        TEXT    NOT NULL DEFAULT '',
  captain    INTEGER NOT NULL DEFAULT 0,
  photo_file TEXT,
  video_file TEXT,
  video_crop TEXT,
  video_trim TEXT,
  PRIMARY KEY (team_id, id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matches (
  id             INTEGER PRIMARY KEY,
  name           TEXT    NOT NULL DEFAULT '',
  competition    TEXT    NOT NULL DEFAULT '',
  date           TEXT    NOT NULL DEFAULT '',
  home_team_id   INTEGER NOT NULL DEFAULT 0,
  away_team_id   INTEGER NOT NULL DEFAULT 0,
  player_count   INTEGER NOT NULL DEFAULT 6,
  home_formation TEXT    NOT NULL DEFAULT '2-2-1',
  away_formation TEXT    NOT NULL DEFAULT '2-2-1',
  status         TEXT    NOT NULL DEFAULT 'draft',
  exported_at    REAL,
  created_at     TEXT    NOT NULL DEFAULT '',
  score_title    TEXT    NOT NULL DEFAULT '',
  score_home     INTEGER NOT NULL DEFAULT 0,
  score_away     INTEGER NOT NULL DEFAULT 0,
  score_log      TEXT    NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS match_slots (
  match_id INTEGER NOT NULL,
  side     TEXT    NOT NULL,
  idx      INTEGER NOT NULL,
  pos      TEXT    NOT NULL DEFAULT '',
  x        REAL    NOT NULL DEFAULT 50,
  y        REAL    NOT NULL DEFAULT 50,
  pid      INTEGER,
  PRIMARY KEY (match_id, side, idx),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_bench (
  match_id INTEGER NOT NULL,
  side     TEXT    NOT NULL,
  ord      INTEGER NOT NULL,
  pid      INTEGER NOT NULL,
  PRIMARY KEY (match_id, side, ord),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS match_state (
  match_id   INTEGER NOT NULL,
  side       TEXT    NOT NULL,
  step       INTEGER NOT NULL DEFAULT 1,
  view       TEXT    NOT NULL DEFAULT 'h',
  show_photo INTEGER NOT NULL DEFAULT 1,
  show_name  INTEGER NOT NULL DEFAULT 1,
  ptw_pid    INTEGER NOT NULL DEFAULT 0,
  ptw_text   TEXT    NOT NULL DEFAULT '',
  ptw_hide   INTEGER NOT NULL DEFAULT 0,
  score_name_mode TEXT NOT NULL DEFAULT 'code',
  score_name TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (match_id, side),
  FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  view            TEXT    NOT NULL DEFAULT 'matches',
  active_match_id INTEGER
);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _columns(conn: sqlite3.Connection, table: str) -> dict[str, sqlite3.Row]:
    return {r["name"]: r for r in conn.execute(f"PRAGMA table_info({table})")}


def _is_legacy(conn: sqlite3.Connection) -> bool:
    cols = _columns(conn, "teams")
    return "side" in cols and "id" not in cols


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        if _is_legacy(conn):
            _migrate_legacy(conn)
        conn.executescript(SCHEMA)
        # 旧库补列：视频裁切/截取元数据
        cols = _columns(conn, "players")
        for name in ("video_crop", "video_trim"):
            if name not in cols:
                conn.execute(f"ALTER TABLE players ADD COLUMN {name} TEXT")
        if "coach" not in _columns(conn, "teams"):
            conn.execute("ALTER TABLE teams ADD COLUMN coach TEXT NOT NULL DEFAULT ''")
        st_cols = _columns(conn, "match_state")
        if "ptw_pid" not in st_cols:
            conn.execute("ALTER TABLE match_state ADD COLUMN ptw_pid INTEGER NOT NULL DEFAULT 0")
        if "ptw_text" not in st_cols:
            conn.execute("ALTER TABLE match_state ADD COLUMN ptw_text TEXT NOT NULL DEFAULT ''")
        if "ptw_hide" not in st_cols:
            conn.execute("ALTER TABLE match_state ADD COLUMN ptw_hide INTEGER NOT NULL DEFAULT 0")
        if "score_name_mode" not in st_cols:
            conn.execute(
                "ALTER TABLE match_state ADD COLUMN score_name_mode TEXT NOT NULL DEFAULT 'code'"
            )
        if "score_name" not in st_cols:
            conn.execute("ALTER TABLE match_state ADD COLUMN score_name TEXT NOT NULL DEFAULT ''")
        m_cols = _columns(conn, "matches")
        if "score_title" not in m_cols:
            conn.execute("ALTER TABLE matches ADD COLUMN score_title TEXT NOT NULL DEFAULT ''")
        if "score_home" not in m_cols:
            conn.execute("ALTER TABLE matches ADD COLUMN score_home INTEGER NOT NULL DEFAULT 0")
        if "score_away" not in m_cols:
            conn.execute("ALTER TABLE matches ADD COLUMN score_away INTEGER NOT NULL DEFAULT 0")
        if "score_log" not in m_cols:
            conn.execute("ALTER TABLE matches ADD COLUMN score_log TEXT NOT NULL DEFAULT '[]'")
        conn.execute(
            "INSERT OR IGNORE INTO app_state (id, view, active_match_id) VALUES (1, 'matches', NULL)"
        )


# ---------- 媒体文件 ----------

def _team_dir(base: Path, team_id: int) -> Path:
    return base / str(int(team_id))


def find_media(base: Path, team_id: int, player_id: int) -> Path | None:
    folder = _team_dir(base, team_id)
    if not folder.is_dir():
        return None
    for f in folder.iterdir():
        if f.is_file() and f.stem == str(int(player_id)):
            return f
    return None


def media_url(kind: str, team_id: int, player_id: int, path: Path | None) -> str | None:
    if path is None or not path.is_file():
        return None
    version = int(path.stat().st_mtime * 1000)
    return f"/api/{kind}/{int(team_id)}/{int(player_id)}?v={version}"


def _write_atomic(path: Path, data: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def _drop_other_ext(folder: Path, player_id: int, keep: Path) -> None:
    for f in folder.iterdir():
        if f.is_file() and f.stem == str(int(player_id)) and f != keep:
            f.unlink(missing_ok=True)


def _ext_for_mime(mime: str) -> str:
    mime = mime.split(";")[0].strip().lower()
    return {
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
        "video/x-m4v": ".m4v",
    }.get(mime, ".jpg" if mime.startswith("image/") else ".mp4")


DATA_URL_RE = re.compile(r"^data:(image/[a-z0-9.+-]+);base64,(.+)$", re.S | re.I)


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    m = DATA_URL_RE.match(data_url.strip())
    if not m:
        raise ValueError("unsupported data url")
    mime = m.group(1).lower()
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("invalid base64") from exc
    return mime, raw


def save_photo_data_url(team_id: int, player_id: int, data_url: str) -> str:
    mime, raw = decode_data_url(data_url)
    if not mime.startswith("image/"):
        raise ValueError("photo must be an image")
    folder = _team_dir(PHOTO_DIR, team_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{int(player_id)}{_ext_for_mime(mime)}"
    _write_atomic(path, raw)
    _drop_other_ext(folder, player_id, path)
    return f"{folder.name}/{path.name}"


def save_video_bytes(team_id: int, player_id: int, content_type: str, raw: bytes) -> str:
    folder = _team_dir(VIDEO_DIR, team_id)
    folder.mkdir(parents=True, exist_ok=True)
    ext = _ext_for_mime(content_type or "video/mp4")
    if not ext.startswith((".mp4", ".webm", ".mov", ".m4v")):
        ext = ".mp4"
    path = folder / f"{int(player_id)}{ext}"
    _write_atomic(path, raw)
    _drop_other_ext(folder, player_id, path)
    return f"{folder.name}/{path.name}"


def delete_media(base: Path, team_id: int, player_id: int) -> None:
    path = find_media(base, team_id, player_id)
    if path is not None:
        path.unlink(missing_ok=True)


# ---------- 旧数据迁移 ----------

def _move_media_dir(base: Path, side: str, team_id: int) -> None:
    src = base / side
    if not src.is_dir():
        return
    dst = _team_dir(base, team_id)
    dst.mkdir(parents=True, exist_ok=True)
    for f in src.iterdir():
        if f.is_file():
            target = dst / f.name
            if target.exists():
                target.unlink()
            shutil.move(str(f), str(target))
    try:
        src.rmdir()
    except OSError:
        pass


def _migrate_legacy(conn: sqlite3.Connection) -> None:
    if DB_PATH.exists() and not BACKUP_PATH.exists():
        shutil.copy2(DB_PATH, BACKUP_PATH)

    old_teams = {r["side"]: r for r in conn.execute("SELECT * FROM teams")}
    old_players = list(conn.execute("SELECT * FROM players ORDER BY side, sort_order, id"))
    old_slots = list(conn.execute("SELECT * FROM slots ORDER BY side, idx"))
    old_ui = conn.execute("SELECT * FROM ui_state WHERE id = 1").fetchone()

    conn.execute("DROP TABLE IF EXISTS ui_state")
    conn.execute("DROP TABLE IF EXISTS slots")
    conn.execute("DROP TABLE IF EXISTS players")
    conn.execute("DROP TABLE IF EXISTS teams")
    conn.executescript(SCHEMA)

    team_ids: dict[str, int] = {"home": 1, "away": 2}
    for side in SIDES:
        tid = team_ids[side]
        row = old_teams.get(side)
        name = row["name"] if row else ("主队" if side == "home" else "客队")
        code = row["code"] if row else ""
        color = row["color"] if row else ("#c8102e" if side == "home" else "#1f6fd0")
        conn.execute(
            "INSERT INTO teams (id, name, code, color, updated_at) VALUES (?,?,?,?,?)",
            (tid, name, code, color, time.strftime("%Y-%m-%dT%H:%M:%S")),
        )
        _move_media_dir(PHOTO_DIR, side, tid)
        _move_media_dir(VIDEO_DIR, side, tid)

    for p in old_players:
        side = p["side"]
        tid = team_ids.get(side)
        if tid is None:
            continue
        photo = find_media(PHOTO_DIR, tid, p["id"])
        video = find_media(VIDEO_DIR, tid, p["id"])
        conn.execute(
            "INSERT INTO players (team_id, id, sort_order, num, name, pos, captain, photo_file, video_file)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (
                tid,
                p["id"],
                p["sort_order"],
                p["num"],
                p["name"],
                p["pos"],
                p["captain"],
                f"{tid}/{photo.name}" if photo else None,
                f"{tid}/{video.name}" if video else None,
            ),
        )

    home = old_teams.get("home")
    away = old_teams.get("away")
    if home is None and away is None:
        return
    count = int((home or away)["player_count"]) if (home or away) else 6
    name = f"{home['name'] if home else '主队'} vs {away['name'] if away else '客队'}"
    now = time.strftime("%Y-%m-%dT%H:%M:%S")
    conn.execute(
        "INSERT INTO matches (id, name, competition, date, home_team_id, away_team_id, player_count,"
        " home_formation, away_formation, status, exported_at, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            1,
            name,
            "示例比赛",
            time.strftime("%Y-%m-%d"),
            1,
            2,
            count,
            home["formation"] if home else "2-2-1",
            away["formation"] if away else "2-2-1",
            "draft",
            home["exported_at"] if home else None,
            now,
        ),
    )
    for s in old_slots:
        side = s["side"]
        if side not in SIDES:
            continue
        conn.execute(
            "INSERT INTO match_slots (match_id, side, idx, pos, x, y, pid) VALUES (1,?,?,?,?,?,?)",
            (side, s["idx"], s["pos"], s["x"], s["y"], s["pid"]),
        )
    for side in SIDES:
        placed = {s["pid"] for s in old_slots if s["side"] == side and s["pid"] is not None}
        order = 0
        for p in old_players:
            if p["side"] != side or p["id"] in placed:
                continue
            if not (p["num"] or p["name"]):
                continue
            conn.execute(
                "INSERT INTO match_bench (match_id, side, ord, pid) VALUES (1,?,?,?)",
                (side, order, p["id"]),
            )
            order += 1
        conn.execute(
            "INSERT OR IGNORE INTO match_state (match_id, side, step, view, show_photo, show_name)"
            " VALUES (1,?,?,?,?,?)",
            (
                side,
                old_ui["step"] if old_ui and side == old_ui["side"] else 1,
                old_ui["view"] if old_ui and side == old_ui["side"] else "h",
                old_ui["show_photo"] if old_ui else 1,
                old_ui["show_name"] if old_ui else 1,
            ),
        )
    conn.execute(
        "INSERT OR REPLACE INTO app_state (id, view, active_match_id) VALUES (1, 'match', 1)"
    )


# ---------- 读写 ----------

def _num(v: Any, default: float = 0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _text(v: Any, default: str = "") -> str:
    return default if v is None else str(v)


def _load_json(raw: Any) -> dict[str, Any] | None:
    """读取 TEXT 列里的 JSON 对象（视频裁切/截取元数据）"""
    if not raw:
        return None
    try:
        v = json.loads(raw)
    except (TypeError, ValueError):
        return None
    return v if isinstance(v, dict) else None


def _dump_json(v: Any) -> str | None:
    if not isinstance(v, dict):
        return None
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def _load_json_list(raw: Any) -> list[Any]:
    """读取 TEXT 列里的 JSON 数组（比分记录）"""
    if not raw:
        return []
    try:
        v = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return v if isinstance(v, list) else []


def _dump_json_list(v: Any) -> str:
    if not isinstance(v, list):
        return "[]"
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def load_library() -> dict[str, Any] | None:
    with db() as conn:
        team_rows = list(conn.execute("SELECT * FROM teams ORDER BY id"))
        if not team_rows:
            return None
        teams: list[dict[str, Any]] = []
        for t in team_rows:
            tid = int(t["id"])
            players = []
            for p in conn.execute(
                "SELECT * FROM players WHERE team_id = ? ORDER BY sort_order, id", (tid,)
            ):
                pid = int(p["id"])
                photo = find_media(PHOTO_DIR, tid, pid)
                video = find_media(VIDEO_DIR, tid, pid)
                item: dict[str, Any] = {
                    "id": pid,
                    "num": p["num"],
                    "name": p["name"],
                    "pos": p["pos"],
                    "captain": bool(p["captain"]),
                    "photo": media_url("photos", tid, pid, photo),
                    "video": bool(video),
                }
                crop = _load_json(p["video_crop"])
                trim = _load_json(p["video_trim"])
                if crop:
                    item["videoCrop"] = crop
                if trim:
                    item["videoTrim"] = trim
                players.append(item)
            teams.append(
                {
                    "id": tid,
                    "name": t["name"],
                    "code": t["code"],
                    "color": t["color"],
                    "coach": t["coach"] or "",
                    "players": players,
                }
            )

        matches: list[dict[str, Any]] = []
        for m in conn.execute("SELECT * FROM matches ORDER BY id"):
            mid = int(m["id"])
            match: dict[str, Any] = {
                "id": mid,
                "name": m["name"],
                "competition": m["competition"],
                "date": m["date"],
                "homeTeamId": int(m["home_team_id"]),
                "awayTeamId": int(m["away_team_id"]),
                "count": int(m["player_count"]),
                "homeFormation": m["home_formation"],
                "awayFormation": m["away_formation"],
                "status": m["status"],
                "exportedAt": m["exported_at"],
                "createdAt": m["created_at"],
                "scoreTitle": m["score_title"] or "",
                "scoreHome": int(m["score_home"] or 0),
                "scoreAway": int(m["score_away"] or 0),
                "scoreLog": [
                    {
                        "id": _int(e.get("id"), 0),
                        "home": _int(e.get("home"), 0),
                        "away": _int(e.get("away"), 0),
                        "at": _num(e.get("at"), 0),
                    }
                    for e in _load_json_list(m["score_log"])
                    if isinstance(e, dict)
                ],
            }
            for side in SIDES:
                slots = [
                    {"pos": s["pos"], "x": s["x"], "y": s["y"], "pid": s["pid"]}
                    for s in conn.execute(
                        "SELECT * FROM match_slots WHERE match_id = ? AND side = ? ORDER BY idx",
                        (mid, side),
                    )
                ]
                bench = [
                    int(b["pid"])
                    for b in conn.execute(
                        "SELECT * FROM match_bench WHERE match_id = ? AND side = ? ORDER BY ord",
                        (mid, side),
                    )
                ]
                st = conn.execute(
                    "SELECT * FROM match_state WHERE match_id = ? AND side = ?", (mid, side)
                ).fetchone()
                match[side] = {
                    "slots": slots,
                    "bench": bench,
                    "ui": {
                        "step": int(st["step"]) if st else 1,
                        "view": st["view"] if st else "h",
                        "showPhoto": bool(st["show_photo"]) if st else True,
                        "showName": bool(st["show_name"]) if st else True,
                        "ptwPid": int(st["ptw_pid"]) if st else 0,
                        "ptwText": (st["ptw_text"] or "") if st else "",
                        "ptwHide": bool(st["ptw_hide"]) if st else False,
                        "scoreNameMode": (
                            st["score_name_mode"]
                            if st and st["score_name_mode"] in ("code", "full", "custom")
                            else "code"
                        ),
                        "scoreName": (st["score_name"] or "") if st else "",
                    },
                }
            matches.append(match)

        app = conn.execute("SELECT * FROM app_state WHERE id = 1").fetchone()
        view = app["view"] if app and app["view"] in VIEWS else "matches"
        active = int(app["active_match_id"]) if app and app["active_match_id"] is not None else None
        if active is not None and not any(int(m["id"]) == active for m in matches):
            active = None
            if view == "match":
                view = "matches"
    return {
        "teams": teams,
        "matches": matches,
        "app": {"view": view, "activeMatchId": active},
    }


def _cleanup_media(conn: sqlite3.Connection) -> None:
    allowed_photo: set[tuple[int, int]] = set()
    allowed_video: set[tuple[int, int]] = set()
    for p in conn.execute("SELECT team_id, id, photo_file, video_file FROM players"):
        key = (int(p["team_id"]), int(p["id"]))
        if p["photo_file"]:
            allowed_photo.add(key)
        if p["video_file"]:
            allowed_video.add(key)
    for base, allowed in ((PHOTO_DIR, allowed_photo), (VIDEO_DIR, allowed_video)):
        for folder in base.iterdir():
            if not folder.is_dir() or not folder.name.isdigit():
                continue
            tid = int(folder.name)
            for f in folder.iterdir():
                if not f.is_file():
                    continue
                try:
                    pid = int(f.stem)
                except ValueError:
                    continue
                if (tid, pid) not in allowed:
                    f.unlink(missing_ok=True)


def _resolve_photo(team_id: int, player_id: int, photo: Any) -> str | None:
    if not isinstance(photo, str) or not photo:
        return None
    if photo.startswith("data:image/"):
        return save_photo_data_url(team_id, player_id, photo)
    path = find_media(PHOTO_DIR, team_id, player_id)
    return f"{team_id}/{path.name}" if path else None


def save_library(data: dict[str, Any]) -> None:
    teams = data.get("teams")
    matches = data.get("matches")
    if not isinstance(teams, list):
        raise ValueError("teams must be a list")
    if not isinstance(matches, list):
        raise ValueError("matches must be a list")
    app = data.get("app") if isinstance(data.get("app"), dict) else {}
    now = time.strftime("%Y-%m-%dT%H:%M:%S")

    with db() as conn:
        keep_teams: set[int] = set()
        for t in teams:
            if not isinstance(t, dict):
                continue
            tid = _int(t.get("id"), 0)
            if tid <= 0:
                continue
            keep_teams.add(tid)
            conn.execute(
                "INSERT INTO teams (id, name, code, color, coach, updated_at) VALUES (?,?,?,?,?,?)"
                " ON CONFLICT(id) DO UPDATE SET name=excluded.name, code=excluded.code,"
                " color=excluded.color, coach=excluded.coach, updated_at=excluded.updated_at",
                (
                    tid,
                    _text(t.get("name")),
                    _text(t.get("code")),
                    _text(t.get("color"), "#c8102e"),
                    _text(t.get("coach")),
                    now,
                ),
            )
            existing = {
                int(p["id"]): p
                for p in conn.execute("SELECT id, photo_file, video_file FROM players WHERE team_id = ?", (tid,))
            }
            players = t.get("players")
            if not isinstance(players, list):
                continue
            conn.execute("DELETE FROM players WHERE team_id = ?", (tid,))
            for order, p in enumerate(players):
                if not isinstance(p, dict):
                    continue
                pid = _int(p.get("id"), 0)
                if pid <= 0:
                    continue
                photo = _resolve_photo(tid, pid, p.get("photo"))
                old = existing.get(pid)
                video = old["video_file"] if old and old["video_file"] else None
                vpath = find_media(VIDEO_DIR, tid, pid)
                if vpath is None:
                    video = None
                elif p.get("video") and not video:
                    # PUT /api/videos 只写文件不写库，保存名单时按文件补回引用
                    video = f"{vpath.parent.name}/{vpath.name}"
                conn.execute(
                    "INSERT INTO players (team_id, id, sort_order, num, name, pos, captain, photo_file, video_file,"
                    " video_crop, video_trim) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (
                        tid,
                        pid,
                        order,
                        _text(p.get("num")),
                        _text(p.get("name")),
                        _text(p.get("pos")),
                        1 if p.get("captain") else 0,
                        photo,
                        video,
                        _dump_json(p.get("videoCrop")) if video else None,
                        _dump_json(p.get("videoTrim")) if video else None,
                    ),
                )
        for row in conn.execute("SELECT id FROM teams").fetchall():
            tid = int(row["id"])
            if tid not in keep_teams:
                conn.execute("DELETE FROM teams WHERE id = ?", (tid,))

        keep_matches: set[int] = set()
        for m in matches:
            if not isinstance(m, dict):
                continue
            mid = _int(m.get("id"), 0)
            if mid <= 0:
                continue
            keep_matches.add(mid)
            count = max(1, _int(m.get("count"), 6))
            score_log = m.get("scoreLog") if isinstance(m.get("scoreLog"), list) else []
            conn.execute(
                "INSERT INTO matches (id, name, competition, date, home_team_id, away_team_id, player_count,"
                " home_formation, away_formation, status, exported_at, created_at,"
                " score_title, score_home, score_away, score_log)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
                " ON CONFLICT(id) DO UPDATE SET name=excluded.name, competition=excluded.competition,"
                " date=excluded.date, home_team_id=excluded.home_team_id, away_team_id=excluded.away_team_id,"
                " player_count=excluded.player_count, home_formation=excluded.home_formation,"
                " away_formation=excluded.away_formation, status=excluded.status,"
                " exported_at=excluded.exported_at, score_title=excluded.score_title,"
                " score_home=excluded.score_home, score_away=excluded.score_away,"
                " score_log=excluded.score_log",
                (
                    mid,
                    _text(m.get("name")),
                    _text(m.get("competition")),
                    _text(m.get("date")),
                    _int(m.get("homeTeamId"), 0),
                    _int(m.get("awayTeamId"), 0),
                    count,
                    _text(m.get("homeFormation"), "2-2-1"),
                    _text(m.get("awayFormation"), "2-2-1"),
                    _text(m.get("status"), "draft"),
                    m.get("exportedAt") if isinstance(m.get("exportedAt"), (int, float)) else None,
                    _text(m.get("createdAt"), now),
                    _text(m.get("scoreTitle")),
                    max(0, min(99, _int(m.get("scoreHome"), 0))),
                    max(0, min(99, _int(m.get("scoreAway"), 0))),
                    _dump_json_list(
                        [
                            {
                                "id": _int(e.get("id"), 0),
                                "home": max(0, min(99, _int(e.get("home"), 0))),
                                "away": max(0, min(99, _int(e.get("away"), 0))),
                                "at": _num(e.get("at"), 0),
                            }
                            for e in score_log
                            if isinstance(e, dict)
                        ]
                    ),
                ),
            )
            for side in SIDES:
                side_data = m.get(side) if isinstance(m.get(side), dict) else {}
                conn.execute("DELETE FROM match_slots WHERE match_id = ? AND side = ?", (mid, side))
                slots = side_data.get("slots")
                if isinstance(slots, list):
                    for idx, s in enumerate(slots):
                        if not isinstance(s, dict):
                            continue
                        conn.execute(
                            "INSERT INTO match_slots (match_id, side, idx, pos, x, y, pid) VALUES (?,?,?,?,?,?,?)",
                            (
                                mid,
                                side,
                                idx,
                                _text(s.get("pos")),
                                _num(s.get("x"), 50),
                                _num(s.get("y"), 50),
                                _int(s.get("pid"), 0) or None,
                            ),
                        )
                conn.execute("DELETE FROM match_bench WHERE match_id = ? AND side = ?", (mid, side))
                bench = side_data.get("bench")
                if isinstance(bench, list):
                    for order, pid in enumerate(bench):
                        p = _int(pid, 0)
                        if p > 0:
                            conn.execute(
                                "INSERT INTO match_bench (match_id, side, ord, pid) VALUES (?,?,?,?)",
                                (mid, side, order, p),
                            )
                ui = side_data.get("ui") if isinstance(side_data.get("ui"), dict) else {}
                conn.execute(
                    "INSERT INTO match_state (match_id, side, step, view, show_photo, show_name,"
                    " ptw_pid, ptw_text, ptw_hide, score_name_mode, score_name)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(match_id, side) DO UPDATE SET"
                    " step=excluded.step, view=excluded.view, show_photo=excluded.show_photo,"
                    " show_name=excluded.show_name, ptw_pid=excluded.ptw_pid,"
                    " ptw_text=excluded.ptw_text, ptw_hide=excluded.ptw_hide,"
                    " score_name_mode=excluded.score_name_mode, score_name=excluded.score_name",
                    (
                        mid,
                        side,
                        min(6, max(1, _int(ui.get("step"), 1))),
                        "v" if ui.get("view") == "v" else "h",
                        1 if ui.get("showPhoto", True) else 0,
                        1 if ui.get("showName", True) else 0,
                        _int(ui.get("ptwPid"), 0),
                        _text(ui.get("ptwText")),
                        1 if ui.get("ptwHide") else 0,
                        _text(ui.get("scoreNameMode"), "code")
                        if ui.get("scoreNameMode") in ("code", "full", "custom")
                        else "code",
                        _text(ui.get("scoreName"))[:20],
                    ),
                )
        for row in conn.execute("SELECT id FROM matches").fetchall():
            mid = int(row["id"])
            if mid not in keep_matches:
                conn.execute("DELETE FROM matches WHERE id = ?", (mid,))

        view = app.get("view") if app.get("view") in VIEWS else "matches"
        active = _int(app.get("activeMatchId"), 0) or None
        if active is not None and not conn.execute("SELECT 1 FROM matches WHERE id = ?", (active,)).fetchone():
            active = None
            if view == "match":
                view = "matches"
        conn.execute(
            "INSERT INTO app_state (id, view, active_match_id) VALUES (1,?,?)"
            " ON CONFLICT(id) DO UPDATE SET view=excluded.view, active_match_id=excluded.active_match_id",
            (view, active),
        )
        _cleanup_media(conn)
