"""
Read-time normalization for Artist and Collection documents.

Why this module exists:
  Production MongoDB (Atlas) contains Artist and Collection documents that
  were written by older / AI-generation code paths and now fail Pydantic v2
  strict validation when the list endpoints try to convert them. The
  symptom (production regression): dashboard counts 11 artists, but the
  Artist Roster screen shows 0 because /api/artists raises 500 and the
  frontend silently treats that as an empty list.

  We deliberately do NOT mutate the stored documents — this is read-time
  only, applied inside the list/detail endpoints. A separate, opt-in
  repair endpoint can be written later if the team wants a one-shot
  cleanup.

Sequence per the user spec:
  1. Read MongoDB document (raw dict).
  2. Normalize known legacy or malformed shapes (preserve recoverable info).
  3. Validate the normalized dict against the Pydantic model.
  4. Return the validated object if validation succeeds.
  5. Only skip if it remains impossible to validate after normalization.
  6. Log the document id and exact validation error when skipped.

Preservation rules (per user spec):
  * String `branding` value is preserved in `branding.aesthetic` so the
    text isn't lost.
  * `themes` / `genres` as a string -> [single_string] (one-item list).
  * `character_images` items that are dicts -> extract their URL value.
  * `color_palette` items that are dicts -> extract their hex/string value.
  * `release_date` as datetime -> ISO string.
  * Null list fields -> [].
  * Optional string null is kept as null where the schema permits null
    (e.g. `release_date: Optional[str] = None`).
  * Required string `name` is only replaced with "Untitled Artist" if it
    is truly absent (None, "", missing).
"""

from __future__ import annotations

import datetime as _dt
import logging
from typing import Any, Dict, List, Optional, Tuple, Type

from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------


def _to_list_of_str(value: Any) -> List[str]:
    """Best-effort conversion of `value` to List[str]:

    * None              -> []
    * "single tag"      -> ["single tag"]
    * ["a", "b"]        -> ["a", "b"]    (already fine)
    * [{"hex":"#fff"}]  -> ["#fff"]      (extract common url/hex/value/name keys)
    * ["a", 3, None]    -> ["a", "3"]    (stringify scalars, drop Nones)
    """
    if value is None:
        return []
    if isinstance(value, str):
        s = value.strip()
        return [s] if s else []
    if not isinstance(value, list):
        # Single non-list, non-string scalar -> wrap if non-empty
        try:
            s = str(value).strip()
            return [s] if s else []
        except Exception:
            return []
    out: List[str] = []
    for item in value:
        if item is None:
            continue
        if isinstance(item, str):
            if item.strip():
                out.append(item)
        elif isinstance(item, dict):
            # Try common keys in priority order
            for k in ("url", "hex", "value", "name", "label", "title", "src"):
                v = item.get(k)
                if isinstance(v, str) and v.strip():
                    out.append(v)
                    break
        else:
            try:
                s = str(item).strip()
                if s:
                    out.append(s)
            except Exception:
                pass
    return out


def _datetime_to_iso(value: Any) -> Any:
    """Convert datetime/date to ISO string. Pass through everything else."""
    if isinstance(value, (_dt.datetime, _dt.date)):
        return value.isoformat()
    return value


