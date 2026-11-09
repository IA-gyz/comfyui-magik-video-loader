"""Array-level decoder regressions; no PyTorch/ComfyUI install required."""
from pathlib import Path
import gc
import importlib.util
import sys
import types
import numpy as np
sys.modules['torch']=types.ModuleType('torch')
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('helpers',root/'_video_helpers.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
assert list(h._resample_iter(iter(range(3)),3,6)) == [0,0,1,1,2,2]
assert list(h._resample_iter(iter(range(6)),6,3)) == [0,2,4]
assert len(list(h._resample_iter(iter(range(30)),30,60))) == 60
assert len(list(h._resample_iter(iter(range(24)),24,30))) == 30
consumed=[]
def frames():
    for n in range(20):
        consumed.append(n)
        yield np.full((4,6,3),n,dtype=np.uint8)
out,fps=h._collect(frames(),24,0,1,3,0,0)
assert len(out)==2 and consumed==[0,1,2] and out[0][0,0,0]==1
# An interrupted/resource-failed PyAV decode must never start imageio.
h._AV_OK=h._IMAGEIO_OK=True
called=[]
h._decode_imageio=lambda *a:called.append('fallback')
for error in [MemoryError('test'),type('InterruptProcessingException',(Exception,),{})('stop'),RuntimeError('CUDA out of memory')]:
    def fail(*args):raise error
    h._decode_av=fail
    try:h.decode('ignored')
    except type(error):pass
    else:raise AssertionError('Cancellation/allocation error swallowed')
assert called==[]
# Normal decode errors still use the second backend.
h._decode_av=lambda *a:(_ for _ in ()).throw(ValueError('bad codec'))
def fallback(*args):called.append('fallback');raise ValueError('fallback sentinel')
h._decode_imageio=fallback
try:h.decode('ignored')
except ValueError as exc:assert str(exc)=='fallback sentinel'
assert called==['fallback']
spec=importlib.util.spec_from_file_location('cursor_state',root/'_loop_state.py')
state=importlib.util.module_from_spec(spec);spec.loader.exec_module(state)
lock=state.cursor_lock('test');assert state.cursor_lock('test') is lock
assert len(state._locks)==1
del lock;gc.collect();assert len(state._locks)==0
print('Passed forced-FPS count/content, final-frame duration, exact decode cap, cancellation/memory propagation, normal fallback, and lock reclamation.')

# Exercise cancellation against a real child process, not just a mocked decoder.
original_check=h._interrupt_check
checks=[]
class InterruptProcessingException(Exception):pass
def interrupt():
    checks.append(True)
    if len(checks)>1:raise InterruptProcessingException('stop')
h._interrupt_check=interrupt
try:h._run_audio_process([sys.executable,'-c','import time; time.sleep(10)'])
except InterruptProcessingException:pass
else:raise AssertionError('Audio extraction did not propagate Stop')
h._interrupt_check=original_check
result=h._run_audio_process([sys.executable,'-c','pass'])
assert result.returncode==0
print('Passed real-child-process audio cancellation, cleanup, and success.')
