const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const forbidden = new Set(['yakitori-gas-src', 'tests', 'scripts', 'docs', 'analysis', 'output', 'tmp', 'node_modules']);
const extensions = new Set(['.html', '.js', '.css', '.json', '.png', '.svg', '.wasm', '.bin', '.glb', '.gltf', '.dds']);

function validateManifest(files) {
    if (!Array.isArray(files) || !files.length) throw new Error('Pages manifest must be a nonempty array');
    const seen = new Set();
    for (const file of files) {
        if (typeof file !== 'string' || !file || file.includes('\\') || file.includes(':') || file.startsWith('/')) {
            throw new Error('Invalid public path: ' + file);
        }
        const parts = file.split('/');
        if (parts.some(part => !part || part.startsWith('.') || forbidden.has(part)) ||
            !extensions.has(path.posix.extname(file)) || seen.has(file.toLowerCase())) {
            throw new Error('Forbidden or duplicate public path: ' + file);
        }
        seen.add(file.toLowerCase());
    }
    if (!files.includes('index.html')) throw new Error('Pages manifest must include index.html');
    return files;
}

function buildPages({ root, outDir, files, metadata }) {
    root = path.resolve(root);
    outDir = path.resolve(outDir);
    validateManifest(files);
    if (root === outDir || root.startsWith(outDir + path.sep)) throw new Error('Output cannot contain the source directory');
    if (!metadata || !/^[0-9a-f]{40}$/i.test(metadata.commit) ||
        typeof metadata.build !== 'string' || !Number.isFinite(Date.parse(metadata.builtAt))) {
        throw new Error('Invalid build metadata');
    }
    // Validate every source before copying; never follow source symlinks into private files.
    for (const file of files) {
        let source = root;
        const parts = file.split('/');
        parts.forEach((part, index) => {
            source = path.join(source, part);
            const stat = fs.lstatSync(source);
            if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory())) {
                throw new Error('Public source must be a regular file: ' + file);
            }
        });
    }
    if (fs.existsSync(outDir)) throw new Error('Use a new output directory; existing output is never overwritten');
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of files) {
        const target = path.join(outDir, file);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(root, file), target);
    }
    fs.writeFileSync(path.join(outDir, 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
    return files.length + 2;
}

if (require.main === module) {
    const root = path.resolve(__dirname, '..');
    const files = JSON.parse(fs.readFileSync(path.join(__dirname, 'pages-files.json'), 'utf8'));
    const count = buildPages({
        root,
        outDir: process.argv[2] || path.join(root, '_site'),
        files,
        metadata: {
            build: process.env.GITHUB_RUN_NUMBER || 'local',
            commit: process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
            builtAt: new Date().toISOString()
        }
    });
    console.log('Pages artifact: ' + count + ' allowlisted files');
}

module.exports = { buildPages, validateManifest };
