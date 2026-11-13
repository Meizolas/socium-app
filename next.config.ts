import type { NextConfig } from "next";

const config: NextConfig = {
	output: "standalone",
	images: {
		localPatterns: [
			{
				pathname: "/api/logo",
				search: "?brand=helians-v1",
			},
		],
	},
	experimental: {
		serverActions: { bodySizeLimit: "25mb" },
	},
};

export default config;
