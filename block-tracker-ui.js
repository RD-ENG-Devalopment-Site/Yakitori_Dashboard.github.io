(function (global) {
    'use strict';

    const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
    const countFields = ['onLineUsed', 'onLineDamaged', 'spareAvailable', 'spareDamaged'];
    const legacyFields = ['inUse', 'inUseChange', 'idle', 'idleChange'];

    function parseCount(value) {
        if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Invalid block count');
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 0) throw new Error('Invalid block count');
        return number;
    }

    function count(value) {
        try { return parseCount(value); } catch { return 0; }
    }

    function text(value) {
        return value == null ? '' : String(value);
    }

    function normalizeRecord(record, index) {
        const result = { ...record, no: index + 1, name: text(record.name) };
        countFields.forEach((field, i) => {
            result[field] = count(record[field] === undefined ? record[legacyFields[i]] ?? 0 : record[field]);
        });
        return result;
    }

    function readCache(storage, defaults) {
        try {
            const records = JSON.parse(storage.getItem('apex-block-tracker') || 'null');
            if (Array.isArray(records) && records.every(record => record && typeof record === 'object' && !Array.isArray(record))) {
                return records;
            }
        } catch { /* Invalid cache must not prevent the viewer from opening. */ }
        return defaults;
    }

    function safeImageUrl(value) {
        if (typeof value !== 'string' || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64) return '';
        // No remote host is approved yet; existing uploads are raster data URLs.
        const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
        if (!match) return '';
        try {
            const bytes = global.atob(match[2]);
            if (bytes.length > MAX_IMAGE_BYTES) return '';
            const valid = match[1] === 'png'
                ? bytes.startsWith('\x89PNG\r\n\x1a\n')
                : match[1] === 'jpeg'
                    ? bytes.startsWith('\xff\xd8\xff')
                    : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
            return valid ? value : '';
        } catch { return ''; }
    }

    function element(tag, className, value) {
        const node = global.document.createElement(tag);
        node.className = className || '';
        if (value !== undefined) node.textContent = text(value);
        return node;
    }

    function cell(row, className, value) {
        const node = element('td', className, value);
        row.appendChild(node);
        return node;
    }

    function appendImage(parent, record, className, placeholderClass, placeholderTag = 'div') {
        const placeholder = () => element(placeholderTag, placeholderClass, 'ไม่มีรูป');
        const source = safeImageUrl(record.image);
        if (!source) {
            parent.appendChild(placeholder());
            return;
        }
        const image = element('img', className);
        image.alt = text(record.name);
        image.addEventListener('error', () => image.replaceWith(placeholder()), { once: true });
        image.src = source;
        parent.appendChild(image);
    }

    function replaceRows(parent, records, makeRow) {
        const fragment = global.document.createDocumentFragment();
        records.forEach((record, index) => fragment.appendChild(makeRow(normalizeRecord(record, index), index)));
        parent.replaceChildren(fragment);
    }

    async function readImageFile(file) {
        if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
            throw new Error('เลือกรูป PNG, JPEG หรือ WebP ขนาดไม่เกิน 2 MB');
        }
        const url = await new Promise((resolve, reject) => {
            const reader = new global.FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ กรุณาเลือกไฟล์อีกครั้ง'));
            reader.readAsDataURL(file);
        });
        if (!safeImageUrl(url)) throw new Error('รูปแบบไฟล์รูปไม่ถูกต้อง กรุณาเลือก PNG, JPEG หรือ WebP');
        return url;
    }

    const api = { parseCount, count, normalizeRecord, readCache, safeImageUrl, element, cell, appendImage, replaceRows, readImageFile };
    global.YakitoriBlockUI = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
