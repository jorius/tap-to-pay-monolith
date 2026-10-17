const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Release bundles inline EXPO_PUBLIC_API_URL into Metro's cached transforms, so a build for another URL (a new port
// forward) must not reuse them.
config.cacheVersion = process.env.EXPO_PUBLIC_API_URL ?? '';

module.exports = config;
