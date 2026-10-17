'use strict';
(() => {
  const status=document.getElementById('update-status'),button=document.getElementById('retry-update');
  async function update(){
    button.disabled=true;button.textContent='正在更新…';status.textContent='正在下载新版和离线经文，请稍候…';
    try{
      if(!isSecureContext||!('serviceWorker' in navigator))throw new Error('请用 Safari 打开 HTTPS 网址后更新。');
      if(!navigator.onLine)throw new Error('当前没有网络，请联网后重试。');
      const registration=await navigator.serviceWorker.register('./sw.js?build=20261017-6',{scope:'./',updateViaCache:'none'});
      await registration.update();
      await new Promise((resolve,reject)=>{
        let settled=false;
        const finish=error=>{if(settled)return;settled=true;clearInterval(poll);clearTimeout(timeout);error?reject(error):resolve();};
        const poll=setInterval(()=>{
          const worker=registration.installing||registration.waiting;
          if(worker?.state==='redundant'){finish(new Error('新版未下载完整，请重试。'));return;}
          if(registration.waiting)registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});
          const active=registration.active;
          if(!worker&&active?.state==='activated'&&new URL(active.scriptURL).searchParams.get('build')==='20261017-6')finish();
        },150);
        const timeout=setTimeout(()=>finish(new Error('下载尚未完成，请检查网络后重试。')),90000);
      });
      status.textContent='更新完成，正在打开新版…';
      location.replace('./');
    }catch(error){status.textContent=error.message||'更新暂未完成，请重试。';button.disabled=false;button.textContent='重新检查更新';}
  }
  button.onclick=update;update();
})();
