#!/usr/bin/env node
/**
 * encrypt.js — Mounjaro Tracker 암호화 빌드 스크립트
 *
 * 사용법:
 *   node encrypt.js <비밀번호>
 *
 * 결과:
 *   app.html  → AES-256-GCM 암호화 → index.html (배포용)
 *
 * 알고리즘:
 *   - 키 유도: PBKDF2-SHA256, 200,000회 반복 (무차별 대입 방어)
 *   - 암호화: AES-256-GCM (인증 태그 포함, 변조 감지)
 *   - 페이로드 포맷: base64(salt[16] | iv[12] | tag[16] | ciphertext)
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const password = process.argv[2];
if (!password) {
  console.error('사용법: node encrypt.js <비밀번호>');
  process.exit(1);
}

const srcPath  = path.join(__dirname, 'app.html');
const distPath = path.join(__dirname, 'index.html');

if (!fs.existsSync(srcPath)) {
  console.error('app.html 파일을 찾을 수 없습니다.');
  process.exit(1);
}

const content = fs.readFileSync(srcPath, 'utf8');

// ── 암호화 ────────────────────────────────────────────
const salt      = crypto.randomBytes(16);
const iv        = crypto.randomBytes(12);
const key       = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256');
const cipher    = crypto.createCipheriv('aes-256-gcm', key, iv);
const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
const tag       = cipher.getAuthTag(); // 16 bytes

// 포맷: salt(16) + iv(12) + tag(16) + ciphertext
const payload = Buffer.concat([salt, iv, tag, encrypted]).toString('base64');

// ── 배포용 index.html 생성 ────────────────────────────
const shell = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Mounjaro Tracker</title>
  <meta name="theme-color" content="#6366f1">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;background:#f8f9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    body{display:flex;align-items:center;justify-content:center;padding:24px}
    .wrap{width:100%;max-width:340px;text-align:center}
    .icon{font-size:48px;margin-bottom:16px}
    .title{font-size:22px;font-weight:800;color:#111827;margin-bottom:4px}
    .sub{font-size:14px;color:#6b7280;margin-bottom:36px}
    input[type=password]{
      display:block;width:100%;padding:15px 18px;
      border:2px solid #e5e7eb;border-radius:14px;
      font-size:20px;letter-spacing:8px;text-align:center;outline:none;
      background:#fff;color:#111827;margin-bottom:12px;
      transition:border-color .2s;
    }
    input[type=password]:focus{border-color:#6366f1}
    .btn{
      display:block;width:100%;padding:15px;
      background:#6366f1;color:#fff;border:none;border-radius:14px;
      font-size:16px;font-weight:700;cursor:pointer;
      transition:background .15s;
    }
    .btn:disabled{background:#a5b4fc;cursor:not-allowed}
    .btn:not(:disabled):hover{background:#4f46e5}
    .error{font-size:13px;color:#ef4444;margin-bottom:10px;min-height:18px}
    .hint{font-size:12px;color:#9ca3af;margin-top:20px}
    .spinner{display:none;margin:0 auto 12px;width:28px;height:28px;
      border:3px solid #e5e7eb;border-top-color:#6366f1;
      border-radius:50%;animation:spin .7s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
  </style>
</head>
<body>
<div class="wrap">
  <div class="icon">💉</div>
  <div class="title">Mounjaro Tracker</div>
  <div class="sub">Tirzepatide 복약 관리</div>
  <div class="spinner" id="spinner"></div>
  <div class="error" id="err"></div>
  <input type="password" id="pw" placeholder="••••••" autocomplete="current-password"
    onkeydown="if(event.key==='Enter')unlock()">
  <button class="btn" id="btn" onclick="unlock()">잠금 해제</button>
  <div class="hint">비밀번호를 입력하면 앱이 열립니다</div>
</div>

<script>
const PAYLOAD = '${payload}';

async function unlock() {
  const pw = document.getElementById('pw').value;
  if (!pw) return;

  const btn     = document.getElementById('btn');
  const spinner = document.getElementById('spinner');
  const errEl   = document.getElementById('err');

  btn.disabled      = true;
  spinner.style.display = 'block';
  errEl.textContent = '';

  try {
    const data = Uint8Array.from(atob(PAYLOAD), c => c.charCodeAt(0));
    const salt  = data.slice(0,  16);
    const iv    = data.slice(16, 28);
    const tag   = data.slice(28, 44);
    const ct    = data.slice(44);

    // Web Crypto AES-GCM: 암호문 뒤에 인증 태그 붙임
    const ctWithTag = new Uint8Array(ct.length + 16);
    ctWithTag.set(ct);
    ctWithTag.set(tag, ct.length);

    const keyMat = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']
    );
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, key, ctWithTag
    );
    const html = new TextDecoder().decode(decrypted);

    // 복호화된 앱 HTML로 페이지 교체
    document.open();
    document.write(html);
    document.close();

  } catch {
    errEl.textContent = '비밀번호가 틀렸습니다';
    document.getElementById('pw').value = '';
    document.getElementById('pw').focus();
    btn.disabled      = false;
    spinner.style.display = 'none';
  }
}
</script>
</body>
</html>`;

fs.writeFileSync(distPath, shell, 'utf8');

const kb = (encrypted.length / 1024).toFixed(1);
console.log(`✅ 암호화 완료 → index.html (${kb} KB 암호화됨)`);
console.log(`   알고리즘: AES-256-GCM + PBKDF2-SHA256 (200,000 반복)`);
console.log(`   배포: index.html 만 서버에 올리세요. app.html 은 로컬 보관.`);
