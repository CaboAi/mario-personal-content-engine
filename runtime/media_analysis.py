"""Private, temporary media inspection for Instagram saves.

Creator media is downloaded into an operating-system temporary directory,
converted into transcript and mechanical observations, and deleted when the
function returns. Raw media URLs and files never enter the dashboard payload.
"""

from __future__ import annotations

import math
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


MAX_MEDIA_BYTES = 100 * 1024 * 1024
ALLOWED_MEDIA_HOST_SUFFIXES = (".cdninstagram.com", ".fbcdn.net")
_MODELS: dict[tuple[str, str], Any] = {}


def _candidate_url(candidate: Any) -> str:
    return str(candidate.get("url") or "") if isinstance(candidate, dict) else ""


def _best_candidate(candidates: Any) -> dict[str, Any] | None:
    if not isinstance(candidates, list):
        return None
    valid = [candidate for candidate in candidates if isinstance(candidate, dict) and candidate.get("url")]
    if not valid:
        return None
    return max(valid, key=lambda item: int(item.get("width") or 0) * int(item.get("height") or 0))


def extract_media_assets(media: dict[str, Any]) -> list[dict[str, Any]]:
    """Return transient CDN descriptors without downloading or persisting them."""
    assets: list[dict[str, Any]] = []

    def append_item(item: dict[str, Any], index: int) -> None:
        video = _best_candidate(item.get("video_versions"))
        image_versions = item.get("image_versions2")
        image = _best_candidate(image_versions.get("candidates")) if isinstance(image_versions, dict) else None
        chosen = video or image
        if not chosen:
            return
        assets.append(
            {
                "kind": "video" if video else "image",
                "url": _candidate_url(chosen),
                "width": int(chosen.get("width") or 0),
                "height": int(chosen.get("height") or 0),
                "index": index,
            }
        )

    carousel = media.get("carousel_media")
    if isinstance(carousel, list) and carousel:
        for index, item in enumerate(carousel[:10]):
            if isinstance(item, dict):
                append_item(item, index)
    else:
        append_item(media, 0)
    return assets


def validate_media_url(url: str) -> None:
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or parsed.port not in (None, 443):
        raise ValueError("Instagram media assets must use HTTPS.")
    if not any(hostname.endswith(suffix) for suffix in ALLOWED_MEDIA_HOST_SUFFIXES):
        raise ValueError("Instagram returned an unexpected media host.")


def download_asset(
    url: str,
    destination: Path,
    *,
    session: requests.Session | None = None,
    max_bytes: int = MAX_MEDIA_BYTES,
) -> None:
    validate_media_url(url)
    client = session or requests.Session()
    with client.get(url, stream=True, timeout=(15, 90), allow_redirects=False) as response:
        response.raise_for_status()
        content_length = int(response.headers.get("content-length") or 0)
        if content_length > max_bytes:
            raise ValueError("Saved media exceeds the local inspection limit.")
        written = 0
        with destination.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=256 * 1024):
                if not chunk:
                    continue
                written += len(chunk)
                if written > max_bytes:
                    raise ValueError("Saved media exceeds the local inspection limit.")
                handle.write(chunk)


def _whisper_model(model_name: str, model_cache: Path):
    key = (model_name, str(model_cache))
    if key not in _MODELS:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper is not installed. Install runtime/requirements.txt."
            ) from exc
        model_cache.mkdir(parents=True, exist_ok=True)
        _MODELS[key] = WhisperModel(
            model_name,
            device="cpu",
            compute_type="int8",
            download_root=str(model_cache),
        )
    return _MODELS[key]


