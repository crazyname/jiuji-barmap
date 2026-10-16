// SPDX-License-Identifier: MPL-2.0
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('MPL 2.0 license is complete and unmodified core headings present', () => {
  const text = read('LICENSE');
  assert.ok(text.startsWith('Mozilla Public License Version 2.0'));
  for (const fragment of ['1. Definitions', '2. License Grants and Conditions',
    '3. Responsibilities', '10. Versions of the License',
    'Exhibit A - Source Code Form License Notice', 'Exhibit B - "Incompatible With Secondary Licenses" Notice']) {
    assert.ok(text.includes(fragment), fragment);
  }
});

test('legacy MIT text is preserved and licensing boundaries documented', () => {
  assert.ok(read('LICENSE-MIT-LEGACY').startsWith('MIT License'));
  assert.match(read('NOTICE.md'), /previously granted MIT/i);
  assert.match(read('README.md'), /MPL-2\.0/);
  assert.match(read('CONTRIBUTING.md'), /DCO/);
  assert.match(read('TRADEMARKS.md'), /trademark/i);
  assert.match(read('docs/content-rights.md'), /User content/i);
});
