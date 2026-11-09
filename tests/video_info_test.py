import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
spec=importlib.util.spec_from_file_location('info',Path(__file__).resolve().parents[1]/'_video_info.py')
info=importlib.util.module_from_spec(spec);spec.loader.exec_module(info)
meta={'width':1920,'height':1080,'fps':24,'duration':10,'frame_count':240}
batch=info.estimate_batch(meta,max_frames=100,skip_first_frames=5,custom_width=960)
assert batch['frame_count']==95 and batch['width']==960 and batch['height']==540
assert batch['tensor_bytes']==95*960*540*3*4
assert info.estimate_batch(meta,force_fps=12)['frame_count']==120
assert info.estimate_batch(meta,custom_width=512,custom_height=512)['width']==512
assert info._rate('30000/1001')>29.9 and info._rate('0/0')==0
if shutil.which('ffmpeg') and shutil.which('ffprobe'):
    with tempfile.TemporaryDirectory() as tmp:
        video=Path(tmp)/'tiny.mp4'
        subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','color=c=blue:s=48x32:r=12:d=0.5','-c:v','libx264','-pix_fmt','yuv420p',str(video)],check=True)
        meta=info.probe_source(str(video))
        assert meta['width']==48 and meta['height']==32 and meta['fps']==12
        assert meta['frame_count']==6 and abs(meta['duration']-.5)<.01
        assert info.estimate_batch(meta)['tensor_bytes']==6*48*32*12
        print('Passed real FFmpeg/ffprobe metadata integration and batch-RAM calculation.')
else: print('Skipped real ffprobe test; binaries unavailable.')
print('Passed FPS parsing, resize/crop estimates, trim/frame cap, resampling, and byte estimates.')

unknown={'width':640,'height':360,'fps':24,'duration':0,'frame_count':0}
assert info.estimate_batch(unknown)['tensor_bytes'] is None
assert info.estimate_batch(unknown,max_frames=10)['frame_count']==10
known_count={**unknown,'frame_count':24}
assert info.estimate_batch(known_count,force_fps=60)['frame_count']==60
print('Passed unknown-length RAM reporting and FPS conversion with frame-count-only metadata.')
