#!/usr/bin/env python3
"""Create an installable ZIP from the validated runtime directory only."""

import os
import subprocess
import sys
import tempfile
import zipfile

sys.dont_write_bytecode = True

from check import EXTENSION, ROOT, validate


def package():
    manifest, files = validate()
    output_dir = ROOT / "dist"
    output_dir.mkdir(exist_ok=True)
    output = output_dir / f"ChatGPT-Native-Longshot-{manifest['version']}.zip"

    # Replace a previous package only after the new archive is complete.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=output_dir, suffix=".tmp", delete=False) as handle:
            temporary = handle.name
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in files:
                entry = zipfile.ZipInfo(path.relative_to(EXTENSION).as_posix())
                entry.compress_type = zipfile.ZIP_DEFLATED
                entry.create_system = 3
                entry.external_attr = 0o100644 << 16
                archive.writestr(entry, path.read_bytes())
        os.replace(temporary, output)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)

    print(f"Created {output.relative_to(ROOT)} ({len(files)} files, manifest.json at ZIP root).")


if __name__ == "__main__":
    try:
        package()
    except (ValueError, KeyError, OSError, SyntaxError, subprocess.CalledProcessError, zipfile.BadZipFile) as error:
        print(f"Packaging failed: {error}", file=sys.stderr)
        sys.exit(1)
