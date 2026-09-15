#!/usr/bin/env python3
"""Build a local review ZIP from an explicit allowlist, without uploading it."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'manifest.json').read_text())
assert manifest['manifest_version'] == 3
assert len(manifest['description']) <= 132
version = manifest['version']
assert re.fullmatch(r'\d+(?:\.\d+){0,3}', version)

files = {
    'manifest.json', 'background.js', 'main.js', 'newtab.html', 'styles.css',
    'PRIVACY.md', 'THIRD_PARTY_NOTICES.md',
    'icon-sources/font-awesome-solid/LICENSE.txt',
    'fonts/geist-mono-400.woff2', 'fonts/OFL.txt',
    'icons/chatgpt.webp', 'icons/bookmark.svg', 'icons/click.svg', 'icons/folder.svg', 'icons/note.svg',
    *manifest['icons'].values(), *manifest['action']['default_icon'].values(),
}
# Include only modules reachable from the actual entry point.
pending = ['main.js']
while pending:
    name = pending.pop()
    source = (ROOT / name).read_text()
    subprocess.run(['node', '--check', str(ROOT / name)], check=True, capture_output=True)
    for relative in re.findall(r"(?:from\s*|import\s*)['\"](\.[^'\"]+)['\"]", source):
        dependency = ((ROOT / name).parent / relative).resolve().relative_to(ROOT).as_posix()
        if dependency not in files:
            files.add(dependency)
            pending.append(dependency)
subprocess.run(['node', '--check', str(ROOT / 'background.js')], check=True, capture_output=True)

for name in files:
    assert (ROOT / name).is_file(), f'Missing release file: {name}'
    if name.endswith(('.js', '.html', '.css', '.json')):
        text = (ROOT / name).read_text()
        assert '/Users/' not in text, f'Local path in package: {name}'

output = ROOT / 'dist'
output.mkdir(exist_ok=True)
archive = output / f'better-bookmarks-{version}-review.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for name in sorted(files):
        bundle.write(ROOT / name, name)
with zipfile.ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert 'manifest.json' in bundle.namelist()
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(output / f'{archive.name}.sha256').write_text(f'{digest}  {archive.name}\n')
print(f'{archive}\n{len(files)} files; {archive.stat().st_size} bytes\nSHA256 {digest}')
print('Local review build only. See store/RELEASE-CHECKLIST.md before publication.')
