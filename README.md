# Magik Video Loader

Current folder behavior is selected with **behavior**: **fixed**, **increment & loop** (default), or **increment & hold last**. Fixed keeps the selected file; increment modes advance after each successful load. Old end_behavior settings migrate automatically.
Standalone clone of Load Video Pixaroma from the supplied source. Original MIT license and copyright are preserved in LICENSE. Pixaroma is not required.

## Installation / update
Extract Magik_Video_Loader into ComfyUI/custom_nodes/, replacing the previous package. Using the Python environment that runs ComfyUI:

```bash
python -m pip install -r custom_nodes/Magik_Video_Loader/requirements.txt
```

Restart ComfyUI and hard-refresh the browser (Ctrl+Shift+R). Find Magik → Video → Magik Video Loader.

## Video loading
Select a video, upload (up to 1 GiB), or drop a video onto the node. The preview shows the original source with playback, sound, scrubbing, download, fullscreen and dimensions. Browser codec support can differ from the decoder's support.

Outputs: video_frames (IMAGE), audio (AUDIO), frame_count (INT), fps (FLOAT), width (INT), height (INT), duration (FLOAT).

Max frames bounds the window from the start (0 means all), then Skip first frames removes the front. Max 100 with skip 5 returns 95 frames. Counts apply after forced FPS conversion. Force FPS 0 keeps the source rate; otherwise frames are dropped/duplicated. Both dimensions 0 preserve size; one value scales proportionally; both crop-to-fill without stretching. Audio is trimmed to the loaded window. Unreadable/missing audio returns None. Loading long videos into an IMAGE batch can consume substantial RAM.

## Folder controls
Folder restricts selection and execution to the selected folder. Absolute paths, ~, and paths relative to input/ are supported. Empty uses the normal input-folder selection without an added folder boundary. Include subfolders defaults to enabled; disable it to use files directly inside the selected folder (or input/). The dropdown, loop list and yellow 1-based C/N count use the same list. Uploads go into input/ and require clearing folder first.

## Reliable loop: Superbatcheur approach
The persistent Python cursor owns progression; browser completion events and history polling no longer control which file is loaded. On every load, the loader executes every prompt, including identical queued prompts. Each successful video load reserves the next alphabetical file, wrapping to the first. A decode failure does not commit the cursor. The next file is reserved when this loader completes, not when the entire downstream workflow finishes; a later node failing or being interrupted does not roll back that reservation.

The browser receives a dedicated event and a standard node UI result, both keyed by a stable node UUID. They mirror the next video and C/N without advancing the backend again. Missing a browser event cannot repeat a backend selection. Hidden identity/reset widgets are maintained automatically. Cloned nodes receive separate identities. Manual video changes reset the sequence; folder, subfolder and loop-toggle changes also reset it. State is stored under ComfyUI's user/magik_video_loader directory and survives a restart. Keep this directory when migrating an installation if you want to resume its cursor.

The displayed video is the next selection after the loader returns; the current generation continues using the frames already loaded. Looping never queues more work itself. Hover C/N for the most recent loaded/next status.

## Validation
Run:

```bash
python Magik_Video_Loader/tests/backend_loop_test.py
node Magik_Video_Loader/tests/loop.test.mjs
```

Backend tests cover identical queued inputs, fresh node instances, disk persistence, wraparound, node isolation, reset, failed decoding, include-subfolders and cache invalidation. Frontend tests cover result mirroring, duplicate delivery, missed events, UUID isolation, clone identity, manual resets and cleanup. Python compilation and JavaScript syntax checks also passed. Full video decoding and a live ComfyUI session remain unverified in the build environment.

## Folder browser
The folder text field is replaced by a Browse control above video. Browse folders on the computer running ComfyUI, see videos in each folder, and select Use this folder. Up, Input and Home shortcuts are provided. The × button clears the restriction. Existing saved folder values remain compatible. The C/N display uses an explicitly centered inner layout.

Browse layout update: the in-node folder control now uses a native ComfyUI button instead of a DOM row. The folder dialog retains navigation and includes Clear restriction. The corrected C/N layout is unchanged.

Recent folders: the Browse panel shows the last five folders selected with Use this folder, newest first. Click an entry to open it. Reusing a folder moves it to the top without duplicates. History is shared by video-loader nodes in the same browser/site and persists across reloads; disabled browser storage falls back to session history.

## Navigation, end behavior, and video information
- Previous/Next arrows beside C/N select videos manually and wrap around the list. Manual selection resets the backend cursor. Refresh folder rescans files without changing a selection that still exists.
- Loaded identifies the file whose frames were returned for the generation. Next identifies the dropdown/preview selection ready for the next load. Source info describes Next.
- end_behavior: loop (default, return to the first file) or hold last (repeat the last file). These options never cancel or stop ComfyUI's queue. Already submitted prompts also respect the persisted disabled state.
- sort_order: alphabetical (default, preserving existing behavior) or natural (video1, video2, video10). The dropdown, counter and backend loop use the same order.
- skip_unreadable (off by default): try subsequent files when decoding fails, at most one pass through the eligible list. Wrap mode permits wrapping during recovery; other modes stop searching at the end. Fail clearly when no readable file remains. Skipped filenames and errors appear in the status tooltip and server log. Cancellation, memory exhaustion, missing decoder dependencies, programming errors and an excessive Skip first frames setting propagate as errors rather than silently skipping files.
- The source-info panel reads duration, FPS and display resolution from FFprobe or PyAV. FFprobe is part of FFmpeg; on CachyOS install the ffmpeg package if needed. Metadata is cached for up to 32 file signatures and refreshed when modification time/size changes.
- Estimated batch RAM is width × height × output frames × 3 RGB channels × 4 bytes (float32), using the current trim, FPS and resize settings. Counts are approximate for some containers and variable-frame-rate sources. This is the output tensor alone, not total peak RAM, VRAM, audio, decoder buffers or downstream allocations.
- Pinned folders appear above Recent folders in Browse. Use Pin folder for the current directory or × beside a pinned path to unpin it. Pins and recent folders persist in the browser and are shared by loader nodes on the same ComfyUI site.

Additional checks:

```bash
python Magik_Video_Loader/tests/video_info_test.py
node Magik_Video_Loader/tests/controls.test.mjs
node Magik_Video_Loader/tests/recent_folders.test.mjs
node Magik_Video_Loader/tests/folder_layout.test.mjs
```

The metadata test includes a real tiny FFmpeg-generated video when FFmpeg/FFprobe are available. Controls are exercised with a simulated DOM; live ComfyUI rendering and full frame decoding remain unverified in this environment.

See BUGFIXES.md for the latest code-review fixes and validation limits. Additional decoder checks: python Magik_Video_Loader/tests/decoder_regressions_test.py.

Counter layout: C/N and Previous/Next now share one 28-pixel native canvas widget. The arrow buttons fit entirely inside that row at all canvas zoom levels. Regression check: node Magik_Video_Loader/tests/counter.test.mjs.

Large navigation controls: Previous/Next now use 84-pixel-high buttons with much larger arrow glyphs. The 1st button immediately after C/N selects the first video in the current sorted folder list and resets the backend cursor through the same manual-selection callback. It does not queue a generation.

Navigation UI upgrade v19: a separate automatically loaded extension upgrades old counter rows even when the main loader module is cached. Counter/control imports also carry a new cache version. Open workflow nodes are upgraded to fit the 96px row with 84px arrows and a 1st button. Browser console confirms: [Magik Video Loader] Large navigation v19 loaded.
