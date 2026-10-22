"""Transcription worker for the TrueU.ai Content Cockpit.

Finds `Transcripts` rows with Status "queued" in Airtable, downloads each video from its short-lived
Source URL, turns the audio into text with faster-whisper (open source, runs on CPU) and writes the
text and the time of every sentence back to the row. The app reads the result and writes the YouTube
chapters and description from it.

Run by .github/workflows/transcribe.yml (the app starts it), or by hand:

    AIRTABLE_TOKEN=... AIRTABLE_BASE_ID=... python worker/transcribe.py

Safety: this repo is public, so the workflow log is public. Never print a URL, a transcript or a key.
Errors are reported as a short generic message, because exceptions from `requests` contain the URL.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from urllib.parse import quote

import requests

TABLE = "Transcripts"
MODEL = os.environ.get("WHISPER_MODEL", "small")
MAX_SEGMENT_JSON = 95_000  # Airtable long text holds 100,000 characters


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def format_segments(raw: list[tuple[float, float, str]]) -> list[dict]:
    """(start, end, text) → [{"s", "e", "t"}] with tidy text, one decimal place, empty lines dropped."""
    out = []
    for start, end, text in raw:
        text = " ".join(text.split())
        if text:
            out.append({"s": round(start, 1), "e": round(end, 1), "t": text})
    return out


def fit_segments(segments: list[dict]) -> list[dict]:
    """Make the JSON fit an Airtable long-text field: merge neighbouring segments (less per-segment
    overhead), and only if the words alone are too many, cut the text of the last one."""
    while len(json.dumps(segments, ensure_ascii=False)) > MAX_SEGMENT_JSON and len(segments) > 1:
        merged = []
        for i in range(0, len(segments), 2):
            pair = segments[i : i + 2]
            merged.append(
                {"s": pair[0]["s"], "e": pair[-1]["e"], "t": " ".join(p["t"] for p in pair)}
            )
        segments = merged
    overflow = len(json.dumps(segments, ensure_ascii=False)) - MAX_SEGMENT_JSON
    if overflow > 0:
        segments[-1]["t"] = segments[-1]["t"][: max(0, len(segments[-1]["t"]) - overflow - 3)] + "..."
    return segments


class Airtable:
    def __init__(self, token: str, base_id: str) -> None:
        self.url = f"https://api.airtable.com/v0/{base_id}/{quote(TABLE)}"
        self.headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    def queued(self) -> list[dict]:
        r = requests.get(
            self.url,
            headers=self.headers,
            params={"filterByFormula": '{Status}="queued"', "pageSize": 20},
            timeout=30,
        )
        r.raise_for_status()
        return r.json()["records"]

    def update(self, record_id: str, fields: dict) -> None:
        r = requests.patch(
            f"{self.url}/{record_id}",
            headers=self.headers,
            data=json.dumps({"fields": fields, "typecast": True}),
            timeout=60,
        )
        r.raise_for_status()


def download(url: str, path: str) -> None:
    # No logging and no raise_for_status message: both would contain the link.
    with requests.get(url, stream=True, timeout=(15, 120)) as r:
        if r.status_code != 200:
            raise RuntimeError(f"download failed (HTTP {r.status_code})")
        with open(path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)


def to_wav(src: str, dst: str) -> None:
    """Mono 16 kHz audio, which is what the speech model wants."""
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", dst],
        check=True,
        capture_output=True,
    )


def transcribe(model, wav: str) -> tuple[list[dict], str, float]:
    segments, info = model.transcribe(wav, vad_filter=True, beam_size=5)
    raw = [(s.start, s.end, s.text) for s in segments]
    return format_segments(raw), info.language, float(info.duration)


def main() -> int:
    token = os.environ.get("AIRTABLE_TOKEN")
    base = os.environ.get("AIRTABLE_BASE_ID")
    if not token or not base:
        print("AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set")
        return 2
    db = Airtable(token, base)
    rows = db.queued()
    print(f"{len(rows)} queued transcript(s)")
    if not rows:
        return 0

    from faster_whisper import WhisperModel  # imported late: the download of the model is slow

    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    failed = 0
    for row in rows:
        rid = row["id"]
        fields = row["fields"]
        url = fields.get("Source URL")
        role = fields.get("Role", "video")
        try:
            db.update(rid, {"Status": "running", "Started At": now()})
            if not url:
                raise RuntimeError("no Source URL on the row")
            with tempfile.TemporaryDirectory() as tmp:
                video, wav = os.path.join(tmp, "in.bin"), os.path.join(tmp, "a.wav")
                download(url, video)
                to_wav(video, wav)
                segments, language, duration = transcribe(model, wav)
            segments = fit_segments(segments)
            db.update(
                rid,
                {
                    "Status": "done",
                    "Language": language,
                    "Duration Seconds": round(duration, 1),
                    "Text": " ".join(s["t"] for s in segments),
                    "Segments": json.dumps(segments, ensure_ascii=False),
                    "Source URL": "",
                    "Error": "",
                    "Finished At": now(),
                },
            )
            print(f"done: {role} ({len(segments)} segments, {duration:.0f}s)")
        except Exception as err:  # noqa: BLE001: report, keep going with the other rows
            failed += 1
            # Only the exception's type and a message we wrote ourselves: library messages may hold the URL.
            reason = str(err) if isinstance(err, RuntimeError) else type(err).__name__
            print(f"failed: {role} ({reason[:80]})")
            try:
                db.update(
                    rid,
                    {"Status": "failed", "Error": reason[:300], "Source URL": "", "Finished At": now()},
                )
            except Exception:  # noqa: BLE001
                print("could not record the failure")
    return 1 if failed == len(rows) else 0


if __name__ == "__main__":
    sys.exit(main())
