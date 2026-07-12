/**
 * 启动 sansenjian/qq-music-api（QQ 音乐扫码登录依赖服务）
 * 路径：%LOCALAPPDATA%\Temp\qqdocs\qq-music-api
 * 端口：3200
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const QQ_API_DIR = path.join(
  process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local'),
  'Temp',
  'qqdocs',
  'qq-music-api',
);

if (!fs.existsSync(QQ_API_DIR)) {
  console.error('[QQ-API] 目录不存在:', QQ_API_DIR);
  console.error('[QQ-API] 请先克隆 https://github.com/sansenjian/qq-music-api 到此路径');
  process.exit(1);
}

console.log('[QQ-API] 启动路径:', QQ_API_DIR);

// 优先用 dev（tsx src/app.ts），如果没有 dist 则用 dev
const hasDist = fs.existsSync(path.join(QQ_API_DIR, 'dist', 'app.js'));
const script = hasDist ? 'start' : 'dev';

console.log('[QQ-API] 使用脚本:', script);

const child = spawn('npm', ['run', script], {
  cwd: QQ_API_DIR,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  console.log('[QQ-API] 进程退出, code:', code);
});
