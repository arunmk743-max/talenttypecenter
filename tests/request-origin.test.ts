import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginRequest } from '../lib/request-origin.js';

const publicOrigin = 'https://talenttypecenter.netlify.app';
function request(url: string, headers: Record<string, string>) {
  return new Request(url + '/api/auth', { method: 'POST', headers });
}
test('login accepts same-origin browser requests when a proxy changes host or scheme', () => {
  for (const target of [publicOrigin, 'http://talenttypecenter.netlify.app', 'http://function.internal:8080']) {
    assert.equal(isSameOriginRequest(request(target, { origin: publicOrigin, 'sec-fetch-site': 'same-origin' })), true);
  }
});
test('preview and branch URLs use their own browser-confirmed origin', () => {
  for (const origin of ['https://deploy-preview-12--talenttypecenter.netlify.app', 'https://main--talenttypecenter.netlify.app']) {
    assert.equal(isSameOriginRequest(request('http://function.internal', { origin, 'sec-fetch-site': 'same-origin' })), true);
  }
});
test('cross-site and sibling-site requests remain blocked', () => {
  for (const site of ['cross-site', 'same-site', 'none', '']) {
    assert.equal(isSameOriginRequest(request(publicOrigin, { origin: publicOrigin, 'sec-fetch-site': site })), false);
    assert.equal(isSameOriginRequest(request(publicOrigin, { origin: 'https://untrusted.example', 'sec-fetch-site': site })), false);
  }
});
test('missing, opaque and malformed origins remain blocked', () => {
  assert.equal(isSameOriginRequest(request(publicOrigin, { 'sec-fetch-site': 'same-origin' })), false);
  for (const origin of ['null', 'invalid', 'https://example.com/path', 'https://example.com/', 'https://user@example.com', 'file://']) {
    assert.equal(isSameOriginRequest(request(publicOrigin, { origin, 'sec-fetch-site': 'same-origin' })), false);
  }
});
test('clients without Fetch Metadata must match the function URL exactly', () => {
  assert.equal(isSameOriginRequest(request(publicOrigin, { origin: publicOrigin })), true);
  assert.equal(isSameOriginRequest(request(publicOrigin, { origin: 'https://untrusted.example' })), false);
  assert.equal(isSameOriginRequest(request('http://function.internal', { origin: publicOrigin })), false);
});
test('forwarded headers do not grant cross-origin access', () => {
  assert.equal(isSameOriginRequest(request(publicOrigin, {
    origin: 'https://untrusted.example', 'x-forwarded-host': 'untrusted.example', 'x-forwarded-proto': 'https',
  })), false);
});
