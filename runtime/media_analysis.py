"""Private, temporary media inspection for Instagram saves.

Creator media is downloaded into an operating-system temporary directory,
converted into transcript and mechanical observations, and deleted when the
function returns. Raw media URLs and files never enter the dashboard payload.
"""

from __future__ import annotations

import base64
import io
import math
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests


MAX_MEDIA_BYTES = 100 * 1024 * 1024
MAX_VISUAL_FRAMES = 6
MAX_RECREATE_VISUAL_FRAMES = 20
MAX_FRAME_BYTES = 450 * 1024
MAX_RECREATE_FRAME_PAYLOAD_BYTES = 3 * 1024 * 1024
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


def inspect_video_mechanics(path: Path) -> dict[str, Any]:
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
            return {"duration_seconds": 0.0, "cut_times": [], "cut_count": 0, "summary": "The asset contains audio but no decodable video stream."}
        width, height = int(stream.width or 0), int(stream.height or 0)
        if stream.duration is not None and stream.time_base is not None:
            duration = float(stream.duration * stream.time_base)
        elif container.duration is not None:
            duration = float(container.duration / 1_000_000)
        sample_interval = 0.25 if duration else 1.0
        next_sample = 0.0
        for frame in container.decode(stream):
            timestamp = float(frame.time or 0.0)
            if timestamp + 0.001 < next_sample:
                continue
            gray = frame.reformat(width=64, height=36, format="gray").to_ndarray().astype("float32")
            samples.append(gray)
            next_sample = timestamp + sample_interval
            if len(samples) >= 240:
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
    summary = (
        f"Decoded a {orientation} {width}x{height} video{duration_phrase}. "
        f"Sampled frame activity is {motion}, with {transition_phrase}. "
        "This is mechanical evidence only; it does not identify the creator's topic or visual subject."
    )
    cut_times: list[float] = []
    previous_cut = -1.0
    for index, difference in enumerate(differences, start=1):
        timestamp = index * sample_interval
        if difference >= 24.0 and timestamp - previous_cut >= 0.5:
            cut_times.append(min(timestamp, duration))
            previous_cut = timestamp
    return {"duration_seconds": duration, "cut_times": cut_times, "cut_count": len(cut_times), "summary": summary}


def _frame_dimensions(width: int, height: int, max_dimension: int) -> tuple[int, int]:
    scale = min(1.0, max_dimension / max(width, height, 1))
    resized_width = max(2, int(width * scale))
    resized_height = max(2, int(height * scale))
    # The JPEG encoder uses 4:2:0 chroma and therefore needs even dimensions.
    return resized_width - resized_width % 2, resized_height - resized_height % 2


def _encode_frame_as_jpeg(frame: Any, *, max_dimension: int = 640) -> bytes:
    import av

    width, height = _frame_dimensions(int(frame.width), int(frame.height), max_dimension)
    resized = frame.reformat(width=width, height=height, format="yuvj420p")
    buffer = io.BytesIO()
    with av.open(buffer, mode="w", format="image2pipe") as output:
        stream = output.add_stream("mjpeg")
        stream.width = width
        stream.height = height
        stream.pix_fmt = "yuvj420p"
        stream.options = {"qscale": "5"}
        for packet in stream.encode(resized):
            output.mux(packet)
        for packet in stream.encode():
            output.mux(packet)
    encoded = buffer.getvalue()
    if len(encoded) > MAX_FRAME_BYTES and max_dimension > 384:
        return _encode_frame_as_jpeg(frame, max_dimension=384)
    if len(encoded) > MAX_FRAME_BYTES:
        raise ValueError("A visual evidence frame exceeds the inspection limit.")
    return encoded


