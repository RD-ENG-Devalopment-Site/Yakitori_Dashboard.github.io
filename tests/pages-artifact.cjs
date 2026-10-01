const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildPages, validateManifest } = require('../scripts/build-pages.cjs');
const root = path.resolve(__dirname, '..');
const files = JSON.parse(fs.readFileSync(path.join(root, 'scripts/pages-files.json'), 'utf8'));
const metadata = { build: 'test', commit: 'a'.repeat(40), builtAt: '2026-10-01T00:00:00Z' };

function fixture(run) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'yakitori-pages-'));
    try { run(temp); } finally {
        assert.ok(path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('yakitori-pages-'));
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

function walk(dir, prefix = '') {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const relative = prefix + entry.name;
        return entry.isDirectory() ? walk(path.join(dir, entry.name), relative + '/') : [relative];
    });
}

test('public paths match tracked filenames exactly, including case on Linux', () => {
    const tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0'));
    for (const file of files) assert.ok(tracked.has(file), 'Untracked or wrong-case public path: ' + file);
});

test('artifact contains only allowlisted files and generated metadata; public bytes stay unchanged', () => fixture(temp => {
    const outDir = path.join(temp, 'site');
    assert.equal(buildPages({ root, outDir, files, metadata }), files.length + 2);
    assert.deepEqual(walk(outDir).sort(), [...files, 'build-info.json', '.nojekyll'].sort());
    for (const file of files) assert.deepEqual(fs.readFileSync(path.join(outDir, file)), fs.readFileSync(path.join(root, file)), file);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(outDir, 'build-info.json'), 'utf8')), metadata);
    for (const name of ['yakitori-gas-src', 'tests', 'docs', 'scripts', 'analysis', 'output', 'tmp', '.git', '.github', '.understand-anything']) {
        assert.equal(fs.existsSync(path.join(outDir, name)), false, name);
    }
    assert.throws(() => buildPages({ root, outDir, files, metadata }), /existing output/);
}));

test('manifest rejects private paths, traversal, absolute paths, duplicates and unknown types', () => {
    for (const file of ['../index.html', '/index.html', 'C:/secret.js', 'assets\\secret.js', '.clasp.json',
        'yakitori-gas-src/DataEntry.html', 'tests/test.js', 'docs/guide.html', 'analysis/private.json', 'scripts/helper.js',
        'output/image.png', 'tmp/cache.json', 'node_modules/main.js', 'assets/.secret.json', 'assets/private.txt']) {
        assert.throws(() => validateManifest(['index.html', file]), undefined, file);
    }
    assert.throws(() => validateManifest(['index.html', 'INDEX.html']), /duplicate/);
    assert.throws(() => validateManifest(['asset.js']), /index.html/);
});

test('missing inputs and unsafe output fail before building', () => fixture(temp => {
    const outDir = path.join(temp, 'site');
    assert.throws(() => buildPages({ root, outDir, files: ['index.html', 'missing.js'], metadata }));
    assert.equal(fs.existsSync(outDir), false);
    assert.throws(() => buildPages({ root, outDir: root, files, metadata }), /source directory/);
    assert.throws(() => buildPages({ root, outDir, files, metadata: { ...metadata, commit: 'unknown' } }), /metadata/);
}));

test('unlisted files are ignored even when they look like public assets', () => fixture(temp => {
    const source = path.join(temp, 'source');
    const outDir = path.join(temp, 'site');
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'index.html'), '<title>Fixture</title>');
    fs.writeFileSync(path.join(source, 'private.json'), '{"private":true}');
    fs.writeFileSync(path.join(source, 'unexpected.html'), '<title>Not published</title>');
    buildPages({ root: source, outDir, files: ['index.html'], metadata });
    assert.deepEqual(walk(outDir).sort(), ['.nojekyll', 'build-info.json', 'index.html']);
}));

test('symlinked source directories cannot publish files outside the source', () => fixture(temp => {
    const source = path.join(temp, 'source');
    const privateDir = path.join(temp, 'private');
    const outDir = path.join(temp, 'site');
    fs.mkdirSync(source);
    fs.mkdirSync(privateDir);
    fs.writeFileSync(path.join(source, 'index.html'), '<title>Fixture</title>');
    fs.writeFileSync(path.join(privateDir, 'secret.js'), 'const privateData = true;');
    fs.symlinkSync(privateDir, path.join(source, 'assets'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => buildPages({ root: source, outDir, files: ['index.html', 'assets/secret.js'], metadata }), /regular file/);
    assert.equal(fs.existsSync(outDir), false);
}));

test('literal local HTML links and glTF dependencies are included in the public manifest', () => {
    const published = new Set([...files, 'build-info.json']);
    for (const file of files.filter(file => file.endsWith('.html'))) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        // Check literal document attributes only, not strings inside inline JavaScript.
        const html = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, match => match.slice(0, match.indexOf('>') + 1));
        for (const [, url] of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
            if (/^(?:[a-z]+:|\/\/|#)/i.test(url)) continue;
            const base = new URL(file, 'https://example.test/Yakitori_Dashboard.github.io/');
            const resolved = new URL(url, base);
            const prefix = '/Yakitori_Dashboard.github.io/';
            assert.ok(resolved.pathname.startsWith(prefix), file + ': escaped Pages base path: ' + url);
            const target = decodeURIComponent(resolved.pathname.slice(prefix.length));
            assert.ok(published.has(target), file + ': missing public dependency ' + target);
        }
    }
    for (const file of files.filter(file => file.endsWith('.gltf'))) {
        const gltf = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
        for (const resource of [...(gltf.buffers || []), ...(gltf.images || [])]) {
            if (!resource.uri || resource.uri.startsWith('data:')) continue;
            assert.ok(published.has(path.posix.join(path.posix.dirname(file), resource.uri)), resource.uri);
        }
    }
});
