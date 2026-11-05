import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'acorn';
test('website scripts parse and the obsolete browser login stores are removed', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) parse(match[1], { ecmaVersion: 'latest', sourceType: 'script' });
  assert.doesNotMatch(html, /localStorage|ttc_admin_creds|admin123/);
  assert.match(html, /type="tel" id="studentLoginPhone"/);
  assert.match(html, /type="password" id="studentLoginDOB"/);
  assert.match(html, /src="\/assets\/central-store.js"/);
});