def _visual_frame(frame: Any, *, timestamp: float, kind: str, max_dimension: int = 640) -> dict[str, Any]:
    encoded = base64.b64encode(_encode_frame_as_jpeg(frame, max_dimension=max_dimension)).decode("ascii")
    return {
        "label": f"{kind} at {timestamp:.1f}s",
        "timestamp_seconds": round(timestamp, 2),
        "kind": kind,
        "data_url": f"data:image/jpeg;base64,{encoded}",
    }


def _evenly_spaced_times(duration: float, count: int) -> list[float]:
    if count <= 1 or duration <= 0:
        return [0.0]
    return [duration * index / (count - 1) for index in range(count)]


def _widely_spaced_cut_times(cut_times: list[float], limit: int) -> list[float]:
    if len(cut_times) <= limit:
        return cut_times
    selected = [cut_times[0], cut_times[-1]] if limit > 1 else [cut_times[0]]
    while len(selected) < limit:
        candidate = max(
            (time for time in cut_times if time not in selected),
            key=lambda time: min(abs(time - chosen) for chosen in selected),
        )
        selected.append(candidate)
    return sorted(selected)


def _payload_guard(frames: list[dict[str, Any]], budget: int = MAX_RECREATE_FRAME_PAYLOAD_BYTES) -> list[dict[str, Any]]:
    """Keep high-value cut frames; discard only low-detail fills when the request is too large."""
    kept = list(frames)
    while sum(len(str(frame["data_url"]).encode("utf-8")) for frame in kept) > budget:
        fill_index = next((index for index, frame in enumerate(kept) if frame["kind"] == "fill"), None)
        if fill_index is None:
            raise ValueError("Recreate frame payload exceeds the safe limit without any fill samples to remove.")
        kept.pop(fill_index)
    return kept


def plan_video_frame_targets(duration: float, cut_times: list[float], *, recreate: bool) -> list[tuple[float, str]]:
    """Choose frame times before decoding: cut grammar first, uniform confirmation second."""
    if not recreate:
        return [(time, "opening" if index == 0 else "closing" if index == MAX_VISUAL_FRAMES - 1 else "fill") for index, time in enumerate(_evenly_spaced_times(duration, MAX_VISUAL_FRAMES))]
    target_count = max(MAX_VISUAL_FRAMES, min(MAX_RECREATE_VISUAL_FRAMES, round(duration / 3.0)))
    selected_cuts = _widely_spaced_cut_times(cut_times, max(0, target_count - 2))
    targets = [(0.0, "opening"), *[(min(duration, cut + 0.1), "post-cut") for cut in selected_cuts], (max(0.0, duration - 0.1), "closing")]
    existing_times = [time for time, _ in targets]
    for time in _evenly_spaced_times(duration, target_count):
        if len(targets) >= target_count:
            break
        if all(abs(time - existing) >= 0.35 for existing in existing_times):
            targets.append((time, "fill"))
            existing_times.append(time)
    return sorted(targets, key=lambda item: item[0])


