"""Header-only source metadata and an explicit float32 frame-batch RAM estimate."""
import json
import os
from functools import lru_cache
import math
import shutil
import subprocess


def _rate(value):
    try:
        if isinstance(value, str) and "/" in value:
            a, b = value.split("/", 1)
            result = float(a) / float(b)
        else:
            result = float(value or 0)
        return result if math.isfinite(result) and result > 0 else 0.0
    except (ValueError, ZeroDivisionError, TypeError):
        return 0.0


def probe_source(path):
    stat = os.stat(path)
    return dict(_probe_source(path, stat.st_mtime_ns, stat.st_size))


@lru_cache(maxsize=32)
def _probe_source(path, mtime_ns, size_bytes):
    binary = shutil.which("ffprobe")
    if binary:
        proc = subprocess.run([binary, "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,avg_frame_rate,r_frame_rate,nb_frames,duration:stream_tags=rotate:stream_side_data=rotation:format=duration",
            "-of", "json", path], capture_output=True, timeout=15, check=True)
        data = json.loads(proc.stdout)
        streams = data.get("streams", [])
        if not streams:
            raise ValueError("No video stream found.")
        stream = streams[0]
        width, height = int(stream.get("width", 0)), int(stream.get("height", 0))
        rotation = stream.get("tags", {}).get("rotate", 0)
        for side in stream.get("side_data_list", []):
            rotation = side.get("rotation", rotation)
        if int(round(float(rotation) / 90)) % 2:
            width, height = height, width
        fps = _rate(stream.get("avg_frame_rate")) or _rate(stream.get("r_frame_rate"))
        duration = _rate(stream.get("duration")) or _rate(data.get("format", {}).get("duration"))
        frames = int(_rate(stream.get("nb_frames"))) or int(round(duration * fps))
    else:
        try:
            import av
        except ImportError as exc:
            raise RuntimeError("Source info needs ffprobe (FFmpeg) or PyAV.") from exc
        with av.open(path) as container:
            if not container.streams.video:
                raise ValueError("No video stream found.")
            stream = container.streams.video[0]
            stream.thread_type = "NONE"
            width, height = stream.codec_context.width, stream.codec_context.height
            # Decode one frame only to obtain the same rotation used by the loader.
            frame = next(container.decode(stream), None)
            if frame is not None and int(round(getattr(frame, "rotation", 0) / 90)) % 2:
                width, height = height, width
            fps = _rate(stream.average_rate or stream.guessed_rate)
            duration = float(stream.duration * stream.time_base) if stream.duration and stream.time_base else float(container.duration or 0) / 1_000_000
            frames = int(stream.frames or round(duration * fps))
    return {"width": width, "height": height, "fps": fps,
            "duration": max(0, duration), "frame_count": frames}


def estimate_batch(meta, *, max_frames=0, skip_first_frames=0, force_fps=0,
                   custom_width=0, custom_height=0):
    width, height = meta["width"], meta["height"]
    fps = force_fps or meta["fps"]
    native_count = meta.get("frame_count") or 0
    native_fps = meta.get("fps") or 0
    known = bool(native_count or (meta.get("duration") and fps))
    if native_count and native_fps and fps:
        count = math.ceil(native_count * fps / native_fps - 1e-9)
    elif meta.get("duration") and fps:
        count = math.ceil(meta["duration"] * fps - 1e-9)
    else:
        count = native_count
    if max_frames > 0:
        count = min(count, max_frames) if known else max_frames
        known = True  # Upper bound when total source length is unknown.
    count = max(0, count - skip_first_frames)
    if custom_width and custom_height:
        width, height = custom_width, custom_height
    elif custom_width and width:
        height, width = max(1, round(height * custom_width / width)), custom_width
    elif custom_height and height:
        width, height = max(1, round(width * custom_height / height)), custom_height
    return {"frame_count": count, "width": width, "height": height,
            "fps": fps, "tensor_bytes": count * width * height * 3 * 4 if known and width and height else None}
