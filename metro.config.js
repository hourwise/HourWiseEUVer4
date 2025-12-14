// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const { transformer, resolver } = config;

// 1️⃣ Transformer: use react-native-svg-transformer
config.transformer = {
  ...transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};

// 2️⃣ Resolver: handle SVG and SQL files
config.resolver = {
  ...resolver,
  assetExts: resolver.assetExts.filter((ext) => ext !== 'svg'), // remove svg from assets
  sourceExts: [...resolver.sourceExts, 'svg', 'sql'],           // add svg & sql as source
};

module.exports = config;
