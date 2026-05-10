// File: eslint.config.js
import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactNative from 'eslint-plugin-react-native';

export default [
  // 1. Global Ignores
  { ignores: ['dist', '.expo', 'node_modules', 'babel.config.js', 'metro.config.js'] },

  // 2. Base Configurations
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,

  {
    ...pluginReactConfig,
    settings: {
      react: {
        version: 'detect',
      },
    },
  },

  // 3. Main Configuration
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        __DEV__: 'readonly', // Common React Native global
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    // 4. Plugins
    plugins: {
      'react-hooks': reactHooks,
      'react-native': reactNative,
    },
    // 5. Rules
    rules: {
      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // React Native
      'react-native/no-raw-text': ['error', { skip: ['CustomText', 'Button'] }],
      'react-native/no-inline-styles': 'warn',
      'react-native/no-color-literals': 'warn',
      'react-native/no-unused-styles': 'warn',

      // Turn off some strict rules that can be annoying in Expo
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'prefer-const': 'warn',
      'no-empty': 'warn',
    },
  },
];
