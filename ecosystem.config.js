module.exports = {
  apps: [
    {
      name: 'qc-api',
      cwd: './apps/api',
      script: 'src/index.js',
      watch: true,
      ignore_watch: ['node_modules', 'logs'],
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      }
    },
    {
      name: 'qc-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      }
    }
  ]
};
