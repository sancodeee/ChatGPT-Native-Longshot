#!/usr/bin/env python3
"""Validate the directly loadable extension without third-party dependencies."""

import ast
import json
import re
import shutil
import struct
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
RUNTIME_SUFFIXES = {".js", ".json", ".html", ".css", ".png", ".svg"}


def read_json(path):
    """Reject duplicate keys rather than silently discarding configuration."""
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"Duplicate JSON key in {path.name}: {key}")
            result[key] = value
        return result

    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_pairs)


def require_asset(reference, base=EXTENSION):
    """Resolve browser-relative references without allowing paths outside the extension."""
    url = urlsplit(reference)
    if url.scheme or url.netloc or not url.path:
        return
    path = (EXTENSION if url.path.startswith("/") else base) / unquote(url.path).lstrip("/")
    path = path.resolve()
    try:
        path.relative_to(EXTENSION.resolve())
    except ValueError as error:
        raise ValueError(f"Asset escapes extension directory: {reference}") from error
    if not path.is_file():
        raise ValueError(f"Missing local asset: {reference}")


class PageReferences(HTMLParser):
    """Collect actual HTML resource references and translated labels."""

    def __init__(self, path, default_messages):
        super().__init__()
        self.path = path
        self.default_messages = default_messages

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        for attribute in ("src", "href"):
            if attributes.get(attribute):
                require_asset(attributes[attribute], self.path.parent)
        for attribute in ("data-i18n", "data-i18n-html"):
            key = attributes.get(attribute)
            if key and key not in self.default_messages:
                raise ValueError(f"Missing default translation in {self.path.name}: {key}")


def validate():
    """Return the manifest and packageable files only after all checks pass."""
    if not shutil.which("node"):
        raise ValueError("Node.js is required for JavaScript syntax checks.")

    files = []
    for path in sorted(EXTENSION.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlinks are not allowed in extension/: {path.name}")
        if not path.is_file() or path.name == ".DS_Store":
            continue
        if path.suffix not in RUNTIME_SUFFIXES:
            raise ValueError(f"Unexpected runtime file type: {path.relative_to(EXTENSION)}")
        files.append(path)

    manifest = read_json(EXTENSION / "manifest.json")
    if manifest.get("manifest_version") != 3:
        raise ValueError("The extension must use Manifest V3.")
    version = manifest.get("version", "")
    if not re.fullmatch(r"\d+(?:\.\d+){0,3}", version):
        raise ValueError(f"Invalid extension version: {version}")

    default_messages = read_json(EXTENSION / "_locales" / manifest["default_locale"] / "messages.json")
    for path in files:
        if path.suffix == ".json":
            data = read_json(path)
            if path.name == "messages.json":
                for key, value in data.items():
                    if not isinstance(value, dict) or not isinstance(value.get("message"), str):
                        raise ValueError(f"Invalid translation: {path.parent.name}/{key}")
        if path.suffix == ".js":
            subprocess.run(["node", "--check", str(path)], check=True)
            text = path.read_text(encoding="utf-8")
            for block in re.findall(r"\bfiles\s*:\s*\[([^\]]+)\]", text):
                for reference in re.findall(r"['\"]([^'\"]+)['\"]", block):
                    require_asset(reference)
        if path.suffix == ".html":
            text = path.read_text(encoding="utf-8")
            PageReferences(path, default_messages).feed(text)
        if path.suffix in {".html", ".css"}:
            for reference in re.findall(r"url\(\s*['\"]?([^)'\"\s]+)", path.read_text(encoding="utf-8")):
                require_asset(reference, path.parent)

    for key in re.findall(r"__MSG_(\w+)__", json.dumps(manifest)):
        if key not in default_messages:
            raise ValueError(f"Missing manifest translation: {key}")

    references = [manifest["background"]["service_worker"], manifest["action"]["default_popup"]]
    if "options_ui" in manifest:
        references.append(manifest["options_ui"]["page"])
    for content_script in manifest.get("content_scripts", []):
        references.extend(content_script.get("js", []))
        references.extend(content_script.get("css", []))
    for reference in references:
        require_asset(reference)

    for icons in (manifest.get("icons", {}), manifest["action"].get("default_icon", {})):
        for size, reference in icons.items():
            require_asset(reference)
            data = (EXTENSION / reference).read_bytes()
            if data[:8] != b"\x89PNG\r\n\x1a\n" or len(data) < 24:
                raise ValueError(f"Invalid PNG icon: {reference}")
            if struct.unpack(">II", data[16:24]) != (int(size), int(size)):
                raise ValueError(f"Incorrect icon dimensions: {reference}")

    for path in (ROOT / "scripts").glob("*.py"):
        ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    print(f"Validated v{version}: {len(files)} runtime files; manifest, references, locales, icons, JS/Python syntax.")
    return manifest, files


if __name__ == "__main__":
    try:
        validate()
    except (ValueError, KeyError, OSError, SyntaxError, subprocess.CalledProcessError) as error:
        print(f"Validation failed: {error}", file=sys.stderr)
        sys.exit(1)
