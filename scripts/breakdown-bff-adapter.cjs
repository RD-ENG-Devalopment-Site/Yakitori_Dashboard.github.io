// Server-only integration seam, not a deployed OAuth/session service.
// authenticate must resolve a server-verified durable session, never browser claims.
const crypto = require('node:crypto');
const { canonical } = require('../breakdown-domain.js');
function createBreakdownAdapter(config) {
    const { origin, gasUrl, environment, keyId, signingKey, authenticate, fetchImpl = fetch } = config;
    if (!/^https:\/\/[^/]+$/.test(origin || '') || new URL(origin).origin !== origin || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(gasUrl || '') || !environment || !keyId || !signingKey || typeof authenticate !== 'function') throw Error('Complete server-only auth and signing configuration required');
    function validateResponse(response) {
        if (!response.ok) throw Error('GAS transport failure');
        if (response.url && !['script.google.com', 'script.googleusercontent.com'].includes(new URL(response.url).hostname)) throw Error('Unexpected GAS redirect target');
    }
    async function gas(request) {
        const response = await fetchImpl(gasUrl, { method: 'POST', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
        validateResponse(response);
        return response.json();
    }
    function sign(operation, session) {
        const request = { ...operation, auth: { environment, keyId, issuedAt: new Date().toISOString(), actor: session.subject, roles: session.roles, stations: session.stations } };
        request.auth.signature = crypto.createHmac('sha256', signingKey).update(canonical(request)).digest('hex');
        return request;
    }
    return async function handle(request) {
        try {
            const url = new URL(request.url, origin);
            if (url.origin !== origin) return { status: 403, body: { code: 'ORIGIN_DENIED', state: 'rejected' } };
            const session = await authenticate(request);
            if (!session || typeof session.subject !== 'string' || !Array.isArray(session.roles) || !Array.isArray(session.stations) || !session.csrfToken) return { status: 401, body: { code: 'AUTH_REQUIRED', state: 'rejected' } };
            const action = url.searchParams.get('action');
            if (request.method === 'GET' && action === 'health') {
                const endpoint = new URL(gasUrl); endpoint.searchParams.set('page', 'api'); endpoint.searchParams.set('action', 'read_health');
                const response = await fetchImpl(endpoint, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
                validateResponse(response);
                const health = await response.json();
                if (health.status !== 'success') throw Error('Health invalid');
                return { status: 200, body: { writeProtocolVersion: health.writeProtocolVersion, breakdownWritesEnabled: config.writesEnabled === true && health.breakdownWritesEnabled === true && health.writeProtocolVersion === 2, readableTransport: true, session: { authenticated: true, subject: session.subject, csrfToken: session.csrfToken, roles: session.roles.slice(), stations: session.stations.slice() } } };
            }
            if (request.method === 'GET' && action === 'read_breakdown') {
                const endpoint = new URL(gasUrl); endpoint.searchParams.set('page', 'api'); endpoint.searchParams.set('action', 'read_breakdown');
                const response = await fetchImpl(endpoint, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000) });
                validateResponse(response);
                return { status: 200, body: await response.json() };
            }
            if (request.method === 'GET' && action === 'read_breakdown_event') return { status: 200, body: await gas(sign({ protocolVersion: 2, requestId: crypto.randomUUID(), action: 'read_breakdown_event', payload: { eventId: url.searchParams.get('eventId') } }, session)) };
            if (request.method !== 'POST' || request.headers?.origin !== origin || request.headers?.['x-csrf-token'] !== session.csrfToken) return { status: 403, body: { code: 'CSRF_DENIED', state: 'rejected' } };
            if (Buffer.byteLength(request.body || '', 'utf8') > 65536) return { status: 413, body: { code: 'BODY_TOO_LARGE', state: 'rejected' } };
            let input;
            try { input = JSON.parse(request.body || '{}'); } catch (_) { return { status: 400, body: { code: 'INVALID_JSON', state: 'rejected' } }; }
            if (!input || Array.isArray(input) || typeof input !== 'object') return { status: 400, body: { code: 'INVALID_REQUEST', state: 'rejected' } };
            if (input.auth || input.actor || input.roles || input.stations) return { status: 400, body: { code: 'CLIENT_IDENTITY_DENIED', state: 'rejected' } };
            let operation;
            if (action === 'status') operation = { protocolVersion: 2, requestId: crypto.randomUUID(), action: 'read_write_status', payload: { requestId: input.requestId } };
            else {
                if (config.writesEnabled !== true) return { status: 403, body: { code: 'WRITES_DISABLED', state: 'rejected' } };
                if (action !== 'submit' || !['record_breakdown', 'update_breakdown', 'close_breakdown', 'correct_breakdown'].includes(input.action)) return { status: 400, body: { code: 'ACTION_DENIED', state: 'rejected' } };
                operation = input;
            }
            const result = await gas(sign(operation, session));
            return { status: 200, body: result };
        } catch (_) { return { status: 502, body: { code: 'BACKEND_UNAVAILABLE', state: 'unknown' } }; }
    };
}
module.exports = { createBreakdownAdapter };
