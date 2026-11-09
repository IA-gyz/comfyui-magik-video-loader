import os
import re
from pathlib import Path
from aiohttp import web
import folder_paths
from server import PromptServer
_WIN_RESERVED_NAMES = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1,10)), *(f"LPT{i}" for i in range(1,10))}
_LOAD_VIDEO_UPLOAD_EXTS = {
    "mp4", "mov", "mkv", "webm", "avi", "m4v", "gif",
    "mpg", "mpeg", "wmv", "flv", "ogv", "ts",
}
_LOAD_VIDEO_MAX_BYTES = 1024 * 1024 * 1024  # 1 GB
# _WIN_RESERVED_NAMES is imported at the top of this file. It used to be defined
# here as well, so the workflow folder check and this upload check were two
# copies of the same list - one source now, in the module that has tests.


@PromptServer.instance.routes.post("/magik_video_loader/api/load_video/upload")
async def load_video_upload(request):
    """Save an uploaded video into ComfyUI's input/ root (like native uploads)
    so the Load Video node lists it by its plain name and any other node can
    reuse it; the in-node <video> preview fetches it via /view?type=input.
    Extension allow-list, streamed size cap, path-traversal-safe target."""
    reader = await request.multipart()
    # Find the 'file' part. Validate its name/extension BEFORE reading the body
    # so the file streams straight to disk with an incremental size cap, instead
    # of buffering the whole upload (up to 1 GB) in memory first.
    field = None
    while True:
        f = await reader.next()
        if f is None:
            break
        if f.name == "file":
            field = f
            break

    if field is None or not field.filename:
        return web.json_response({"error": "file field is missing."}, status=400)

    base = os.path.basename(field.filename.replace("\\", "/"))
    stem, ext = os.path.splitext(base)
    ext = ext.lower().lstrip(".")
    if ext not in _LOAD_VIDEO_UPLOAD_EXTS:
        return web.json_response(
            {"error": f"video extension {ext!r} not allowed."}, status=400,
        )
    stem = re.sub(r"[^A-Za-z0-9_\- ]", "_", stem).strip().strip(".") or "video"
    # Reserved Windows device names (NUL/CON/COM1/...) resolve to a device, not a
    # file - suffix them so the upload writes a real file.
    if stem.upper() in _WIN_RESERVED_NAMES:
        stem = stem + "_"

    # Save into ComfyUI's input/ root (like native uploads) so the file is a
    # first-class input: it shows by its plain name and any other node that
    # lists input/ can reuse it. Claim a free filename ATOMICALLY with O_EXCL so
    # two concurrent uploads of the same name can't pick the same target and
    # clobber each other. The sanitized stem has no separators, so the target
    # stays directly under input/ (realpath-checked anyway).
    input_dir = os.path.realpath(folder_paths.get_input_directory())
    try:
        os.makedirs(input_dir, exist_ok=True)
    except OSError:
        pass
    candidate = f"{stem}.{ext}"
    n = 1
    fd = None
    target = None
    while True:
        target = os.path.realpath(os.path.join(input_dir, candidate))
        if not (target == input_dir or target.startswith(input_dir + os.sep)):
            return web.json_response({"error": "path traversal blocked."}, status=400)
        try:
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            break
        except FileExistsError:
            candidate = f"{stem}_{n}.{ext}"
            n += 1
            if n > 100000:
                return web.json_response(
                    {"error": "could not find a free filename."}, status=500,
                )

    def _rm_target():
        try:
            os.remove(target)
        except OSError:
            pass

    # Stream chunks to the claimed file, enforcing the cap as we go; clean up the
    # partial file on overflow or any write error so input/ never accumulates
    # half-written uploads.
    written = 0
    too_big = False
    try:
        with os.fdopen(fd, "wb") as fh:
            while True:
                chunk = await field.read_chunk(262144)  # 256 KB
                if not chunk:
                    break
                written += len(chunk)
                if written > _LOAD_VIDEO_MAX_BYTES:
                    too_big = True
                    break
                fh.write(chunk)
    except Exception as e:
        _rm_target()
        print(f"[Magik] Load Video — upload write failed: {e}")
        return web.json_response(
            {"error": "could not save the uploaded file."}, status=500,
        )

    if too_big:
        _rm_target()
        return web.json_response({"error": "file too large (over 1 GB)."}, status=400)
    if written == 0:
        _rm_target()
        return web.json_response({"error": "the uploaded file was empty."}, status=400)

    return web.json_response({
        "name": candidate,    # plain filename in input/ root, like native uploads
        "subfolder": "",
        "filename": candidate,
        "type": "input",
    })



@PromptServer.instance.routes.get("/magik_video_loader/api/asset")
async def magik_video_loader_asset(request):
    root = (Path(__file__).parent / "assets").resolve()
    target = (root / request.query.get("path", "")).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise web.HTTPNotFound()
    return web.FileResponse(target)


@PromptServer.instance.routes.get("/magik_video_loader/api/videos")
async def folder_videos(request):
    import asyncio
    from .magik_video_loader import list_folder_videos
    try:
        videos = await asyncio.to_thread(list_folder_videos, request.query.get("folder", ""),
                                         request.query.get("include_subfolders", "true").lower() != "false",
                                         request.query.get("sort_order", "alphabetical"))
        return web.json_response({"videos": videos})
    except (ValueError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.get("/magik_video_loader/api/video")
async def folder_video_preview(request):
    from .magik_video_loader import resolve_video
    try:
        path = resolve_video(request.query.get("video", ""), request.query.get("folder", ""),
                             request.query.get("include_subfolders", "true").lower() != "false")
    except (ValueError, OSError) as exc:
        return web.json_response({"error": str(exc)}, status=400)
    return web.FileResponse(path)


@PromptServer.instance.routes.get("/magik_video_loader/api/folders")
async def browse_video_folders(request):
    import asyncio
    from ._video_helpers import VIDEO_EXTS

    def scan():
        raw = request.query.get("path", "").strip()
        path = os.path.expanduser(raw) if raw else folder_paths.get_input_directory()
        if not os.path.isabs(path):
            path = os.path.join(folder_paths.get_input_directory(), path)
        path = os.path.realpath(path)
        folders, videos = [], []
        with os.scandir(path) as entries:
            for entry in entries:
                try:
                    if entry.is_dir():
                        folders.append(entry.name)
                    elif entry.is_file() and entry.name.rsplit(".", 1)[-1].lower() in VIDEO_EXTS:
                        videos.append(entry.name)
                except OSError:
                    continue
        return {"path": path, "parent": os.path.dirname(path),
                "folders": sorted(folders), "videos": sorted(videos)}
    try:
        return web.json_response(await asyncio.to_thread(scan))
    except (OSError, ValueError) as exc:
        return web.json_response({"error": str(exc)}, status=400)


@PromptServer.instance.routes.get("/magik_video_loader/api/info")
async def video_source_info(request):
    import asyncio
    from .magik_video_loader import resolve_video
    from ._video_info import probe_source, estimate_batch
    try:
        path = resolve_video(request.query.get("video", ""), request.query.get("folder", ""),
                             request.query.get("include_subfolders", "true") != "false")
        meta = await asyncio.to_thread(probe_source, path)
        options = {}
        for name in ("max_frames", "skip_first_frames", "custom_width", "custom_height"):
            options[name] = max(0, min(100000, int(request.query.get(name, "0"))))
        options["force_fps"] = max(0, min(240, float(request.query.get("force_fps", "0"))))
        return web.json_response({"source": meta, "batch": estimate_batch(meta, **options)})
    except Exception as exc:
        return web.json_response({"error": str(exc)}, status=400)
