// File: babel.config.js

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Standard NativeWind v2 plugin
      'nativewind/babel',

      // Module resolver for your "@/" imports
      [
        'module-resolver',
        {
          alias: {
            '@': './src',
          },
        },
      ],

      // Reanimated must be last
      'react-native-reanimated/plugin',
    ],
  };
};
