module.exports = {
  extends: ['../../.eslintrc.js'],
  overrides: [
    {
      files: ['scripts/**/*.ts'],
      parserOptions: {
        project: ['../../tsconfig.json'],
      },
    },
  ],
  ignorePatterns: ['jsPolyfills/**'],
};
