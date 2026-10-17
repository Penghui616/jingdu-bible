'use strict';
(() => {
  const about = document.getElementById('about-dialog');
  const instructions = document.createElement('p');
  instructions.textContent = 'iPhone 安装：用 Safari 打开本站，点「分享 → 添加到主屏幕」，若显示「作为网页 App 打开」，请开启。';
  const status = document.createElement('p');
  status.id = 'offline-status';
  status.setAttribute('role','status');
  about.append(instructions,status);
  const version=document.createElement('p');version.textContent='网页版本：20261017-5';about.append(version);
  const updateButton=document.createElement('button');updateButton.type='button';updateButton.className='primary-button';updateButton.textContent='检查更新';
  updateButton.onclick=()=>{
    try{sessionStorage.setItem('jingdu.update-draft',document.getElementById('chat-input').value);}catch{}
    location.assign('./update.html?t='+Date.now());
  };
  about.append(updateButton);
  if(!window.isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent = '离线阅读需要通过 HTTPS 网址安装；当前局域网 HTTP 地址不支持离线缓存。';
    return;
  }
  status.textContent = '正在准备离线经文…';
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js?build=20261017-5', {scope:'./',updateViaCache:'none'});
      const update = () => {
        if(registration.active) status.textContent = '离线经文已就绪。断网可读经、记笔记；助手与语音需联网。';
        if(registration.waiting) status.textContent = '新版已下载，点「检查更新」即可切换。';
      };
      update();
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          update();
          if(worker.state === 'redundant' && !registration.active) status.textContent = '离线经文暂未下载完成，请联网后重新打开。';
        });
      });
      navigator.serviceWorker.ready.then(update);
    } catch {
      status.textContent = '离线经文暂未下载完成，请联网后重新打开。';
    }
  };
  register();
})();