def _coerce_to_str_or_none(value: Any) -> Optional[str]:
    """Return a string, or None if value is None. Datetime -> ISO."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (_dt.datetime, _dt.date)):
        return value.isoformat()
    try:
        return str(value)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Artist normalization
# ---------------------------------------------------------------------------

_ARTIST_LIST_FIELDS = (
    "genres", "themes", "patterns", "character_images",
    "visual_references",
)


def normalize_artist_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return a NEW dict suitable for Artist(**d). Never mutates input."""
    d = dict(doc)

    # 1. Required scalar: `name`
    name = d.get("name")
    if name is None or (isinstance(name, str) and not name.strip()):
        d["name"] = "Untitled Artist"
    elif not isinstance(name, str):
        d["name"] = str(name)

    # 2. Required scalar: `user_id`. We deliberately do NOT invent one;
    # docs lacking user_id are unrecoverable (would break team scoping).
    # Pydantic will reject below and it will be reported in the skip log.

    # 3. List fields that may be null/string/mixed
    for f in _ARTIST_LIST_FIELDS:
        if f in d:
            d[f] = _to_list_of_str(d[f])
        # don't add the field if it wasn't present — Pydantic has a default

    # 4. `saved_prompts` should be a list of dicts; if it's a string, wrap
    # it as a single legacy-text prompt so the content isn't lost.
    sp = d.get("saved_prompts")
    if sp is None:
        d["saved_prompts"] = []
    elif isinstance(sp, str):
        if sp.strip():
            d["saved_prompts"] = [{"prompt_type": "legacy_text",
                                   "label": "Legacy notes",
                                   "content": sp}]
        else:
            d["saved_prompts"] = []
    elif isinstance(sp, list):
        # Keep only dict entries; non-dicts become {content: str(x)}
        cleaned = []
        for item in sp:
            if isinstance(item, dict):
                cleaned.append(item)
            elif item is None:
                continue
            else:
                cleaned.append({"prompt_type": "legacy_text",
                                "label": "Legacy", "content": str(item)})
        d["saved_prompts"] = cleaned

    # 5. `branding` — the most common malformed shape
    b = d.get("branding")
    if b is None:
        d["branding"] = {"color_palette": [], "visual_style": "",
                         "aesthetic": "", "mood_keywords": []}
    elif isinstance(b, str):
        # Preserve the string content in the `aesthetic` field per spec.
        d["branding"] = {"color_palette": [], "visual_style": "",
                         "aesthetic": b.strip(), "mood_keywords": []}
    elif isinstance(b, dict):
        # Sub-field normalization
        nb = dict(b)
        nb["color_palette"] = _to_list_of_str(nb.get("color_palette"))
        nb["mood_keywords"] = _to_list_of_str(nb.get("mood_keywords"))
        nb["visual_style"] = _coerce_to_str_or_none(nb.get("visual_style")) or ""
        nb["aesthetic"] = _coerce_to_str_or_none(nb.get("aesthetic")) or ""
        d["branding"] = nb
    else:
        # Truly weird (list, number) -> safe empty branding
        d["branding"] = {"color_palette": [], "visual_style": "",
                         "aesthetic": "", "mood_keywords": []}

    # 6. Scalar string fields that occasionally get None or non-str
    for f in ("bio", "unique_sound", "tone", "image_url", "profile_image",
              "visual_brief", "suno_voice", "suno_exclusions", "notes"):
        if f in d:
            v = d[f]
            if v is None:
                d[f] = ""
            elif not isinstance(v, str):
                d[f] = str(v)

    # 7. `id` must be a string
    if "id" in d and not isinstance(d["id"], str):
        d["id"] = str(d["id"])

    # 8. `is_private` must be bool
    if "is_private" in d and not isinstance(d["is_private"], bool):
        d["is_private"] = bool(d["is_private"])

    # 9. `song_count` should be int
    if "song_count" in d:
        sc = d["song_count"]
        if not isinstance(sc, int):
            try:
                d["song_count"] = int(sc)
            except (TypeError, ValueError):
                d["song_count"] = 0

    return d


# ---------------------------------------------------------------------------
# Collection normalization
# ---------------------------------------------------------------------------


