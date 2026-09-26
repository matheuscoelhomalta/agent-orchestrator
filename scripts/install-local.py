from pathlib import Path
import shlex
import shutil

root = Path(__file__).resolve().parent.parent
target = Path.home() / '.local' / 'bin' / 'agent-orchestrator'
node = shutil.which('node')
if not node:
    raise SystemExit('Node is required.')
content = '#!/bin/sh\nexec ' + shlex.quote(node) + ' ' + shlex.quote(str(root / 'src' / 'cli.mjs')) + ' "$@"\n'
if target.exists() or target.is_symlink():
    if target.is_symlink() or target.read_text() != content:
        raise SystemExit(f'Refusing to overwrite existing command: {target}')
else:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('x') as file:
        file.write(content)
target.chmod(0o755)
print(f'Installed {target}')
