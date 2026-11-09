"""Magik Video Loader — upload/pick a video, decode it to a frame batch plus
audio and metadata, with a built-in <video> preview on the node body.

The partner to Save Mp4 Magik: Load Video's `frames`/`audio` outputs wire
straight into Save Mp4's `video_frames`/`audio` inputs. Decode + audio logic
lives in nodes/_video_helpers.py (PyAV primary, imageio fallback, ffmpeg for
audio) so the node file stays thin.
"""

import os
import re
import uuid

from ._loop_state import cursor_lock, read_state, write_state, choose_video

import folder_paths

from ._video_helpers import VIDEO_EXTS, decode, extract_audio, trim_audio


def _list_input_videos(include_subfolders=True):
    """Video files in ComfyUI's input/ folder (walked recursively so uploads in
    input/magik_video_loader/ and any user subfolders appear). Paths are relative to
    input/ with forward slashes, matching folder_paths.get_annotated_filepath."""
    input_dir = folder_paths.get_input_directory()
    files = []
    if os.path.isdir(input_dir):
        for root, _dirs, fnames in os.walk(input_dir):
            if not include_subfolders:
                _dirs[:] = []
            rel_root = os.path.relpath(root, input_dir)
            for fname in fnames:
                ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
                if ext not in VIDEO_EXTS:
                    continue
                full = os.path.join(root, fname)
                if not os.path.isfile(full):
                    continue
                if not include_subfolders and os.path.dirname(os.path.realpath(full)) != os.path.realpath(input_dir):
                    continue
                rel = fname if rel_root == "." else os.path.join(rel_root, fname)
                files.append(rel.replace("\\", "/"))
    return sorted(files)


def resolve_folder(folder):
    value = str(folder or "").strip()
    if not value:
        return None
    value = os.path.expanduser(value)
    if not os.path.isabs(value):
        value = os.path.join(folder_paths.get_input_directory(), value)
    root = os.path.realpath(value)
    if not os.path.isdir(root):
        raise ValueError(f"Folder not found: {folder}")
    return root


def resolve_video(video, folder="", include_subfolders=True):
    if not video:
        raise ValueError("No video selected.")
    root = resolve_folder(folder)
    if root:
        path = os.path.realpath(os.path.join(root, video))
        if os.path.commonpath([root, path]) != root:
            raise ValueError("Selected video is outside the specified folder.")
    else:
        path = folder_paths.get_annotated_filepath(video)
    if not include_subfolders:
        direct_root = root or os.path.realpath(folder_paths.get_input_directory())
        if os.path.dirname(os.path.realpath(path)) != direct_root:
            raise ValueError("Include subfolders is disabled; select a video directly inside the folder.")
    if not path or not os.path.isfile(path):
        raise ValueError(f"Video not found: {video}")
    if os.path.splitext(path)[1].lower().lstrip(".") not in VIDEO_EXTS:
        raise ValueError("Unsupported video extension.")
    return path


def sort_videos(files, sort_order="alphabetical"):
    if sort_order == "natural":
        return sorted(files, key=lambda name: ([int(part) if part.isdigit() else part.casefold()
                       for part in re.split(r"(\d+)", name)], name))
    return sorted(files)


def list_folder_videos(folder="", include_subfolders=True, sort_order="alphabetical"):
    root = resolve_folder(folder)
    if root is None:
        return sort_videos(_list_input_videos(include_subfolders), sort_order)
    files = []
    for base, dirs, names in os.walk(root, followlinks=False):
        if not include_subfolders:
            dirs[:] = []
        for name in names:
            rel = os.path.relpath(os.path.join(base, name), root).replace("\\", "/")
            try:
                resolve_video(rel, root, include_subfolders)
            except ValueError:
                continue
            files.append(rel)
    return sort_videos(files, sort_order)


