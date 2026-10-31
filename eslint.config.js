const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  globalIgnores(['dist/*', 'node_modules/*', 'android/*', 'ios/*', '.expo/*']),
  expoConfig,
  prettierConfig,
]);
