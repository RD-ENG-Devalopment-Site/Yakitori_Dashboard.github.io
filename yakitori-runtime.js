(function (global) {
    const CONFIG = {
        appsScriptUrl: "https://script.google.com/macros/s/AKfycbzCP20irjQdA65MEQXeB4KW8kkvmYRMJYbL8Zm1IdklPpKvvmTIIFcx0Zs_pm3Nwyel/exec",
        accessCode: "1XQWvDVV_M61nxMXDebNTSrTvDTDrmW5IESAWJ4dAByoXoHUR3vTnQQww",
        storageKey: "yakitori-dashboard-access-granted"
    };

    function getStoredAccess() {
        try {
            return window.localStorage.getItem(CONFIG.storageKey) === "1";
        } catch (error) {
            return false;
        }
    }

    function setStoredAccess() {
        try {
            window.localStorage.setItem(CONFIG.storageKey, "1");
        } catch (error) {
            // Ignore storage failures. The prompt will still work for this session.
        }
    }

    function ensureAccess() {
        if (getStoredAccess()) return true;

        const entered = window.prompt("กรอกรหัสเข้าถึงระบบ Yakitori Dashboard");
        if (entered === null) return false;

        const normalized = String(entered).trim();
        if (normalized !== CONFIG.accessCode) {
            window.alert("รหัสไม่ถูกต้อง");
            return false;
        }

        setStoredAccess();
        return true;
    }

    function buildApiUrl(sheet, extraParams = {}) {
        const url = new URL(CONFIG.appsScriptUrl);
        url.searchParams.set("page", "api");
        if (sheet) url.searchParams.set("sheet", sheet);
        url.searchParams.set("token", CONFIG.accessCode);
        url.searchParams.set("pass", CONFIG.accessCode);
        url.searchParams.set("code", CONFIG.accessCode);
        Object.entries(extraParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, value);
            }
        });
        return url.toString();
    }

    async function postToAppsScript(action, payload = {}) {
        const body = {
            token: CONFIG.accessCode,
            pass: CONFIG.accessCode,
            code: CONFIG.accessCode,
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
        if (ensureAccess()) return true;
        console.warn("Yakitori Dashboard access denied by user.");
        return false;
    }

    global.YakitoriRuntime = {
        CONFIG,
        ensureAccess,
        requireAccessOrWarn,
        buildApiUrl,
        postToAppsScript
    };
})(window);
