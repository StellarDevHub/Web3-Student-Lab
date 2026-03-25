/**
 * Request Logger Middleware
 * Logs HTTP method, URL, and timestamp for each incoming request
 */
export const requestLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl || req.url;
    console.log(`[${timestamp}] ${method} ${url}`);
    next();
};
//# sourceMappingURL=requestLogger.js.map