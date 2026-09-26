/* После съёмки: видео — не длиннее 27 с (у Яндекса лимит 28), обложка 800×470
   и витрина 1560×520 из чистого кадра с логотипом, иконка 512×512 — в media/<lang>/.
   node tools/media-post.mjs   (нужны ffmpeg и python3 с Pillow) */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
for (const l of fs.readdirSync('media')) {
  const d = 'media/' + l;
  if (!fs.statSync(d).isDirectory()) continue;
  const v = d + '/video.mp4';
  if (fs.existsSync(v)) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', v, '-t', '27', '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', d + '/video-27.mp4']);
    fs.renameSync(d + '/video-27.mp4', v);
  }
  execFileSync('python3', ['tools/make-cover.py', d, l], { stdio: 'inherit' });
}
