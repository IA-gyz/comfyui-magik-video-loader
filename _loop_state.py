"""Backend-owned cursor, committed only after a successful video load."""
import hashlib
import json
import os
import tempfile
import threading
import weakref
from pathlib import Path

_guard = threading.Lock()
_locks = weakref.WeakValueDictionary()


def cursor_lock(identity):
    with _guard:
        return _locks.setdefault(identity, threading.RLock())


def state_path(identity):
    import folder_paths
    get_user = getattr(folder_paths, "get_user_directory", None)
    root = Path(get_user() if get_user else Path(folder_paths.get_input_directory()).parent / "user")
    return root / "magik_video_loader" / (hashlib.sha256(identity.encode()).hexdigest() + ".json")


def read_state(identity):
    try:
        value = json.loads(state_path(identity).read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def write_state(identity, state):
    path = state_path(identity)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(state, f)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def choose_video(files, requested, scope, reset, state):
    if not files:
        raise ValueError("No video files in the selected folder.")
    if state.get("scope") == scope and state.get("reset") == reset:
        next_video = state.get("next")
        if next_video in files:
            return next_video
    if requested in files:
        return requested
    return files[0]
