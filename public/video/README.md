# Host intro

Review at `/test/loading`. The page always offers playback, even after the host intro has played in this tab. Native video controls support seeking, volume and fullscreen.

`host-loading-sound.mp4` combines the six-second video with `41A Ciappili 2.m4a`. It trims the quiet opening at 3.3 seconds, keeps audio through 10.85 seconds, and uses 1.28× tempo with unchanged pitch. Short fades soften the ends. Both tracks start at zero and last six seconds, so pausing or seeking keeps them together.

Rebuild from the supplied recording with FFmpeg, from the project root:

```sh
ffmpeg -y -i public/video/host-loading.mp4 -i '/path/to/41A Ciappili 2.m4a' \
  -filter_complex '[1:a]atrim=start=3.3:end=10.85,asetpts=PTS-STARTPTS,atempo=1.28,loudnorm=I=-18:TP=-2:LRA=7,afade=t=in:d=0.03,afade=t=out:st=5.72:d=0.18,apad,atrim=duration=6[a]' \
  -map 0:v:0 -map '[a]' -c:v copy -c:a aac -b:a 160k -ar 48000 \
  -t 6 -movflags +faststart public/video/host-loading-sound.mp4
```

Home and host pages share this clip. Driver pages skip it. Browsers that block audible autoplay get muted playback. The host intro has no text or buttons. Video and poster fill the viewport with centered cropping; the test page keeps its review controls. The host intro plays through with no skip button or keyboard shortcut. Background music waits until the intro ends. Playback errors and a timeout let the host continue if the video cannot finish. Reduced-motion mode keeps the still poster.
