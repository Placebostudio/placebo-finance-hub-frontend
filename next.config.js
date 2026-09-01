/** @type {import('next').NextConfig} */

const nextConfig = {
    webpack: (config) => {

        // pdfjs-dist optionally requires the 'canvas' package
        // for Node.js environments.
        // The browser build doesn't need it.

        config.resolve.alias.canvas = false;
        config.resolve.alias.encoding = false;

        return config;
    },

};

export default nextConfig;