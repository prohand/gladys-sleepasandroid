// The release helper the Release workflow runs on CHANGELOG.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-sleepasandroid';

test('the first release moves Unreleased under the version and links its tag', () => {
  const text = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const rolled = rollChangelog(text, '1.0.1', '2026-10-21');
  assert.match(
    rolled,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-21\n\n### Added\n\n- A thing\./,
  );
  assert.match(rolled, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD`));
  assert.match(rolled, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1`));
});

test('the real CHANGELOG.md can be rolled', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const rolled = rollChangelog(text, '9.9.9', '2026-10-21');
  assert.notEqual(rolled, text);
  assert.match(rolled, /## \[9\.9\.9\] - 2026-10-21/);
});
