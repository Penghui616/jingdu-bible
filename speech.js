'use strict';
window.createAnswerSpeech=function(onStatus){
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  const supported=!!AudioEngine&&typeof fetch==='function';
  let audioContext,controller,finishPlayback,generation=0,nextTime=0,needsReset=false;
  const sources=new Set(),cache=new Map();
  const diagnosticKey='jingdu.speech-diagnostics.v1';
  let events=[];
  try{const saved=JSON.parse(localStorage.getItem(diagnosticKey)||'[]');if(Array.isArray(saved))events=saved.slice(-19);}catch{}
  function record(event,phase=''){
    events.push({at:new Date().toISOString(),event,phase,audio:audioContext?.state||'none',visible:document.visibilityState,online:navigator.onLine});
    events=events.slice(-20);try{localStorage.setItem(diagnosticKey,JSON.stringify(events));}catch{}
  }
  function prepare(){
    if(!supported)return Promise.resolve(false);
    try{
      // iOS can leave a context interrupted after a call, lock screen or app switch.
      if(audioContext&&(needsReset||audioContext.state==='closed'||audioContext.state==='interrupted')){
        audioContext.close().catch(()=>{});audioContext=null;
      }
      needsReset=false;
      if(!audioContext){
        audioContext=new AudioEngine();const created=audioContext;
        created.onstatechange=()=>{
          if(created!==audioContext||created.state==='running'||!sources.size)return;
          needsReset=true;record('interrupted','audio');
          stop('朗读被手机系统暂停，请回到前台后点「朗读」重试。');
        };
      }
      const current=audioContext;
      if(current.state==='running')return Promise.resolve(true);
      // Call resume synchronously inside the user's gesture, then wait for it.
      const resume=current.resume();
      return new Promise(resolve=>{
        const timer=setTimeout(()=>resolve(false),4000);
        Promise.resolve(resume).then(()=>{clearTimeout(timer);resolve(current.state==='running');},()=>{clearTimeout(timer);resolve(false);});
      });
    }catch{return Promise.resolve(false);}
  }
  function stop(message=''){
    generation++;controller?.abort();controller=null;
    for(const source of sources){source.onended=null;try{source.stop();}catch{}source.disconnect();}
    sources.clear();finishPlayback?.();finishPlayback=null;nextTime=0;onStatus(message,false);
  }
  function play(chunk,token){
    if(token!==generation)return;
    if(!audioContext||audioContext.state!=='running')throw new Error('请点击回答下方的「朗读」播放');
    if(typeof chunk.audio!=='string'||chunk.sampleRate!==24000)throw new Error('语音数据格式有误');
    const bytes=atob(chunk.audio);
    if(!bytes.length||bytes.length%2)throw new Error('语音数据格式有误');
    const buffer=audioContext.createBuffer(1,bytes.length/2,24000),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++){let value=bytes.charCodeAt(2*i)|(bytes.charCodeAt(2*i+1)<<8);if(value>=32768)value-=65536;samples[i]=value/32768;}
    const source=audioContext.createBufferSource();source.buffer=buffer;source.connect(audioContext.destination);sources.add(source);
    source.onended=()=>{source.disconnect();sources.delete(source);if(!sources.size){finishPlayback?.();finishPlayback=null;}};
    nextTime=Math.max(nextTime,audioContext.currentTime+0.06);source.start(nextTime);nextTime+=buffer.duration;
    onStatus('正在朗读…',true);
  }
  async function speak(raw){
    if(!supported){onStatus('当前浏览器不支持音频播放',false);return;}
    stop();const ready=prepare(),token=generation;let phase='audio';record('requested',phase);
    const text=String(raw).replace(/```[\s\S]*?```/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')
      .replace(/^[\s]*[>#*-]+\s*/gm,'').replace(/[*_`#]/g,'')
      .replace(/(\d+):(\d+)(?:-(\d+))?/g,(_,c,v,end)=>`${c}章${v}${end?'至'+end:''}节`).trim();
    if(!text)return;
    controller=new AbortController();const request=controller;
    try{
      if(!await ready){if(token!==generation)return;throw new Error('手机音频未能启动，请回到前台再点「朗读」；仍无声请关闭并重新打开 App。');}
      if(token!==generation)return;
      onStatus('正在连接语音…',true);
      const cached=cache.get(text);
      if(cached){for(const chunk of cached)play(chunk,token);}
      else{
        const saved=[];let bytes=0,count=0;
        // Most replies fit one call; long replies remain within the provider's 600-character limit.
        for(const segment of text.match(/[\s\S]{1,500}/gu)||[]){
          if(token!==generation)return;
          phase='service';
          const response=window.BibleDirect?await window.BibleDirect.speechResponse(segment,request.signal):await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:segment}),signal:request.signal});
          if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||'语音服务暂时不可用');}
          if(!response.body)throw new Error('当前浏览器无法接收语音');
          const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
          function consume(line){
            if(!line.trim())return;
            const chunk=JSON.parse(line);if(chunk.error)throw new Error(chunk.error);
            if(token!==generation)return;
            phase='audio';play(chunk,token);phase='stream';count++;bytes+=chunk.audio.length;
            if(bytes<=8000000)saved.push(chunk);else saved.length=0;
          }
          try{
            while(true){const {value,done}=await reader.read();if(token!==generation)return;pending+=decoder.decode(value||new Uint8Array(),{stream:!done});if(pending.length>6000000)throw new Error('语音数据过长');let end;while((end=pending.indexOf('\n'))!==-1){consume(pending.slice(0,end));pending=pending.slice(end+1);}if(done)break;}
            consume(pending);
          }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
        }
        if(!count)throw new Error('语音服务未返回声音');
        if(saved.length&&bytes<=8000000){cache.set(text,saved);while(cache.size>3)cache.delete(cache.keys().next().value);}
      }
      if(token!==generation)return;
      if(sources.size)await new Promise(resolve=>{finishPlayback=resolve;});
      if(token===generation){controller=null;record('completed');onStatus('',false);}
    }catch(error){if(token===generation){record(error.name==='AbortError'?'aborted':'failed',phase);stop(error.name==='AbortError'?'已停止朗读':error.message||'语音播放失败，请重试');}}
  }
  window.addEventListener('pagehide',()=>{stop();cache.clear();audioContext?.close();audioContext=null;});
  function reset(){stop('语音已重置，请点回答下方的「朗读」');needsReset=true;record('reset','audio');}
  return {supported,prepare,speak,stop,reset,diagnostics:()=>({version:1,events:events.map(e=>({...e}))})};
};
