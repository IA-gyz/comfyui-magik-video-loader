# Code review fixes

- Corrected forced-FPS sampling: frame intervals now include the final source frame. Previously a 30-frame/30-FPS clip converted to 60 FPS returned 59 frames, and duplicated frames were shifted.
- Frame caps no longer consume one extra source/resampled frame.
- Cancellation and memory errors propagate instead of invoking the fallback decoder.
- Audio extraction checks Stop while FFmpeg runs, terminates/reaps the child, and cleans up temporary files on cancellation. FFmpeg no longer inherits interactive stdin.
- Delayed duplicate UI results cannot roll the displayed selection back after a newer result.
- Unused per-node locks are weakly held and can be reclaimed.
- Skip-unreadable runs cannot be incorrectly cached from the original failed-file signature. Missing selections can recover without bypassing folder restrictions.
- Broken/ineligible symlinks are excluded from nonrecursive input listings.
- Unknown clip length displays an unknown RAM estimate rather than zero. FPS conversion uses native frame-count metadata when duration is missing.
- Previous/Next handles a selection no longer present in the list correctly.
- Async refresh/info callbacks do not update disposed controls.
- Preview dimension labels survive refreshing an unchanged selection. Explicit Refresh reloads the preview even when the filename is unchanged. Removing a node stops and unloads its video element.

Validation: all seven regression scripts passed, plus Python compilation and changed JavaScript syntax checks. Metadata integration used a real FFmpeg-generated video; audio cancellation used a real child process. Frame sampling uses synthetic arrays without PyTorch. Browser control tests use a simulated DOM. A live ComfyUI/browser session and full PyTorch video decode remain unverified.

## Invalid end behavior / saved layout recovery
Old or malformed saved end_behavior/sort_order values are normalized before execution. Invalid values use wrap/alphabetical with a terminal warning instead of crashing. The browser repairs values on load and before API serialization. New workflow saves retain a named magikVideoSettings map so restoring settings does not depend on UI-only widget positions. Valid existing choices are preserved. After updating, reload and re-save the workflow once. Tests: settings.test.mjs and legacy-mode cases in backend_loop_test.py.

Behavior selector update: end_behavior is renamed behavior with fixed, increment & loop, and increment & hold last. Fixed ignores the persisted advancing cursor and supports ordinary file-signature caching. Old API arguments, named saved settings and positional saved arrays migrate to the matching new mode. Backend and frontend migration tests passed.

Navigation v20: verified removal of old counter widgets, reused the current row on repeated creation/configuration, and deduplicated already affected nodes. Regression tests reproduce two current rows and exercise both index-based and object-based removal API behavior.
