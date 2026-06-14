(function (global) {
    const CONFIG = {
        appsScriptUrl: "https://script.google.com/macros/s/AKfycbzCP20irjQdA65MEQXeB4KW8kkvmYRMJYbL8Zm1IdklPpKvvmTIIFcx0Zs_pm3Nwyel/exec"
    };

    function buildApiUrl(sheet, extraParams = {}) {
        const url = new URL(CONFIG.appsScriptUrl);
        url.searchParams.set("page", "api");
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
        postToAppsScript
    };
})(window);
