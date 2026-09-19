const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add @/ alias to src/
config.resolver.extraNodeModules = {
  '@': path.resolve(__dirname, 'src'),
};

module.exports = config;
