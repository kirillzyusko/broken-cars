# Kart samples

Source: [Mario Kart 8 / Kart Sounds, Sounds Resource](https://sounds.spriters-resource.com/wii_u/mariokart8/asset/398013/).
Original game sounds: Nintendo. Imported at the user's request for this prototype.

The selected standard-kart engine recordings provide idle, low-rev, and high-rev layers. Their accompanying text files define the loop sections. The import script extracts those sections, overlaps 25 ms at each seam, and balances their levels. Brake, throttle-release, and horn samples keep their full duration with 5 ms edge fades. Output is mono PCM WAV at the original sample rate, about 500 KB total.

Rebuild with:

```sh
python3 scripts/pack-kart-audio.py /path/to/398013.zip
```

`manifest.json` records each original archive path, SHA-256, source loop points, and output duration. The runtime loops the prepared engine buffers continuously. It does not concatenate full acceleration recordings or restart them when speed changes.
