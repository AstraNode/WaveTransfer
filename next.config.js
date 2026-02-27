// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    poweredByHeader: false,
    reactStrictMode: true,
    compress: true,

    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    {
                        // Allow microphone access from any origin (needed for the app)
                        key: "Permissions-Policy",
                        value: "microphone=(*), autoplay=(*)",
                    },
                    {
                        key: "X-Content-Type-Options",
                        value: "nosniff",
                    },
                    {
                        key: "X-Frame-Options",
                        value: "DENY",
                    },
                    {
                        key: "X-XSS-Protection",
                        value: "1; mode=block",
                    },
                    {
                        key: "Referrer-Policy",
                        value: "strict-origin-when-cross-origin",
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;