def normalize_collection_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Return a NEW dict suitable for Collection(**d). Never mutates input."""
    d = dict(doc)

    # 1. `title` — required
    title = d.get("title")
    if title is None or (isinstance(title, str) and not title.strip()):
        d["title"] = "Untitled Release"
    elif not isinstance(title, str):
        d["title"] = str(title)

    # 2. `collection_type` — schema default "EP", must be str
    ct = d.get("collection_type")
    if ct is None:
        d["collection_type"] = "EP"
    elif not isinstance(ct, str):
        d["collection_type"] = str(ct)

    # 3. `release_date` is Optional[str]: keep None as-is, convert datetime
    if "release_date" in d:
        rd = d["release_date"]
        if rd is None:
            pass  # Optional[str] allows None
        elif isinstance(rd, (_dt.datetime, _dt.date)):
            d["release_date"] = rd.isoformat()
        elif not isinstance(rd, str):
            d["release_date"] = str(rd)

    # 4. Scalar string fields
    for f in ("cover_image", "cover_image_url", "description", "status",
              "notes", "artist_id"):
        if f in d:
            v = d[f]
            if v is None:
                # artist_id is Optional[str] -> keep None.
                # Others default to "" in the model — coerce None -> "".
                if f == "artist_id":
                    continue
                d[f] = ""
            elif not isinstance(v, str):
                d[f] = str(v)

    # 5. `is_private` -> bool
    if "is_private" in d and not isinstance(d["is_private"], bool):
        d["is_private"] = bool(d["is_private"])

    # 6. `track_count` -> int
    if "track_count" in d:
        tc = d["track_count"]
        if not isinstance(tc, int):
            try:
                d["track_count"] = int(tc)
            except (TypeError, ValueError):
                d["track_count"] = 0

    # 7. `id` must be a string
    if "id" in d and not isinstance(d["id"], str):
        d["id"] = str(d["id"])

    return d


# ---------------------------------------------------------------------------
# Safe-validate wrapper
# ---------------------------------------------------------------------------


def safe_validate(
    model_cls: Type[BaseModel],
    doc: Dict[str, Any],
    normalizer,
) -> Tuple[Optional[BaseModel], str, Optional[str]]:
    """Try to validate a single document, normalizing first.

    Returns a tuple ``(obj_or_none, status, error_str_or_none)`` where
    ``status`` is one of:

    * ``"clean"``       — passed Pydantic without needing normalization
    * ``"normalized"``  — failed first, passed after normalization
    * ``"skipped"``     — failed even after normalization
    """
    # 1) Try direct conversion first — most docs are clean.
    try:
        return model_cls(**doc), "clean", None
    except ValidationError:
        # Fall through to normalize
        pass

    # 2) Normalize and try again.
    try:
        normalized = normalizer(doc)
    except Exception as e:  # pragma: no cover — defensive
        return None, "skipped", f"normalizer crashed: {e}"

    try:
        return model_cls(**normalized), "normalized", None
    except ValidationError as e:
        # 3) Build a sanitized error string. Never include the raw document
        # body — only field paths and Pydantic type codes.
        try:
            parts = []
            for er in e.errors():
                loc = ".".join(str(p) for p in er.get("loc", []))
                parts.append(f"{loc}:{er.get('type', '?')}")
            err_summary = "; ".join(parts)[:300]
        except Exception:
            err_summary = "validation failed (unparseable)"
        return None, "skipped", err_summary


def safe_validate_many(
    model_cls: Type[BaseModel],
    docs: List[Dict[str, Any]],
    normalizer,
    log_label: str,
) -> Tuple[List[BaseModel], Dict[str, int], List[Dict[str, Any]]]:
    """Validate a list of docs with normalization fallback.

    Returns ``(objects, counts, skipped_summaries)`` where:

    * ``objects`` is the list of successfully-validated Pydantic models
      (both clean and normalized — order preserved).
    * ``counts`` is ``{"total", "clean", "normalized", "skipped"}``.
    * ``skipped_summaries`` is a list of ``{"id", "display_name",
      "error"}`` dicts suitable for logging / diagnostics. Never
      contains full document bodies.
    """
    objects: List[BaseModel] = []
    counts = {"total": len(docs), "clean": 0, "normalized": 0, "skipped": 0}
    skipped: List[Dict[str, Any]] = []

    for d in docs:
        obj, status, err = safe_validate(model_cls, d, normalizer)
        counts[status] += 1
        if obj is not None:
            objects.append(obj)
        else:
            doc_id = d.get("id") if isinstance(d, dict) else None
            display = (d.get("name") or d.get("title")) if isinstance(d, dict) else None
            skipped.append({"id": doc_id, "display_name": display, "error": err})
            logger.warning(
                "[%s] unrecoverable doc skipped: id=%s name/title=%r error=%s",
                log_label, doc_id, display, err,
            )

    if counts["normalized"] or counts["skipped"]:
        logger.info(
            "[%s] validation summary: total=%d clean=%d normalized=%d skipped=%d",
            log_label, counts["total"], counts["clean"],
            counts["normalized"], counts["skipped"],
        )

    return objects, counts, skipped


__all__ = [
    "normalize_artist_doc",
    "normalize_collection_doc",
    "safe_validate",
    "safe_validate_many",
]
