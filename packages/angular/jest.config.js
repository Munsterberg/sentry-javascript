const { defaults: jestNgPreset } = require('jest-preset-angular/presets');

const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  preset: 'jest-preset-angular',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
  globalSetup: 'jest-preset-angular/global-setup',
  globals: {
    'ts-jest': {
      ...baseConfig.globals['ts-jest'],
      ...jestNgPreset.globals['ts-jest'],
    },
  },
};
