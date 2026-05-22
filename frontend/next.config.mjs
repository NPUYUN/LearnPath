/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "antd",
    "@ant-design/icons",
    "@ant-design/nextjs-registry",
    "rc-util",
    "rc-pagination",
    "rc-picker",
  ],
  experimental: {
    // 按需摇树优化 antd 与图标库，减少初始包体积
    optimizePackageImports: [
      "antd",
      "@ant-design/icons",
      "echarts",
      "react-markdown",
      "remark-gfm",
    ],
  },
  // 将大型第三方库单独分包，提升缓存复用率
  webpack(config) {
    config.optimization.splitChunks = {
      ...config.optimization.splitChunks,
      cacheGroups: {
        ...(config.optimization.splitChunks?.cacheGroups ?? {}),
        antd: {
          test: /[\\/]node_modules[\\/](antd|@ant-design|rc-)[\\/]/,
          name: "antd",
          chunks: "all",
          priority: 20,
        },
        echarts: {
          test: /[\\/]node_modules[\\/](echarts|zrender)[\\/]/,
          name: "echarts",
          chunks: "async",
          priority: 15,
        },
        markdown: {
          test: /[\\/]node_modules[\\/](react-markdown|remark|rehype|unified|vfile|mdast|hast|micromark)[\\/]/,
          name: "markdown",
          chunks: "async",
          priority: 15,
        },
      },
    };
    return config;
  },
};

export default nextConfig;
