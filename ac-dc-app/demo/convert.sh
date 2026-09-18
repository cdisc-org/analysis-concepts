#!/bin/bash
# Convert the recorded webm to mp4 -- but only replace the existing mp4 once the
# new file is verified. A truncated webm previously clobbered a good take.
set -euo pipefail
cd "$(dirname "$0")"

WEBM=$(ls -t *.webm 2>/dev/null | head -1) || { echo "no webm found"; exit 1; }
SIZE=$(stat -f%z "$WEBM")
echo "source: $WEBM ($((SIZE/1024/1024)) MB)"
[ "$SIZE" -lt 5000000 ] && { echo "REFUSING: webm is only $((SIZE/1024)) KB - recording did not flush"; exit 1; }

SRC_DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$WEBM")
echo "source duration: ${SRC_DUR%.*}s"
[ "${SRC_DUR%.*}" -lt 300 ] && { echo "REFUSING: source is only ${SRC_DUR%.*}s"; exit 1; }

ffmpeg -y -loglevel error -i "$WEBM" -c:v libx264 -preset slow -crf 20 \
       -pix_fmt yuv420p -movflags +faststart .tmp-out.mp4
OUT_DUR=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 .tmp-out.mp4)
[ "${OUT_DUR%.*}" -lt 300 ] && { echo "REFUSING: output only ${OUT_DUR%.*}s"; rm -f .tmp-out.mp4; exit 1; }

mv .tmp-out.mp4 esap-pfs-demo.mp4
printf "OK  esap-pfs-demo.mp4  %d:%02d  %.1f MB\n" \
  $((${OUT_DUR%.*}/60)) $((${OUT_DUR%.*}%60)) \
  "$(echo "$(stat -f%z esap-pfs-demo.mp4)/1048576" | bc -l)"