def normalize_mode(value, allowed, default, name):
    original = value
    if isinstance(value, (list, tuple)) and len(value) == 1:
        value = value[0]
    if isinstance(value, dict):
        value = value.get("value")
    normalized = value.strip().lower().replace("_", " ") if isinstance(value, str) else ""
    if name in ("behavior", "end_behavior"):
        normalized = {"wrap": "increment & loop", "loop": "increment & loop",
                      "disable loop": "increment & loop", "hold last": "increment & hold last"}.get(normalized, normalized)
    if normalized not in allowed:
        print(f"[Magik Video Loader] Invalid saved {name} {repr(original)[:80]}; using {default!r}. Re-save the workflow after updating.")
        return default
    return normalized


class MagikVideoLoader:
    DESCRIPTION = (
        "Magik Video Loader - upload or pick a video and decode it to a frame "
        "batch, with a built-in video preview on the node so you can watch the "
        "source without leaving ComfyUI. The size of the chosen video is shown "
        "on the top left of the node, beside the outputs.\n\n"
        "Outputs: video_frames (the video as an image batch), audio, "
        "frame_count, fps, width, height, and duration - so you usually do not "
        "need a separate video-info node. Pairs with Save Mp4 Magik: wire "
        "video_frames and audio straight across.\n\n"
        "Loading controls: Max frames sets how many frames to load from the "
        "start (a safety valve for long clips), Skip first frames then trims the "
        "front, Force FPS resamples to a steady frame rate, and Custom "
        "width/height resize each frame (set both to crop-to-fill that size "
        "without stretching).\n\n"
        "Reads with PyAV when available, otherwise imageio; audio is pulled with "
        "ffmpeg. No extra setup is needed on most ComfyUI installs."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "folder": ("STRING", {"default": "", "tooltip": "Only load videos inside this folder (including subfolders). Absolute paths and ~ are supported; relative paths are relative to ComfyUI input/. Empty = no folder restriction."}),
                "video": (_list_input_videos(), {
                    "tooltip": "The video to load. Browse a folder, pick from the dropdown, or drop a video file onto the node."}),
                "max_frames": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1,
                    "tooltip": "How many frames to load from the start of the video (the first N). 0 = load all of them. Limits the frame window after FPS conversion; lowering FPS can still require decoding more source frames. Skip first frames then trims the front of these, so Max frames 100 with Skip 5 gives 95."}),
                "force_fps": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 240.0, "step": 1.0,
                    "tooltip": "Force a steady frames-per-second by dropping or duplicating frames (e.g. a 60fps clip forced to 24). 0 = keep the video's original rate. AI video models usually expect a fixed rate like 24."}),
                "skip_first_frames": ("INT", {"default": 0, "min": 0, "max": 100000, "step": 1,
                    "tooltip": "Skip this many frames from the start, like trimming an intro. 0 = start at the beginning. Trims the front of the loaded frames, and the sound is cut the same way, so it stays in sync."}),
                "custom_width": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1,
                    "tooltip": "Resize frames as they load. 0 = keep the original. Set only width OR only height to scale proportionally. Set BOTH to crop-to-fill that exact size: it scales to fill the box, keeps the picture's proportions, and trims the overflow (like Resize Crop). It never stretches."}),
                "custom_height": ("INT", {"default": 0, "min": 0, "max": 8192, "step": 1,
                    "tooltip": "Resize frames as they load. 0 = keep the original. Set only width OR only height to scale proportionally. Set BOTH to crop-to-fill that exact size: it scales to fill the box, keeps the picture's proportions, and trims the overflow (like Resize Crop). It never stretches."}),
                "include_subfolders": ("BOOLEAN", {"default": True,
                    "tooltip": "Include videos in nested folders in the dropdown, count, and loop. Disable to use only files directly inside the selected folder (or input/ when folder is empty)."}),
            },
            "optional": {
                "loop_identity": ("STRING", {"default": ""}),
                "loop_reset": ("STRING", {"default": ""}),
                "behavior": (["fixed", "increment & loop", "increment & hold last"], {"default": "increment & loop", "tooltip": "Fixed keeps the selected video. Increment & loop advances and wraps to the first video. Increment & hold last advances and stays on the last video. Never queues or stops a generation."}),
                "sort_order": (["alphabetical", "natural"], {"default": "alphabetical", "tooltip": "Natural sorting puts video2 before video10. Applies to the dropdown and loop."}),
                "skip_unreadable": ("BOOLEAN", {"default": False, "tooltip": "Try the next file if decoding fails. Reports skipped files. Interruptions, memory errors, and invalid trim settings are never skipped."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    CATEGORY = "Magik/Video"
    RETURN_TYPES = ("IMAGE", "AUDIO", "INT", "FLOAT", "INT", "INT", "FLOAT")
    RETURN_NAMES = ("video_frames", "audio", "frame_count", "fps", "width", "height", "duration")
    OUTPUT_TOOLTIPS = (
        "The video as a batch of image frames, after any trim and resize.",
        "The video's soundtrack (no audio is passed on if the file has none). Wire into Save Mp4 to keep the sound.",
        "How many frames were loaded.",
        "Frames per second of the loaded clip (matches Force FPS when set).",
        "Frame width in pixels, after any resize.",
        "Frame height in pixels, after any resize.",
        "Length of the loaded clip in seconds.",
    )
    FUNCTION = "load"

    def load(self, video, max_frames=0, force_fps=0.0, skip_first_frames=0,
             custom_width=0, custom_height=0, folder="", loop_through_folder=False,
             include_subfolders=True, loop_identity="", loop_reset="", unique_id="",
             behavior=None, sort_order="alphabetical", skip_unreadable=False, end_behavior=None):
        behavior = normalize_mode(behavior if behavior is not None else end_behavior if end_behavior is not None else "increment & loop",
                                  ("fixed", "increment & loop", "increment & hold last"), "increment & loop", "behavior")
        loop_through_folder = behavior != "fixed"
        sort_order = normalize_mode(sort_order, ("alphabetical", "natural"), "alphabetical", "sort_order")
        identity = loop_identity or ("legacy:" + str(unique_id))
        with cursor_lock(identity):
            files = list_folder_videos(folder, include_subfolders, sort_order)
            scope = [resolve_folder(folder) or os.path.realpath(folder_paths.get_input_directory()),
                     bool(include_subfolders), sort_order, behavior]
            state = read_state(identity)
            selected = choose_video(files, video, scope, loop_reset, state) if loop_through_folder else video
            if selected not in files and skip_unreadable and files:
                # A missing selection can recover, but never bypass a folder boundary.
                if selected:
                    try:
                        resolve_video(selected, folder, include_subfolders)
                    except ValueError as exc:
                        if "outside" in str(exc) or "disabled" in str(exc):
                            raise
                selected = files[0]
            if selected not in files:
                resolve_video(selected, folder, include_subfolders)
                raise ValueError("Selected video is no longer in this folder. Refresh the folder.")
            first = files.index(selected)
            candidates = files[first:]
            if behavior == "increment & loop":
                candidates += files[:first]
            if not skip_unreadable:
                candidates = [selected]
            skipped = []
            for selected in candidates:
                try:
                    output = self._load_one(selected, max_frames, force_fps, skip_first_frames,
                                           custom_width, custom_height, folder, loop_through_folder, include_subfolders)
                    break
                except Exception as exc:
                    # Cancellation/resource exhaustion and user trim errors must reach ComfyUI.
                    name = type(exc).__name__.lower()
                    message = str(exc)
                    if (not skip_unreadable or isinstance(exc, (MemoryError, ImportError))
                            or not (isinstance(exc, (OSError, ValueError, RuntimeError, EOFError)) or type(exc).__module__.startswith(("av.", "imageio.")))
                            or "interrupt" in name or "cancel" in name or "out of memory" in message.lower()
                            or "Skip first frames" in message or "needs a video reader" in message):
                        raise
                    skipped.append({"video": selected, "error": message[:300]})
                    print(f"[Magik Video Loader] Skipped {selected}: {message}")
            else:
                details = "; ".join(f"{item['video']}: {item['error']}" for item in skipped[:5])
                raise ValueError(f"No readable video found ({len(skipped)} failed). {details}")
            index = files.index(selected)
            at_end = index == len(files) - 1
            next_video = selected if behavior == "fixed" else files[index + 1] if not at_end else files[0] if behavior == "increment & loop" else selected
            write_state(identity, {"scope": scope, "reset": loop_reset, "next": next_video})
            payload = {"node_id": str(unique_id), "identity": loop_identity,
                       "reset": loop_reset, "folder": folder, "include_subfolders": bool(include_subfolders),
                       "current": selected, "next": next_video, "files": files,
                       "loop": bool(loop_through_folder), "disable_loop": False,
                       "behavior": behavior, "sort_order": sort_order,
                       "skipped": skipped, "token": uuid.uuid4().hex}
            output["ui"]["magik_video_cursor"] = [payload]
            try:
                from server import PromptServer
                PromptServer.instance.send_sync("magik_video_loader_cursor", payload)
            except Exception as exc:
                print(f"[Magik Video Loader] UI notification failed: {exc}")
            return output

    def _load_one(self, video, max_frames=0, force_fps=0.0, skip_first_frames=0,
             custom_width=0, custom_height=0, folder="", loop_through_folder=False, include_subfolders=True):
        if not video:
            raise ValueError(
                "[Magik] Load Video — no video selected. Browse a folder "
                "or pick one from the dropdown."
            )
        path = resolve_video(video, folder, include_subfolders)

        result = decode(
            path,
            max_frames=max_frames,
            force_fps=force_fps,
            skip_first=skip_first_frames,
            custom_w=custom_width,
            custom_h=custom_height,
        )
        audio = extract_audio(path)
        # The sound follows the frames: Skip first frames moves its start and Max
        # frames its end, both counted at the output fps (load-video.md #14).
        fps_out = float(result["fps"] or 0.0)
        if audio is not None and fps_out > 0:
            audio = trim_audio(audio, max(0, int(skip_first_frames or 0)) / fps_out,
                               result["frame_count"] / fps_out)

        print(
            f"[Magik] Load Video — {os.path.basename(path)}: "
            f"{result['frame_count']} frames @ {result['fps']:.3f}fps, "
            f"{result['width']}x{result['height']}, {result['duration']:.3f}s"
            f"{' +audio' if audio else ''}"
        )
        return {"ui": {"magik_video_loader": [{"folder": folder, "video": video,
                    "include_subfolders": bool(include_subfolders), "loop": bool(loop_through_folder)}]}, "result": (
            result["frames"], audio, result["frame_count"], result["fps"],
            result["width"], result["height"], result["duration"],
        )}

    @classmethod
    def IS_CHANGED(cls, video, behavior=None, end_behavior=None, **kwargs):
        mode = behavior if behavior is not None else end_behavior
        if mode != "fixed" or kwargs.get("skip_unreadable", False):
            return float("nan")
        try:
            path = resolve_video(video, kwargs.get("folder", ""), kwargs.get("include_subfolders", True))
            stat = os.stat(path)
            return f"{stat.st_mtime_ns}:{stat.st_size}"
        except (ValueError, OSError):
            return float("nan")

    @classmethod
    def VALIDATE_INPUTS(cls, video, folder="", include_subfolders=True, loop_through_folder=False, skip_unreadable=False, **kwargs):
        try:
            if not list_folder_videos(folder, include_subfolders, kwargs.get("sort_order", "alphabetical")):
                return "No videos in the selected folder."
            # Never bypass the folder boundary for a supplied outside path.
            if video:
                try:
                    resolve_video(video, folder, include_subfolders)
                except ValueError as exc:
                    if "outside" in str(exc) or "disabled" in str(exc):
                        raise
        except (ValueError, OSError) as exc:
            return str(exc)
        return True


NODE_CLASS_MAPPINGS = {"MagikVideoLoader": MagikVideoLoader}
NODE_DISPLAY_NAME_MAPPINGS = {"MagikVideoLoader": "Magik Video Loader"}