def extract_video_visual_frames(path: Path, *, recreate: bool = False, mechanics: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Extract labeled frames. Recreate saves preserve cut grammar; reference saves stay lightweight."""
    try:
        import av
    except ImportError as exc:
        raise RuntimeError("The faster-whisper media decoder is unavailable.") from exc

    frames: list[dict[str, str]] = []
    with av.open(str(path)) as container:
        stream = next((candidate for candidate in container.streams if candidate.type == "video"), None)
        if stream is None:
            return frames
        if stream.duration is not None and stream.time_base is not None:
            duration = float(stream.duration * stream.time_base)
        elif container.duration is not None:
            duration = float(container.duration / 1_000_000)
        else:
            duration = 0.0

        targets = plan_video_frame_targets(duration, list((mechanics or {}).get("cut_times") or []), recreate=recreate)

        target_index = 0
        for frame in container.decode(stream):
            timestamp = float(frame.time or 0.0)
            while target_index < len(targets) and timestamp + 0.05 >= targets[target_index][0]:
                target_time, kind = targets[target_index]
                frames.append(_visual_frame(frame, timestamp=target_time, kind=kind, max_dimension=384 if recreate else 640))
                target_index += 1
            if target_index >= len(targets):
                break
    return _payload_guard(frames) if recreate else frames[:MAX_VISUAL_FRAMES]


def extract_static_visual_frame(path: Path, label: str) -> dict[str, str]:
    try:
        import av
    except ImportError as exc:
        raise RuntimeError("The saved-media decoder is unavailable.") from exc

    with av.open(str(path)) as container:
        stream = next((candidate for candidate in container.streams if candidate.type == "video"), None)
        if stream is None:
            raise RuntimeError("The saved image could not be decoded.")
        frame = next(container.decode(stream), None)
        if frame is None:
            raise RuntimeError("The saved image did not contain a decodable frame.")
        return _visual_frame(frame, timestamp=0.0, kind="fill")


def inspect_saved_media(
    post: dict[str, Any],
    *,
    model_name: str = "small.en",
    model_cache: Path,
    session: requests.Session | None = None,
    recreate: bool = False,
) -> dict[str, Any]:
    assets = list(post.get("_analysis_assets") or [])
    if not assets:
        raise RuntimeError("Instagram did not return a temporary media asset for inspection.")

    with tempfile.TemporaryDirectory(prefix="mario-save-analysis-") as temporary:
        temporary_dir = Path(temporary)
        is_multi_asset_post = len(assets) > 1 or str(post.get("content_type") or "") == "Carousel"
        video = None if is_multi_asset_post else next(
            (asset for asset in assets if asset.get("kind") == "video"),
            None,
        )
        if video:
            destination = temporary_dir / "save.mp4"
            download_asset(str(video["url"]), destination, session=session)
            transcript, speech_summary = transcribe_video(destination, model_name, model_cache)
            mechanics = inspect_video_mechanics(destination)
            visual_frames = extract_video_visual_frames(destination, recreate=recreate, mechanics=mechanics)
            high_detail_count = sum(frame["kind"] != "fill" for frame in visual_frames) if recreate else len(visual_frames)
            low_detail_count = len(visual_frames) - high_detail_count if recreate else 0
            return {
                "transcript": transcript,
                "visual_observations": (
                    f"{speech_summary} {mechanics['summary']} "
                    f"{len(visual_frames)} representative frame(s) accompany this evidence."
                ),
                "visual_frames": visual_frames,
                "measured_duration_seconds": mechanics["duration_seconds"],
                "detected_cut_count": mechanics["cut_count"],
                "frame_stats": {"frame_count": len(visual_frames), "high_detail_count": high_detail_count, "low_detail_count": low_detail_count, "cache_hit": False, "recreate": recreate},
            }

        visual_frames: list[dict[str, str]] = []
        for index, asset in enumerate(assets[:MAX_VISUAL_FRAMES]):
            destination = temporary_dir / f"slide-{index + 1}.media"
            download_asset(str(asset["url"]), destination, session=session, max_bytes=20 * 1024 * 1024)
            label = f"Carousel slide {index + 1}" if is_multi_asset_post else "Static post image"
            visual_frames.append(extract_static_visual_frame(destination, label))
        dimensions = [
            f"slide {index + 1}: {int(asset.get('width') or 0)}x{int(asset.get('height') or 0)}"
            for index, asset in enumerate(assets)
        ]
        return {
            "transcript": "",
            "visual_observations": (
                f"Instagram returned {len(assets)} static asset{'s' if len(assets) != 1 else ''}. "
                f"Known dimensions: {', '.join(dimensions)}. "
                f"{len(visual_frames)} slide frame(s) accompany this evidence for visual inspection."
            ),
            "visual_frames": visual_frames,
            "measured_duration_seconds": 0.0,
            "detected_cut_count": 0,
            "frame_stats": {"frame_count": len(visual_frames), "high_detail_count": len(visual_frames), "low_detail_count": 0, "cache_hit": False, "recreate": recreate},
        }
