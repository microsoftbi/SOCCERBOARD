"""FastAPI 入口：状态读写、照片/视频文件、健康检查、生产静态托管。"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import db

MAX_VIDEO_BYTES = 40 * 1024 * 1024
MAX_PHOTO_BYTES = 8 * 1024 * 1024
CHUNK = 64 * 1024
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)$")

app = FastAPI(title="SOCCERBOARD", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(127\.0\.0\.1|localhost)(:\d+)?",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _serve_file(request: Request, path: Path, media_type: str, cache: str) -> Any:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    size = path.stat().st_size
    headers = {"Accept-Ranges": "bytes", "Cache-Control": cache}
    range_header = request.headers.get("range", "").strip()
    m = RANGE_RE.match(range_header)
    if not m or not range_header:
        return FileResponse(path, media_type=media_type, headers=headers)

    start_s, end_s = m.groups()
    if start_s:
        start = int(start_s)
        end = int(end_s) if end_s else size - 1
    elif end_s:
        start = max(0, size - int(end_s))
        end = size - 1
    else:
        start, end = 0, size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        raise HTTPException(
            status_code=416,
            detail="range not satisfiable",
            headers={"Content-Range": f"bytes */{size}"},
        )

    length = end - start + 1

    def stream() -> Iterator[bytes]:
        with path.open("rb") as f:
            f.seek(start)
            remain = length
            while remain > 0:
                chunk = f.read(min(CHUNK, remain))
                if not chunk:
                    break
                remain -= len(chunk)
                yield chunk

    headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    headers["Content-Length"] = str(length)
    return StreamingResponse(stream(), status_code=206, headers=headers, media_type=media_type)


@app.get("/api/health")
def health() -> dict[str, Any]:
    library = db.load_library()
    return {
        "ok": True,
        "storage": "sqlite",
        "db": str(db.DB_PATH),
        "hasData": library is not None,
    }


@app.get("/api/library")
def get_library() -> Any:
    return db.load_library()


@app.put("/api/library")
async def put_library(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="body must be json")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="library must be an object")
    try:
        db.save_library(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}


@app.get("/api/photos/{team_id}/{player_id}")
def get_photo(team_id: int, player_id: int, request: Request) -> Any:
    path = db.find_media(db.PHOTO_DIR, team_id, player_id)
    if path is None:
        raise HTTPException(status_code=404, detail="photo not found")
    suffix = path.suffix.lower().lstrip(".")
    media_type = "image/jpeg" if suffix in ("jpg", "jpeg") else f"image/{suffix}"
    return _serve_file(request, path, media_type, "public, max-age=31536000, immutable")


@app.put("/api/photos/{team_id}/{player_id}")
async def put_photo(team_id: int, player_id: int, request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="body must be json")
    data = payload.get("data") if isinstance(payload, dict) else None
    if not isinstance(data, str) or not data.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="data must be an image data url")
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="photo too large")
    try:
        rel = db.save_photo_data_url(team_id, player_id, data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    path = db.PHOTO_DIR / rel
    return {"ok": True, "url": db.media_url("photos", team_id, player_id, path)}


@app.delete("/api/photos/{team_id}/{player_id}")
def delete_photo(team_id: int, player_id: int) -> dict[str, Any]:
    db.delete_media(db.PHOTO_DIR, team_id, player_id)
    return {"ok": True}


@app.get("/api/videos/{team_id}/{player_id}")
def get_video(team_id: int, player_id: int, request: Request) -> Any:
    path = db.find_media(db.VIDEO_DIR, team_id, player_id)
    if path is None:
        raise HTTPException(status_code=404, detail="video not found")
    suffix = path.suffix.lower()
    media_type = {
        ".webm": "video/webm",
        ".mov": "video/quicktime",
        ".m4v": "video/x-m4v",
    }.get(suffix, "video/mp4")
    return _serve_file(request, path, media_type, "no-cache")


@app.head("/api/videos/{team_id}/{player_id}")
def head_video(team_id: int, player_id: int) -> Any:
    path = db.find_media(db.VIDEO_DIR, team_id, player_id)
    if path is None:
        raise HTTPException(status_code=404, detail="video not found")
    return Response(
        status_code=200,
        headers={"Content-Length": str(path.stat().st_size), "Accept-Ranges": "bytes"},
    )


@app.put("/api/videos/{team_id}/{player_id}")
async def put_video(team_id: int, player_id: int, request: Request) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "video/mp4")
    if not content_type.startswith("video/") and content_type != "application/octet-stream":
        raise HTTPException(status_code=400, detail="body must be a video")
    length = request.headers.get("content-length")
    if length and int(length) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="video too large")
    raw = await request.body()
    if len(raw) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=413, detail="video too large")
    rel = db.save_video_bytes(team_id, player_id, content_type, raw)
    return {"ok": True, "path": rel}


@app.delete("/api/videos/{team_id}/{player_id}")
def delete_video(team_id: int, player_id: int) -> dict[str, Any]:
    db.delete_media(db.VIDEO_DIR, team_id, player_id)
    return {"ok": True}


DIST_DIR = Path(__file__).resolve().parent.parent / "app" / "dist"

db.init_db()

if (DIST_DIR / "index.html").is_file():
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="app")


if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.environ.get("SOCCERBOARD_PORT", "8010"))
    uvicorn.run(app, host="127.0.0.1", port=port)
