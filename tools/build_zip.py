"""Build the AMO zip with forward-slash entry names.

Windows' Compress-Archive writes "content\\main.js" and AMO rejects that with
"Invalid file name in archive". Python's zipfile keeps the arcname as given,
so we pass POSIX-style paths explicitly.
"""

import hashlib
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, "firefox-translate-ru")
OUT = os.path.join(ROOT, "firefox-translate-ru.zip")
SKIP_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}


def collect():
    entries = []
    for dirpath, dirnames, filenames in os.walk(EXT):
        dirnames.sort()
        for name in sorted(filenames):
            if name in SKIP_NAMES or name.endswith((".zip", ".xpi")):
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, EXT).replace(os.sep, "/")
            entries.append((full, rel))
    entries.sort(key=lambda item: (item[1] != "manifest.json", item[1]))
    return entries


def main():
    entries = collect()
    if not any(rel == "manifest.json" for _, rel in entries):
        raise SystemExit("manifest.json not found")
    if os.path.exists(OUT):
        os.remove(OUT)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for full, rel in entries:
            archive.write(full, rel)

    with zipfile.ZipFile(OUT) as archive:
        names = archive.namelist()
        bad = [name for name in names if "\\" in name]
        if bad:
            raise SystemExit("backslash entries: " + ", ".join(bad))
        print("manifest at root:", names[0] == "manifest.json")
        for name in names:
            print("  %-28s %8d" % (name, archive.getinfo(name).file_size))

    size = os.path.getsize(OUT)
    digest = hashlib.sha256(open(OUT, "rb").read()).hexdigest().upper()
    print("zip: %s (%d bytes)" % (OUT, size))
    print("sha256:", digest)


if __name__ == "__main__":
    main()
