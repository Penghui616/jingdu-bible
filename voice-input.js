'use strict';
// Normalize Safari AAC / other browsers' Opus recordings to mono 16 kHz WAV.
window.voiceInputWav=function(buffer){
  const rate=16000,length=Math.floor(buffer.duration*rate);
  if(!length||buffer.duration>121)throw new Error('录音时长不符合要求，请重新录音。');
  const bytes=new Uint8Array(44+length*2),view=new DataView(bytes.buffer);
  const word=(offset,text)=>{for(let i=0;i<text.length;i++)bytes[offset+i]=text.charCodeAt(i);};
  word(0,'RIFF');view.setUint32(4,36+length*2,true);word(8,'WAVE');word(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  word(36,'data');view.setUint32(40,length*2,true);
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  for(let i=0;i<length;i++){
    const from=Math.floor(i*buffer.sampleRate/rate),to=Math.min(buffer.length,Math.max(from+1,Math.floor((i+1)*buffer.sampleRate/rate)));
    let sum=0;for(const channel of channels)for(let j=from;j<to;j++)sum+=channel[j];
    const sample=Math.max(-1,Math.min(1,sum/((to-from)*channels.length)));
    view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);
  }
  let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return 'data:audio/wav;base64,'+btoa(binary);
};
window.createVoiceInput=function({button,status,input,beforeStart,transcribe,onBusy}){
  let active=null;
  const message=text=>{status.textContent=text;status.hidden=!text;};
  function release(s){
    clearTimeout(s.limit);clearInterval(s.ticker);
    s.stream?.getTracks().forEach(track=>track.stop());
  }
  function done(s){
    release(s);s.context?.close().catch(()=>{});
    if(active!==s)return;
    active=null;button.textContent='按住说话';button.classList.remove('recording','cancel-recording');button.setAttribute('aria-pressed','false');onBusy(false);
  }
  function cancel(){
    const s=active;if(!s)return;
    s.cancelled=true;s.controller.abort();release(s);
    if(s.recorder?.state==='recording')s.recorder.stop();
    done(s);message('已取消');
  }
  async function recognize(s){
    release(s);
    if(s.cancelled||active!==s){done(s);return;}
    button.textContent='正在转文字…';button.classList.remove('recording','cancel-recording');message('正在识别，点击按钮可取消');
    try{
      const blob=new Blob(s.chunks,{type:s.recorder.mimeType});s.chunks=[];
      if(!blob.size||blob.size>10000000)throw new Error('录音为空或过大，请重新录音。');
      const decoded=await s.context.decodeAudioData(await blob.arrayBuffer());
      if(s.cancelled||active!==s)return;
      const text=await transcribe(window.voiceInputWav(decoded),s.controller.signal);
      if(s.cancelled||active!==s)return;
      const existing=input.value,separator=existing&&!/\s$/.test(existing)?' ':'';
      if(existing.length+separator.length+text.length>input.maxLength){message('文字超过输入框上限，请缩短原有内容后重试。');return;}
      input.value=existing+separator+text;input.dispatchEvent(new Event('input',{bubbles:true}));
      message('已转成文字，确认后点发送');
    }catch(error){
      if(!s.cancelled&&active===s)message(error.name==='EncodingError'?'录音无法读取，请重新录音。':error.message||'语音识别失败，请重试。');
    }finally{done(s);}
  }
  async function start(id,y){
    if(active){if(!active.holding)cancel();return;}
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){message('请在 Safari 中通过 HTTPS 打开网站使用语音输入。');return;}
    if(!navigator.onLine){message('语音转文字需要联网。');return;}
    const error=beforeStart();if(error){message(error);return;}
    input.blur();
    const s={id,y,holding:true,cancelled:false,slide:false,chunks:[],controller:new AbortController()};active=s;onBusy(true);
    button.setAttribute('aria-pressed','true');message('正在打开麦克风…');
    try{
      const Engine=window.AudioContext||window.webkitAudioContext;
      s.context=new Engine();s.context.resume().catch(()=>{});
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}});
      if(active!==s||s.cancelled||!s.holding){stream.getTracks().forEach(t=>t.stop());done(s);return;}
      s.stream=stream;
      const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      s.recorder=new MediaRecorder(stream,mime?{mimeType:mime,audioBitsPerSecond:64000}:undefined);
      s.recorder.ondataavailable=event=>{if(event.data.size&&!s.cancelled)s.chunks.push(event.data);};
      s.recorder.onstop=()=>recognize(s);
      s.recorder.onerror=()=>{if(active===s){cancel();message('麦克风录音中断，请重新按住说话。');}};
      s.recorder.start(250);s.started=Date.now();button.textContent='松开转文字';button.classList.add('recording');message('正在录音 · 上滑取消');
      s.ticker=setInterval(()=>{if(!s.slide)message(`正在录音 ${Math.floor((Date.now()-s.started)/1000)} 秒 · 上滑取消`);},1000);
      s.limit=setTimeout(()=>finish(s.id),120000);
    }catch(error){
      if(active===s&&!s.cancelled)message(error.name==='NotAllowedError'?'麦克风权限未开启，请在 Safari 网站设置中允许麦克风后重试。':error.name==='NotFoundError'?'没有找到麦克风。':'无法打开麦克风，请关闭其他录音应用后重试。');
      done(s);
    }
  }
  function finish(id){
    const s=active;if(!s||s.id!==id||!s.holding)return;
    s.holding=false;
    if(s.slide){cancel();return;}
    if(!s.recorder){cancel();message('麦克风准备完成后，请再次按住说话。');return;}
    if(Date.now()-s.started<600){cancel();message('按住时间太短，请说完后再松开。');return;}
    clearTimeout(s.limit);clearInterval(s.ticker);
    if(s.recorder.state==='recording')s.recorder.stop();
    release(s);
  }
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0||!event.isPrimary)return;event.preventDefault();event.stopPropagation();
    try{button.setPointerCapture(event.pointerId);}catch{}
    start(event.pointerId,event.clientY);
  });
  button.addEventListener('pointermove',event=>{
    const s=active;if(!s||!s.holding||s.id!==event.pointerId)return;
    s.slide=s.y-event.clientY>55;button.classList.toggle('cancel-recording',s.slide);
    button.textContent=s.slide?'松开取消':'松开转文字';message(s.slide?'松开手指，取消本次录音':'正在录音 · 上滑取消');
  });
  window.addEventListener('pointerup',event=>finish(event.pointerId));
  button.addEventListener('pointercancel',cancel);
  button.addEventListener('lostpointercapture',event=>{if(active?.holding&&active.id===event.pointerId)cancel();});
  button.addEventListener('contextmenu',event=>event.preventDefault());
  button.addEventListener('click',event=>event.preventDefault());
  button.addEventListener('keydown',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();if(!event.repeat)start('keyboard',0);}if(event.key==='Escape')cancel();});
  button.addEventListener('keyup',event=>{if([' ','Enter'].includes(event.key)){event.preventDefault();finish('keyboard');}});
  button.addEventListener('blur',()=>{if(active?.id==='keyboard'&&active.holding)cancel();});
  window.addEventListener('pagehide',cancel);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  return {cancel};
};
