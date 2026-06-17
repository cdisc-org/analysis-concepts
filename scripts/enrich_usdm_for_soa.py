#!/usr/bin/env python3
"""
Enrich an ac-dc-app USDM file with CDISC Library parent BC definitions.

For each BiomedicalConcept that references an SDTM Dataset Specialization, fetches
the spec + parent BC from the CDISC Library, rewrites the BC's protocol-level fields
(name, label, code, properties) from the parent BC, and stamps a formal USDM
ExtensionAttribute that records the SDTM-spec linkage for the Detailed SoA view.

The source USDM file is never mutated; an enriched copy is written next to it.

Usage:
    python scripts/enrich_usdm_for_soa.py                  # dry-run (report only)
    python scripts/enrich_usdm_for_soa.py --write          # write enriched USDM + cache
    python scripts/enrich_usdm_for_soa.py --refresh-cache  # re-fetch, overwriting cache
    python scripts/enrich_usdm_for_soa.py --deep-siblings  # walk full package listings for complete sibling lists (slow)
    python scripts/enrich_usdm_for_soa.py --input <PATH>   # override source USDM

Requires CDISC_LIBRARY_API_KEY in .env at the repo root.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
APP_DATA = ROOT / "ac-dc-app" / "data"
USDM_DIR = APP_DATA / "usdm"
LIB_DIR = APP_DATA / "cdisc-library"
BCS_DIR = LIB_DIR / "bcs"
SPECS_DIR = LIB_DIR / "sdtm-specs"
PACKAGES_DIR = LIB_DIR / "_packages"

DEFAULT_INPUT = USDM_DIR / "CDISC_Pilot_Study_usdm.json 07-50-56-737  - for SoA.json"
OUTPUT_USDM = USDM_DIR / "CDISC_Pilot_Study_soa_enriched.json"

EXT_URL = "https://cdisc.org/usdm/extensions/ac-dc/sdtmDatasetSpecialization"

# Two shapes are observed in USDM BC references:
#   Package-scoped (30 BCs): /mdr/specializations/sdtm/packages/<DATE>/datasetspecializations/<id>
#   Bare (139 BCs):          https://.../mdr/specializations/sdtm/datasetspecializations/<id>
SPEC_REF_SCOPED_RE = re.compile(r"/mdr/specializations/sdtm/packages/([^/]+)/datasetspecializations/([^/?#]+)")
SPEC_REF_BARE_RE = re.compile(r"/mdr/specializations/sdtm/datasetspecializations/([^/?#]+)")
BC_REF_RE = re.compile(r"/mdr/bc/(?:packages/[^/]+/)?biomedicalconcepts/(C\d+)")

load_dotenv(ROOT / ".env")


# ---------- HTTP + cache ----------

def api_base():
    return os.getenv("CDISC_LIBRARY_BASE_URL",
                     "https://api.library.cdisc.org/api/cosmos/v2").rstrip("/")


def api_key():
    return (os.getenv("CDISC_LIBRARY_API_KEY") or "").strip("'\"")


class Fetcher:
    def __init__(self, refresh=False):
        self.refresh = refresh
        self.base = api_base()
        self.key = api_key()
        self.n_fetched = 0
        self.n_hits = 0
        self.n_unfetchable = 0

    def _cache_path(self, kind, key):
        if kind == "bc":
            return BCS_DIR / f"{key}.json"
        if kind == "spec":
            return SPECS_DIR / f"{key}.json"
        if kind == "package":
            return PACKAGES_DIR / f"datasetspecializations_{key}.json"
        raise ValueError(kind)

    def _read_cache(self, path):
        if self.refresh or not path.exists():
            return None
        try:
            with path.open() as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None

    def _write_cache(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")

    def get(self, relpath, *, cache_kind, cache_key):
        """Return JSON or None if unfetchable (no key and no cache)."""
        cp = self._cache_path(cache_kind, cache_key)
        cached = self._read_cache(cp)
        if cached is not None:
            self.n_hits += 1
            return cached
        if not self.key:
            self.n_unfetchable += 1
            return None
        url = f"{self.base}{relpath}"
        req = urllib.request.Request(url, headers={
            "api-key": self.key,
            "Accept": "application/json",
        })
        # Verbose per-request logging so a stalled run is diagnosable.
        print(f"  [{self.n_fetched + 1:3}] GET {relpath} ... ", end="", flush=True)
        t0 = time.monotonic()
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    data = json.load(resp)
                elapsed = time.monotonic() - t0
                self.n_fetched += 1
                self._write_cache(cp, data)
                print(f"OK ({elapsed:.2f}s)", flush=True)
                return data
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                    print(f"HTTP {e.code}, retrying...", flush=True)
                    time.sleep(1.5 * (attempt + 1))
                    continue
                print(f"HTTP {e.code}", flush=True)
                if e.code in (401, 403):
                    # Authentication errors are fatal — keep retrying makes no sense.
                    print(f"  AUTH ERROR: check CDISC_LIBRARY_API_KEY in .env", file=sys.stderr)
                return None
            except urllib.error.URLError as e:
                if attempt < 2:
                    print(f"URLError, retrying ({e.reason})...", flush=True)
                    time.sleep(1.5 * (attempt + 1))
                    continue
                print(f"URLError: {e.reason}", flush=True)
                return None
            except TimeoutError:
                if attempt < 2:
                    print(f"timeout after {time.monotonic() - t0:.1f}s, retrying...", flush=True)
                    continue
                print(f"timeout", flush=True)
                return None


# ---------- parsing helpers ----------

def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def classify_reference(ref):
    if not ref:
        return ("none", None, None)
    m = SPEC_REF_SCOPED_RE.search(ref)
    if m:
        return ("spec", m.group(1), m.group(2))
    m = SPEC_REF_BARE_RE.search(ref)
    if m:
        return ("spec", None, m.group(1))  # package derived later from spec payload
    m = BC_REF_RE.search(ref)
    if m:
        return ("bc", None, m.group(1))
    return ("unknown", None, None)


def derive_package_from_spec(spec_payload):
    pp = ((spec_payload or {}).get("_links") or {}).get("parentPackage") or {}
    href = pp.get("href", "")
    m = re.search(r"/packages/([^/]+)/", href)
    return m.group(1) if m else None


def derive_parent_bc(spec_payload):
    pbc = ((spec_payload or {}).get("_links") or {}).get("parentBiomedicalConcept") or {}
    href = pbc.get("href", "")
    m = BC_REF_RE.search(href)
    return m.group(1) if m else None


# ---------- deterministic id generation ----------

_id_counters = {"BCP": 0, "AC": 0, "CD": 0, "EA": 0}


def _next_id(prefix):
    _id_counters[prefix] += 1
    return f"{prefix}_enr_{_id_counters[prefix]}"


def _reset_ids():
    for k in _id_counters:
        _id_counters[k] = 0


# ---------- USDM object builders (schema-compliant) ----------

def build_code(concept_id, decode, package_date):
    return {
        "id": _next_id("AC"),
        "extensionAttributes": [],
        "standardCode": {
            "id": _next_id("CD"),
            "extensionAttributes": [],
            "code": concept_id or "",
            "codeSystem": "http://www.cdisc.org",
            "codeSystemVersion": package_date or "",
            "decode": decode or "",
            "instanceType": "Code",
        },
        "standardCodeAliases": [],
        "instanceType": "AliasCode",
    }


def build_property_from_dec(dec, package_date):
    """Map a CDISC Library dataElementConcept into a USDM BiomedicalConceptProperty."""
    concept_id = dec.get("conceptId") or ""
    short_name = dec.get("shortName") or dec.get("name") or concept_id
    data_type = dec.get("dataType") or ""
    return {
        "id": _next_id("BCP"),
        "extensionAttributes": [],
        "name": short_name,
        "label": short_name,
        "isRequired": True,
        "isEnabled": True,
        "datatype": data_type,
        "responseCodes": [],
        "code": build_code(concept_id, short_name, package_date),
        "notes": [],
        "instanceType": "BiomedicalConceptProperty",
    }


def build_extension(selected_spec_id, candidate_ids, parent_bc_code, package, original_ref, note=None):
    """Build a formal USDM ExtensionAttribute with nested member attributes."""
    members = []

    def add_member(suffix, value):
        members.append({
            "id": _next_id("EA"),
            "url": f"{EXT_URL}/{suffix}",
            "valueString": value,
            "extensionAttributes": [],
            "instanceType": "ExtensionAttribute",
        })

    if selected_spec_id:
        add_member("selectedSpecId", selected_spec_id)
    for cid in candidate_ids:
        add_member("candidateSpecId", cid)
    if parent_bc_code:
        add_member("parentBcCode", parent_bc_code)
    if package:
        add_member("package", package)
    if original_ref:
        add_member("originalReference", original_ref)
    if note:
        add_member("note", note)
    add_member("enrichedAt", now_iso())

    return {
        "id": _next_id("EA"),
        "url": EXT_URL,
        "valueString": None,
        "extensionAttributes": members,
        "instanceType": "ExtensionAttribute",
    }


def rewrite_bc_from_parent(bc, parent_payload, package_date):
    short_name = (parent_payload.get("shortName")
                  or parent_payload.get("name")
                  or bc.get("name"))
    concept_id = parent_payload.get("conceptId") or ""
    bc["name"] = short_name
    bc["label"] = short_name
    syns = parent_payload.get("synonym") or parent_payload.get("synonyms") or []
    if isinstance(syns, str):
        syns = [syns]
    seen = set()
    bc["synonyms"] = [s for s in syns if not (s in seen or seen.add(s))]
    if concept_id:
        bc["reference"] = f"/mdr/bc/biomedicalconcepts/{concept_id}"
    bc["code"] = build_code(concept_id, short_name, package_date)
    decs = parent_payload.get("dataElementConcepts") or []
    bc["properties"] = [build_property_from_dec(d, package_date) for d in decs]


def upsert_extension(bc, ext):
    """Replace any existing extension with the same URL; append otherwise."""
    exts = bc.get("extensionAttributes") or []
    bc["extensionAttributes"] = [e for e in exts if e.get("url") != EXT_URL] + [ext]


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--write", action="store_true", help="Persist enriched USDM and cache.")
    ap.add_argument("--refresh-cache", action="store_true", help="Ignore on-disk cache; re-fetch everything.")
    ap.add_argument("--deep-siblings", action="store_true",
                    help="Fetch the latest-version SDTM spec listing to find every sibling spec per parent BC (not just the ones the study already references). Slow on first run; cached on disk afterwards.")
    ap.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    args = ap.parse_args()

    if not args.input.exists():
        print(f"ERROR: input USDM not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    with args.input.open() as f:
        usdm = json.load(f)

    bcs = usdm["study"]["versions"][0]["biomedicalConcepts"]
    print(f"Loaded {len(bcs)} BCs from: {args.input.name}")

    fetcher = Fetcher(refresh=args.refresh_cache)
    if not fetcher.key:
        print("WARNING: CDISC_LIBRARY_API_KEY is empty. Running in cache-only mode; uncached lookups will be skipped.")

    # --- Pass 1: classify BCs ---
    classified = []
    for bc in bcs:
        kind, pkg, ident = classify_reference(bc.get("reference"))
        classified.append((bc, kind, pkg, ident))
    counts = {"spec": 0, "bc": 0, "none": 0, "unknown": 0}
    for _, k, _, _ in classified:
        counts[k] = counts.get(k, 0) + 1
    print(f"Classification: spec_refs={counts['spec']}  already_generic={counts['bc']}  "
          f"no_reference={counts['none']}  unknown={counts['unknown']}")

    # --- Pass 2: fetch specs + parent BCs ---
    parent_children = {}   # parent_bc_code -> set[spec_id]
    spec_meta = {}         # spec_id -> {parentBcCode, shortName, domain, package}
    bc_meta = {}           # parent_bc_code -> {name}

    for bc, kind, pkg, ident in classified:
        if kind == "spec":
            spec_payload = fetcher.get(
                f"/mdr/specializations/sdtm/datasetspecializations/{ident}",
                cache_kind="spec", cache_key=ident)
            if spec_payload is None:
                continue
            parent_code = derive_parent_bc(spec_payload)
            pkg_from_spec = derive_package_from_spec(spec_payload) or pkg
            spec_meta[ident] = {
                "parentBcCode": parent_code,
                "shortName": spec_payload.get("shortName") or spec_payload.get("datasetSpecializationId") or ident,
                "domain": spec_payload.get("domain"),
                "package": pkg_from_spec,
            }
            if parent_code:
                parent_children.setdefault(parent_code, set()).add(ident)
                bc_payload = fetcher.get(
                    f"/mdr/bc/biomedicalconcepts/{parent_code}",
                    cache_kind="bc", cache_key=parent_code)
                if bc_payload is not None:
                    bc_meta[parent_code] = {
                        "name": bc_payload.get("shortName") or bc_payload.get("name") or parent_code
                    }
        elif kind == "bc":
            bc_payload = fetcher.get(
                f"/mdr/bc/biomedicalconcepts/{ident}",
                cache_kind="bc", cache_key=ident)
            if bc_payload is not None:
                bc_meta[ident] = {
                    "name": bc_payload.get("shortName") or bc_payload.get("name") or ident
                }

    # --- Optional: deep-siblings pass via the latest-version listing ---
    # CDISC Library endpoint /mdr/specializations/sdtm/datasetspecializations (no
    # package date) returns the summary list of every spec at its latest version.
    # We walk it once, identify which specs' parents are BCs we care about, and
    # fetch only those full payloads — avoiding the N-squared cost of fetching
    # every spec in every observed package.
    if args.deep_siblings:
        print("\nDeep-siblings pass: fetching latest SDTM specialization listing")
        latest = fetcher.get(
            "/mdr/specializations/sdtm/datasetspecializations",
            cache_kind="package", cache_key="latest")
        if latest is None:
            print("  (skipped — could not fetch latest listing)")
        else:
            entries = ((latest.get("_links") or {}).get("datasetSpecializations") or [])
            # Summary entries may or may not carry parentBiomedicalConcept inline.
            # Probe the first entry to decide whether we can index cheaply.
            sample_has_parent = any(
                isinstance(e.get("parentBiomedicalConcept"), dict) for e in entries[:5]
            )
            print(f"  latest listing has {len(entries)} specs "
                  f"(parent-link in summary: {sample_has_parent})")
            parents_of_interest = set(parent_children.keys())
            added = 0
            probed = 0
            for entry in entries:
                href = entry.get("href", "")
                m = re.search(r"/datasetspecializations/([^/?#]+)", href)
                if not m:
                    continue
                sid = m.group(1)
                if sid in spec_meta:
                    continue  # already fetched
                # Determine parent from summary if available
                parent_code = None
                p_link = entry.get("parentBiomedicalConcept")
                if isinstance(p_link, dict):
                    mm = BC_REF_RE.search(p_link.get("href", ""))
                    if mm:
                        parent_code = mm.group(1)
                # Fallback: fetch the spec to learn its parent
                if parent_code is None:
                    probed += 1
                    sp = fetcher.get(
                        f"/mdr/specializations/sdtm/datasetspecializations/{sid}",
                        cache_kind="spec", cache_key=sid)
                    if sp is None:
                        continue
                    parent_code = derive_parent_bc(sp)
                    pkg_from_spec = derive_package_from_spec(sp)
                    spec_meta[sid] = {
                        "parentBcCode": parent_code,
                        "shortName": sp.get("shortName") or sid,
                        "domain": sp.get("domain"),
                        "package": pkg_from_spec,
                    }
                # Only keep specs whose parent is one we care about
                if not parent_code or parent_code not in parents_of_interest:
                    continue
                # Ensure full payload is cached so the UI can render variables
                if sid not in spec_meta:
                    sp = fetcher.get(
                        f"/mdr/specializations/sdtm/datasetspecializations/{sid}",
                        cache_kind="spec", cache_key=sid)
                    if sp is None:
                        continue
                    spec_meta[sid] = {
                        "parentBcCode": parent_code,
                        "shortName": sp.get("shortName") or sid,
                        "domain": sp.get("domain"),
                        "package": derive_package_from_spec(sp),
                    }
                parent_children.setdefault(parent_code, set()).add(sid)
                added += 1
            print(f"  added {added} sibling specs across {len(parents_of_interest)} parent BCs "
                  f"({probed} summary-less entries required a full fetch)")

    # --- Pass 3: rewrite BCs in enriched USDM ---
    _reset_ids()
    unresolved = []
    stats = {"spec_rewrites": 0, "already_generic": 0, "no_reference": 0, "unknown": 0}

    for bc, kind, pkg, ident in classified:
        if kind == "spec":
            meta = spec_meta.get(ident) or {}
            parent_code = meta.get("parentBcCode")
            # Stamp the extension even when the parent BC is unresolvable (e.g. placeholder
            # C-codes like NEW_LZZT*) so the Detailed SoA view can still render this spec's
            # variables. Protocol-level rewrite is skipped without a parent payload.
            if parent_code:
                parent_path = BCS_DIR / f"{parent_code}.json"
                if not parent_path.exists():
                    unresolved.append({"bcId": bc.get("id"), "reason": "parent-bc-missing", "parentBcCode": parent_code})
                    # Still stamp the extension so Detailed SoA works.
                    upsert_extension(bc, build_extension(
                        selected_spec_id=ident,
                        candidate_ids=[ident],
                        parent_bc_code=parent_code,
                        package=pkg,
                        original_ref=bc.get("reference"),
                        note="parent-bc-missing",
                    ))
                    continue
                with parent_path.open() as f:
                    parent_payload = json.load(f)
                original_ref = bc.get("reference")
                candidates = sorted(parent_children.get(parent_code, {ident}))
                rewrite_bc_from_parent(bc, parent_payload, pkg)
                upsert_extension(bc, build_extension(
                    selected_spec_id=ident,
                    candidate_ids=candidates,
                    parent_bc_code=parent_code,
                    package=pkg,
                    original_ref=original_ref,
                ))
                stats["spec_rewrites"] += 1
            elif ident in spec_meta:
                # Spec payload was fetched but parent BC couldn't be resolved
                # (e.g. placeholder C-code). Stamp minimal extension.
                unresolved.append({"bcId": bc.get("id"), "reason": "parent-bc-unresolved", "specId": ident})
                upsert_extension(bc, build_extension(
                    selected_spec_id=ident,
                    candidate_ids=[ident],
                    parent_bc_code=None,
                    package=meta.get("package") or pkg,
                    original_ref=bc.get("reference"),
                    note="parent-bc-unresolved",
                ))
            else:
                unresolved.append({"bcId": bc.get("id"), "reason": "spec-fetch-failed", "specId": ident})
        elif kind == "bc":
            parent_path = BCS_DIR / f"{ident}.json"
            if parent_path.exists():
                with parent_path.open() as f:
                    parent_payload = json.load(f)
                rewrite_bc_from_parent(bc, parent_payload, None)
            upsert_extension(bc, build_extension(
                selected_spec_id=None,
                candidate_ids=sorted(parent_children.get(ident, set())),
                parent_bc_code=ident,
                package=None,
                original_ref=bc.get("reference"),
            ))
            stats["already_generic"] += 1
        elif kind == "none":
            upsert_extension(bc, build_extension(
                selected_spec_id=None,
                candidate_ids=[],
                parent_bc_code=None,
                package=None,
                original_ref=None,
                note="no-reference",
            ))
            unresolved.append({"bcId": bc.get("id"), "reason": "no-reference"})
            stats["no_reference"] += 1
        else:
            unresolved.append({
                "bcId": bc.get("id"),
                "reason": "unknown-reference",
                "reference": bc.get("reference"),
            })
            stats["unknown"] += 1

    # --- Index ---
    all_codes = sorted(set(list(parent_children.keys()) + list(bc_meta.keys())))
    index = {
        "generatedAt": now_iso(),
        "packages": sorted({m.get("package") for m in spec_meta.values() if m.get("package")}),
        "bcs": {
            code: {
                "name": bc_meta.get(code, {}).get("name", code),
                "sdtmSpecIds": sorted(parent_children.get(code, set())),
            } for code in all_codes
        },
        "sdtmSpecs": {sid: m for sid, m in sorted(spec_meta.items())},
        "unresolved": unresolved,
        "stats": stats,
    }

    # --- Summary ---
    print(f"\nResult: spec_rewrites={stats['spec_rewrites']}  already_generic={stats['already_generic']}  "
          f"no_reference={stats['no_reference']}  unknown={stats['unknown']}")
    print(f"Parent BCs resolved: {len(parent_children)}  /  SDTM specs cached: {len(spec_meta)}")
    print(f"Fetcher: {fetcher.n_fetched} fresh, {fetcher.n_hits} cache hits, {fetcher.n_unfetchable} unfetchable")
    print(f"Unresolved: {len(unresolved)}")

    if not args.write:
        print("\n(dry-run — pass --write to persist)")
        return

    LIB_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_USDM.open("w") as f:
        json.dump(usdm, f, indent=2, ensure_ascii=False)
        f.write("\n")
    with (LIB_DIR / "_index.json").open("w") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"\nWrote: {OUTPUT_USDM}")
    print(f"Wrote: {LIB_DIR / '_index.json'}")


if __name__ == "__main__":
    main()