def transcribe_video(path: Path, model_name: str, model_cache: Path) -> tuple[str, str]:
    model = _whisper_model(model_name, model_cache)
    segments, info = model.transcribe(
        str(path),
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=False,
    )
    realized = list(segments)
    transcript = " ".join(segment.text.strip() for segment in realized if segment.text.strip())
    if not transcript:
        return "", "No intelligible speech was detected."
    first_speech = min((segment.start for segment in realized), default=0.0)
    language = str(getattr(info, "language", "unknown") or "unknown")
    probability = float(getattr(info, "language_probability", 0.0) or 0.0)
    summary = (
        f"Local Whisper detected {language} speech with {probability:.0%} confidence; "
        f"speech begins around {first_speech:.1f} seconds."
    )
    return transcript[:40_000], summary


def inspect_video_mechanics(path: Path) -> str:
    try:
        import av
        import numpy as np
    except ImportError as exc:
        raise RuntimeError("The faster-whisper media decoder is unavailable.") from exc

    samples: list[Any] = []
    width = 0
    height = 0
    duration = 0.0
    with av.open(str(path)) as container:
        stream = next((candidate for candidate in container.streams if candidate.type == "video"), None)
        if stream is None:
            return "The asset contains audio but no decodable video stream."
        width, height = int(stream.width or 0), int(stream.height or 0)
        if stream.duration is not None and stream.time_base is not None:
            duration = float(stream.duration * stream.time_base)
        elif container.duration is not None:
            duration = float(container.duration / 1_000_000)
        sample_interval = max(duration / 20.0, 0.5) if duration else 1.0
        next_sample = 0.0
        for frame in container.decode(stream):
            timestamp = float(frame.time or 0.0)
            if timestamp + 0.001 < next_sample:
                continue
            gray = frame.reformat(width=64, height=36, format="gray").to_ndarray().astype("float32")
            samples.append(gray)
            next_sample = timestamp + sample_interval
            if len(samples) >= 24:
                break

    differences = [float(np.mean(np.abs(current - previous))) for previous, current in zip(samples, samples[1:])]
    strong_changes = sum(value >= 24.0 for value in differences)
    mean_change = sum(differences) / len(differences) if differences else 0.0
    motion = "low" if mean_change < 7 else "moderate" if mean_change < 16 else "high"
    orientation = "vertical" if height > width else "square" if height == width else "horizontal"
    transition_phrase = (
        "no strong sampled scene changes"
        if not strong_changes
        else f"about {strong_changes} strong sampled visual transition{'s' if strong_changes != 1 else ''}"
    )
    duration_phrase = f" over {duration:.1f} seconds" if duration and math.isfinite(duration) else ""
    return (
        f"Decoded a {orientation} {width}x{height} video{duration_phrase}. "
        f"Sampled frame activity is {motion}, with {transition_phrase}. "
        "This is mechanical evidence only; it does not identify the creator's topic or visual subject."
    )


def inspect_saved_media(
    post: dict[str, Any],
    *,
    model_name: str = "small.en",
    model_cache: Path,
    session: requests.Session | None = None,
) -> dict[str, str]:
    assets = list(post.get("_analysis_assets") or [])
    if not assets:
        raise RuntimeError("Instagram did not return a temporary media asset for inspection.")

    with tempfile.TemporaryDirectory(prefix="mario-save-analysis-") as temporary:
        temporary_dir = Path(temporary)
        video = next((asset for asset in assets if asset.get("kind") == "video"), None)
        if video:
            destination = temporary_dir / "save.mp4"
            download_asset(str(video["url"]), destination, session=session)
            transcript, speech_summary = transcribe_video(destination, model_name, model_cache)
            mechanics = inspect_video_mechanics(destination)
            return {
                "transcript": transcript,
                "visual_observations": f"{speech_summary} {mechanics}",
            }

        dimensions = [
            f"slide {index + 1}: {int(asset.get('width') or 0)}x{int(asset.get('height') or 0)}"
            for index, asset in enumerate(assets)
        ]
        return {
            "transcript": "",
            "visual_observations": (
                f"Instagram returned {len(assets)} static asset{'s' if len(assets) != 1 else ''}. "
                f"Known dimensions: {', '.join(dimensions)}. "
                "No claim is made about slide text or visual subject without frame-level vision evidence."
            ),
        }
