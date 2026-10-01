const assert = require('node:assert/strict');
const { test } = require('node:test');
const ui = require('../block-tracker-ui.js');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('count values are nonnegative safe integers and never HTML attributes', () => {
    assert.equal(ui.parseCount('12'), 12);
    assert.equal(ui.parseCount(0), 0);
    for (const invalid of ['" onfocus="test', NaN, Infinity, -1, 1.5, null, {}, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(() => ui.parseCount(invalid));
        assert.equal(ui.count(invalid), 0);
    }
});

test('legacy count normalization preserves names and images without modifying the cache', () => {
    const row = { name: '<em>literal</em>', image: png, inUse: '13', inUseChange: 1, idle: 2, idleChange: 0 };
    const normalized = ui.normalizeRecord(row, 0);
    assert.equal(normalized.name, row.name);
    assert.equal(normalized.image, png);
    assert.equal(normalized.onLineUsed, 13);
    assert.equal(normalized.spareAvailable, 2);
    assert.equal(row.onLineUsed, undefined);
});

test('raster data URLs are accepted; schemes, SVG, malformed MIME and oversized data are rejected', () => {
    assert.equal(ui.safeImageUrl(png), png);
    for (const url of [
        'javascript:alert(1)', 'data:text/html;base64,PHN2Zz4=', 'data:image/svg+xml;base64,PHN2Zz4=',
        'https://unapproved.invalid/photo.png', 'data:image/png;base64,PGh0bWw+',
        'data:image/png;base64,not*base64', png + '" onerror="test',
        'data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)
    ]) assert.equal(ui.safeImageUrl(url), '');
});

test('empty arrays remain empty; malformed, non-record and unavailable caches use defaults', () => {
    const defaults = [{ name: 'Default' }];
    for (const value of ['broken', '{}', '[null]', '[[]]', 'null']) {
        assert.equal(ui.readCache({ getItem: () => value }, defaults), defaults);
    }
    assert.deepEqual(ui.readCache({ getItem: () => '[]' }, defaults), []);
    assert.equal(ui.readCache({ getItem() { throw new Error('Storage blocked'); } }, defaults), defaults);
});
