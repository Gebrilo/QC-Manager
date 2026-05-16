module.exports = {
  root: true,
  env: { node: true, es2021: true, jest: true },
  parserOptions: { ecmaVersion: 2021, sourceType: 'script' },
  rules: {
    'no-bare-projectId': ['error'],
  },
  overrides: [
    {
      files: ['src/modules/**/*.js'],
      rules: {
        'no-bare-projectId': 'error',
      },
    },
  ],
};