"""Import the selected kart samples from the user-supplied archive.
Usage: python3 scripts/pack-kart-audio.py /path/to/398013.zip
"""
import array, hashlib, io, json, math, pathlib, re, sys, wave, zipfile
out = pathlib.Path(__file__).resolve().parents[1] / 'public/audio/kart'
out.mkdir(parents=True, exist_ok=True)
specs = {
 'idle': ('Karts/K_Std/idle_NoiseReduction.b.32.wav', True),
 'low': ('Karts/K_Std/AccelBeforeStart.q.32.wav', True),
 'high': ('Karts/K_Std/AccelNormal.ry.32.wav', True),
 'brake': ('Karts/KT_200cc/pSE_KT_03BRK_200cc.aa.wav', False),
 'lift': ('Karts/K_Std/DashEngineStop.ry.32.wav', False),
 'horn': ('Karts/K_Std/pSE_HORN_K_STD.wav', False),
}
manifest = {'source': 'https://sounds.spriters-resource.com/wii_u/mariokart8/asset/398013/', 'samples': {}}
with zipfile.ZipFile(sys.argv[1]) as archive:
 for name, (path, loop) in specs.items():
  raw = archive.read(path)
  with wave.open(io.BytesIO(raw)) as w:
   assert w.getsampwidth() == 2
   channels, rate = w.getnchannels(), w.getframerate()
   samples = array.array('h', w.readframes(w.getnframes()))
  if sys.byteorder != 'little': samples.byteswap()
  frames = [sum(samples[i:i+channels]) / channels / 32768 for i in range(0, len(samples), channels)]
  original_loop = None
  if loop:
   points = re.findall(r'(\d+) samples', archive.read(path[:-4]+'.txt').decode())
   start, end = map(int, points)
   original_loop = [start, end]
   frames = frames[start:end]
   fade = min(int(rate * .025), len(frames)//8)
   # Overlap the end with the beginning, keeping a continuous circular seam.
   seam = [frames[-fade+i]*(1-i/(fade-1))+frames[i]*(i/(fade-1)) for i in range(fade)]
   frames = frames[fade:-fade] + seam
  else:
   fade = min(int(rate * .005), len(frames)//8)
   for i in range(fade):
    frames[i] *= i/fade
    frames[-1-i] *= i/fade
  rms = math.sqrt(sum(s*s for s in frames)/len(frames))
  gain = min(.14/max(rms,1e-6), .85/max(abs(s) for s in frames))
  data = array.array('h', (round(s*gain*32767) for s in frames))
  if sys.byteorder != 'little': data.byteswap()
  with wave.open(str(out/f'{name}.wav'), 'wb') as w:
   w.setparams((1,2,rate,len(frames),'NONE','not compressed')); w.writeframes(data.tobytes())
  manifest['samples'][name] = {'url': f'/audio/kart/{name}.wav', 'loop': loop, 'duration': len(frames)/rate, 'sourceFile': path, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'originalLoopSamples': original_loop}
(out/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Imported',len(specs),'samples;',sum(p.stat().st_size for p in out.glob('*.wav')),'bytes')
