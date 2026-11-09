"""Run without a ComfyUI install: python tests/backend_loop_test.py."""
import importlib
import math
from pathlib import Path
import sys
import tempfile
import types

root = Path(__file__).resolve().parents[1]
pkg = types.ModuleType('mvl_test'); pkg.__path__ = [str(root)]; sys.modules[pkg.__name__] = pkg
helpers = types.ModuleType('mvl_test._video_helpers')
helpers.VIDEO_EXTS = {'mp4', 'mkv'}
helpers.decode = helpers.extract_audio = helpers.trim_audio = lambda *a, **k: None
sys.modules[helpers.__name__] = helpers
fp = types.ModuleType('folder_paths'); sys.modules['folder_paths'] = fp
server = types.ModuleType('server')
server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(send_sync=lambda *a: None))
sys.modules['server'] = server
with tempfile.TemporaryDirectory() as tmp:
    base = Path(tmp); clips = base/'input'; clips.mkdir(); (clips/'nested').mkdir()
    for name in ['a.mp4', 'b.mp4', 'c.mp4', 'nested/d.mp4']: (clips/name).touch()
    fp.get_input_directory = lambda: str(clips)
    fp.get_user_directory = lambda: str(base/'user')
    fp.get_annotated_filepath = lambda name: str(clips/name)
    m = importlib.import_module('mvl_test.magik_video_loader')
    loaded = []
    def decoder(self, video, *args):
        loaded.append(video)
        return {'ui': {}, 'result': ('frames', None, 1, 24., 8, 8, 1/24)}
    m.MagikVideoLoader._load_one = decoder
    def run(**kwargs):
        args = dict(video='a.mp4', folder=str(clips), loop_through_folder=True,
                    include_subfolders=False, loop_identity='node-A', loop_reset='reset-A')
        args.update(kwargs)
        # Fresh instance each time, no browser updates, same already queued input.
        return m.MagikVideoLoader().load(**args)['ui']['magik_video_cursor'][0]
    assert [run()['current'] for _ in range(5)] == ['a.mp4','b.mp4','c.mp4','a.mp4','b.mp4']
    assert run(loop_identity='node-B')['current'] == 'a.mp4'
    assert run(video='c.mp4',loop_reset='manual')['current'] == 'c.mp4'
    # Failed decoding leaves persisted next cursor unchanged.
    m.MagikVideoLoader._load_one = lambda *a: (_ for _ in ()).throw(ValueError('decode failed'))
    try: run(loop_reset='manual')
    except ValueError: pass
    m.MagikVideoLoader._load_one = decoder
    assert run(loop_reset='manual')['current'] == 'a.mp4'
    assert run(loop_identity='legacy-false',loop_through_folder=False,video='c.mp4')['current'] == 'c.mp4'
    assert run(video='b.mp4',loop_reset='manual-b')['current'] == 'b.mp4'
    assert run(include_subfolders=True)['files'] == ['a.mp4','b.mp4','c.mp4','nested/d.mp4']
    assert math.isnan(m.MagikVideoLoader.IS_CHANGED('a.mp4',loop_through_folder=True))
    # Cursor survives a state-module reload, as it would a server restart.
    state = importlib.import_module('mvl_test._loop_state')
    saved = state.read_state('node-A'); importlib.reload(state)
    assert state.read_state('node-A') == saved
    assert m.sort_videos(['video10.mp4','video2.mp4','video1.mp4'],'natural') == ['video1.mp4','video2.mp4','video10.mp4']
    assert m.sort_videos(['video10.mp4','video2.mp4','video1.mp4'],'alphabetical') == ['video1.mp4','video10.mp4','video2.mp4']
    assert [run(loop_identity='hold',end_behavior='hold last')['current'] for _ in range(5)] == ['a.mp4','b.mp4','c.mp4','c.mp4','c.mp4']
    events = [run(loop_identity='disable',end_behavior='disable loop') for _ in range(5)]
    assert [event['current'] for event in events] == ['a.mp4','b.mp4','c.mp4','a.mp4','b.mp4']
    assert not any(event['disable_loop'] for event in events)
    # Identical queued submissions cannot restart looping after auto-disable.
    assert not events[4]['disable_loop']
    assert run(loop_identity='disable',end_behavior='disable loop',loop_reset='enable-again')['current'] == 'a.mp4'
    def flaky(self, video, *args):
        if video == 'a.mp4': raise ValueError('corrupt video')
        return decoder(self, video, *args)
    m.MagikVideoLoader._load_one = flaky
    skipped = run(loop_identity='skip',skip_unreadable=True)
    assert skipped['current'] == 'b.mp4' and skipped['skipped'][0]['video'] == 'a.mp4'
    try: run(loop_identity='no-skip',skip_unreadable=False)
    except ValueError as exc: assert 'corrupt' in str(exc)
    else: raise AssertionError('Unreadable file should fail with skip disabled')
    m.MagikVideoLoader._load_one = lambda *args: (_ for _ in ()).throw(ValueError('corrupt'))
    try: run(loop_identity='all-corrupt',skip_unreadable=True)
    except ValueError as exc: assert '3 failed' in str(exc)
    else: raise AssertionError('All corrupt must fail without endless wrapping')
    for error in (MemoryError('memory'), type('InterruptProcessingException',(Exception,),{})('stop'), TypeError('programming error')):
        def fail(*args): raise error
        m.MagikVideoLoader._load_one = fail
        try: run(loop_identity='dont-skip',skip_unreadable=True)
        except type(error): pass
        else: raise AssertionError('Resource, cancellation and programming errors must propagate')
    m.MagikVideoLoader._load_one = decoder
    assert math.isnan(m.MagikVideoLoader.IS_CHANGED('a.mp4',skip_unreadable=True))
    assert run(loop_identity='removed-selection',loop_through_folder=False,video='removed.mp4',skip_unreadable=True)['current']=='a.mp4'
    try:
        (clips/'escape.mp4').symlink_to(base/'not-here.mp4')
    except OSError:
        pass
    assert 'escape.mp4' not in m.list_folder_videos('',False)
    print('Passed backend cursor regressions plus natural sorting, hold/disable end behavior, stale queued inputs, unreadable recovery, all-corrupt bounds, and cancellation/resource-error propagation.')

    for n, value in enumerate([None, False, "", "outdated-value", 17]):
        result=run(loop_identity=f'legacy-{n}',end_behavior=value,sort_order=value)
        assert result['behavior']=='increment & loop' and result['sort_order']=='alphabetical'
    assert run(loop_identity='legacy-alias',end_behavior=' HOLD_LAST ',sort_order={'value':'natural'})['behavior']=='increment & hold last'
    print('Passed malformed/legacy saved modes, canonical aliases, and backend default recovery without an execution crash.')

    inputs=m.MagikVideoLoader.INPUT_TYPES()
    assert 'loop_through_folder' not in inputs['required']
    assert inputs['optional']['behavior'][0]==['fixed','increment & loop','increment & hold last']
    assert [run(loop_identity='always-on',loop_through_folder=False)['current'] for _ in range(4)]==['a.mp4','b.mp4','c.mp4','a.mp4']
    print('Passed removed-toggle schema, loop/hold choices, automatic progression, and legacy false/disable settings migration.')

    assert 'end_behavior' not in inputs['optional']
    assert [run(loop_identity='fixed-mode',behavior='fixed',video='b.mp4')['current'] for _ in range(3)]==['b.mp4']*3
    assert run(loop_identity='fixed-mode',behavior='fixed',video='c.mp4')['current']=='c.mp4'
    assert [run(loop_identity='new-loop-mode',behavior='increment & loop')['current'] for _ in range(4)]==['a.mp4','b.mp4','c.mp4','a.mp4']
    assert [run(loop_identity='new-hold-mode',behavior='increment & hold last')['current'] for _ in range(4)]==['a.mp4','b.mp4','c.mp4','c.mp4']
    assert isinstance(m.MagikVideoLoader.IS_CHANGED('a.mp4',behavior='fixed'),str)
    assert math.isnan(m.MagikVideoLoader.IS_CHANGED('a.mp4',behavior='increment & loop'))
    print('Passed fixed/increment-loop/increment-hold behavior, manual fixed selection and fixed-mode cache signatures.')
