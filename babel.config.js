module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
          },
        },
      ],
      'react-native-worklets-core/plugin',
      // This plugin must be listed last
      'react-native-reanimated/plugin',
    ],
  };
};
