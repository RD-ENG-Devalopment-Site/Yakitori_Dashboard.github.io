(function (global) {
    const BUILD_VERSION = "20260617-01";
    const CONFIG = {
        appsScriptUrl: "https://script.google.com/macros/s/AKfycbzCP20irjQdA65MEQXeB4KW8kkvmYRMJYbL8Zm1IdklPpKvvmTIIFcx0Zs_pm3Nwyel/exec",
        buildVersion: BUILD_VERSION
    };

    function isSameOriginUrl(url) {
        try {
            return new URL(url, global.location.href).origin === global.location.origin;
        } catch (_) {
            return false;
        }
    }

    function appendVersion(url) {
        if (!url || !isSameOriginUrl(url)) return url;

        const target = new URL(url, global.location.href);
        target.searchParams.set("v", BUILD_VERSION);
        return target.toString();
    }

    function stampElementUrls(root = global.document) {
        if (!root || !root.querySelectorAll) return;

        root.querySelectorAll('a[href], script[src], link[href], iframe[src], source[src]').forEach((node) => {
            const attr = node.tagName === 'A' || node.tagName === 'LINK' ? 'href' : 'src';
            const current = node.getAttribute(attr);
            if (!current) return;
            const stamped = appendVersion(current);
            if (stamped && stamped !== current) node.setAttribute(attr, stamped);
        });
    }

    function stampCurrentUrl() {
        try {
            const current = new URL(global.location.href);
            if (current.searchParams.get("v") !== BUILD_VERSION) {
                current.searchParams.set("v", BUILD_VERSION);
                global.history.replaceState({}, "", current.toString());
            }
        } catch (_) {
            // Best-effort only.
        }
    }

    function applyCacheBust() {
        stampCurrentUrl();
        stampElementUrls(global.document);
    }

    function buildApiUrl(sheet, extraParams = {}) {
        const url = new URL(CONFIG.appsScriptUrl);
        url.searchParams.set("page", "api");
        url.searchParams.set("v", BUILD_VERSION);
        if (sheet) url.searchParams.set("sheet", sheet);
        Object.entries(extraParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, value);
            }
        });
        return url.toString();
    }

    async function postToAppsScript(action, payload = {}) {
        const body = {
            action,
            payload
        };

        await fetch(CONFIG.appsScriptUrl, {
            method: "POST",
            mode: "no-cors",
            headers: {
                "Content-Type": "text/plain;charset=UTF-8"
            },
            body: JSON.stringify(body)
        });

        return { ok: true, queued: true };
    }

    function requireAccessOrWarn() {
        return true;
    }

    global.YakitoriRuntime = {
        CONFIG,
        requireAccessOrWarn,
        buildApiUrl,
        postToAppsScript,
        BUILD_VERSION,
        appendVersion,
        stampElementUrls,
        applyCacheBust
    };

    if (global.document.readyState === "loading") {
        global.document.addEventListener("DOMContentLoaded", applyCacheBust, { once: true });
    } else {
        applyCacheBust();
    }
})(window);
