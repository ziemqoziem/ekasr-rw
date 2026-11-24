
module.exports = {
  apps: [
    {
      name: 'webrw3',
      script: 'server.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
