import type { NextConfig } from 'next';
const config: NextConfig = { output:'standalone', experimental: { serverActions: { bodySizeLimit: '25mb' } } };
export default config;
