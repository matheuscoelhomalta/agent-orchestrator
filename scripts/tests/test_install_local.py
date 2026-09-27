from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'install-local.py'


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.target = self.home / '.local/bin/agent-orchestrator'

    def install(self, version=None, error=None):
        result = subprocess.CompletedProcess([], 0, stdout=version)
        with patch.object(Path, 'home', return_value=self.home), patch('shutil.which', return_value='/fixture/node'), patch('subprocess.run', return_value=result, side_effect=error):
            runpy.run_path(str(SCRIPT))

    def test_rejects_invalid_or_unsupported_node_without_installing(self):
        for version in ['', 'not node', 'v20.19.0', 'v22.12.0']:
            with self.subTest(version=version), self.assertRaises(SystemExit):
                self.install(version)
            self.assertFalse(self.target.exists())
        with self.assertRaises(SystemExit):
            self.install(error=subprocess.CalledProcessError(1, []))
        self.assertFalse(self.target.exists())

    def test_accepts_minimum_and_newer_node_idempotently(self):
        for version in ['v22.13.0', 'v26.9.0']:
            self.install(version)
            self.assertIn('exec /fixture/node ', self.target.read_text())
            self.assertEqual(self.target.stat().st_mode & 0o777, 0o755)

    def test_preserves_conflicting_command(self):
        self.target.parent.mkdir(parents=True)
        self.target.write_text('existing command')
        with self.assertRaises(SystemExit):
            self.install('v22.13.0')
        self.assertEqual(self.target.read_text(), 'existing command')


if __name__ == '__main__':
    unittest.main()
