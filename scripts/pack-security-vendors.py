"""Deterministic local npm archives; no downloads, hooks or version invention."""
from pathlib import Path
import gzip, io, json, tarfile
root = Path(__file__).resolve().parents[1]
for major in (2, 4):
    source = root / 'vendor' / f'picomatch-v{major}'
    meta = json.loads((source / 'package.json').read_text())
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode='w', format=tarfile.USTAR_FORMAT) as archive:
        for path in sorted(source.rglob('*')):
            if path.is_symlink():
                raise RuntimeError('Unexpected vendor symlink')
            if path.is_dir():
                continue
            relative = path.relative_to(source).as_posix()
            if relative not in {'index.js', 'posix.js', 'LICENSE', 'SECURITY.md', 'package.json'} and not (relative.startswith('lib/') and relative.endswith('.js')):
                raise RuntimeError('Unexpected vendor archive input: ' + relative)
            content = path.read_bytes()
            entry = tarfile.TarInfo('package/' + path.relative_to(source).as_posix())
            entry.size, entry.mode, entry.mtime = len(content), 0o644, 0
            archive.addfile(entry, io.BytesIO(content))
    target = root / 'vendor' / f"picomatch-v{major}-{meta['version']}.tgz"
    target.write_bytes(gzip.compress(data.getvalue(), mtime=0))
