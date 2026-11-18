module.exports = {
  preset: 'jest-expo',
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/e2e/'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
};
