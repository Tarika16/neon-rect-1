
// Simple in-memory logger for debugging Vercel (since we can't see terminal)
declare global {
    var debugLogs: string[];
}

if (!globalThis.debugLogs) {
    globalThis.debugLogs = [];
}

export const logger = {
    log: (message: string) => {
        const timestamp = new Date().toISOString();
        globalThis.debugLogs.unshift(`[${timestamp}] ${message}`); // Add to top
        if (globalThis.debugLogs.length > 50) globalThis.debugLogs.pop(); // Keep last 50
    },
    getLogs: () => globalThis.debugLogs,
    clear: () => (globalThis.debugLogs = []),
};
