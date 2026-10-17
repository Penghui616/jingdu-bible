'use strict';
// Static/mobile builds enable this mode. Local server mode remains available.
if(document.documentElement.dataset.apiMode==='direct'||new URLSearchParams(location.search).get('direct')==='1'){
  window.BibleDirect=(()=>{
    const KEY='jingdu.device-api.v1';
    const defaults={baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen3.8-max',apiKey:''};
    const core=()=>import('./direct-core.js');
    let biblePromise;
    function read(){
      try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');return saved&&typeof saved==='object'?{...defaults,...saved}:defaults;}catch{return defaults;}
    }
    function status(){const c=read();return {baseUrl:c.baseUrl,model:c.model,configured:!!c.apiKey,deviceOnly:true};}
    async function validated(){
      const {validateConfig,speechEndpoint}=await core();const config=validateConfig(read());
      speechEndpoint(config.baseUrl);
      if(new URL(config.baseUrl).pathname!=='/compatible-mode/v1')throw new Error('服务地址应以 /compatible-mode/v1 结尾。');
      return config;
    }
    async function configure(input){
      const {validateConfig,speechEndpoint}=await core();const config=validateConfig(input,read());
      speechEndpoint(config.baseUrl);
      if(new URL(config.baseUrl).pathname!=='/compatible-mode/v1')throw new Error('服务地址应以 /compatible-mode/v1 结尾。');
      try{localStorage.setItem(KEY,JSON.stringify(config));}catch{throw new Error('无法保存密钥，请检查浏览器存储权限。');}
      return status();
    }
    function clear(){localStorage.removeItem(KEY);return status();}
    async function chat(input,signal){
      const config=await validated();if(!config.apiKey)throw new Error('请先在设置中填写你自己的百炼 API Key。');
      const {buildMessages}=await core();
      biblePromise||=fetch('data/cus.json').then(r=>{if(!r.ok)throw new Error('无法读取经文');return r.json();}).catch(e=>{biblePromise=null;throw e;});
      const messages=buildMessages(input.messages,await biblePromise);
      let response;
      try{response=await fetch(config.baseUrl+'/chat/completions',{
        method:'POST',credentials:'omit',redirect:'error',
        headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:config.model,messages,stream:false,max_tokens:3072}),
        signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(120000)])
      });}catch(error){if(signal?.aborted)throw new DOMException('已停止','AbortError');throw new Error(error.name==='TimeoutError'?'回答超时，请稍后重试。':'无法直连千问，请检查网络、服务地址或该接口的浏览器跨域支持。');}
      if(!response.ok)throw new Error(({401:'API Key 无效或地域不匹配。',403:'当前密钥没有该模型的使用权限。',404:'模型或服务地址不存在。',429:'调用过于频繁或额度不足。'})[response.status]||'千问暂时不可用，请稍后重试。');
      let output;try{output=await response.json();}catch{throw new Error('千问返回的内容无法读取。');}
      const text=output.choices?.[0]?.message?.content;
      if(typeof text!=='string'||!text.trim())throw new Error('千问没有返回文字，请重试。');
      return {text:text.trim()+(output.choices[0].finish_reason==='length'?'\n\n（回答达到长度限制，可以继续追问。）':''),model:config.model};
    }
    async function speechResponse(text,signal){
      const {synthesizeSpeech}=await core(),config=await validated(),controller=new AbortController();
      const iterator=synthesizeSpeech(config,{text},AbortSignal.any([signal,controller.signal]),(url,options)=>fetch(url,{...options,credentials:'omit'}));
      const encoder=new TextEncoder();let next=await iterator.next();
      return new Response(new ReadableStream({
        async pull(stream){
          try{if(next.done){stream.close();return;}stream.enqueue(encoder.encode(JSON.stringify(next.value)+'\n'));next=await iterator.next();}
          catch(error){stream.enqueue(encoder.encode(JSON.stringify({error:error.message||'语音连接中断。'})+'\n'));stream.close();}
        },
        async cancel(){controller.abort();await iterator.return();}
      }),{headers:{'Content-Type':'application/x-ndjson'}});
    }
    async function transcribe(audio,signal){
      const config=await validated();if(!config.apiKey)throw new Error('请先在设置中填写百炼 API Key。');
      if(typeof audio!=='string'||audio.length>6000000||!/^data:audio\/wav;base64,[A-Za-z0-9+/]+=*$/.test(audio))throw new Error('录音格式或大小不符合要求，请重新录音。');
      let response;
      try{response=await fetch(config.baseUrl+'/chat/completions',{
        method:'POST',credentials:'omit',redirect:'error',signal:AbortSignal.any([signal,AbortSignal.timeout(60000)]),
        headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:'qwen3-asr-flash',messages:[{role:'user',content:[{type:'input_audio',input_audio:{data:audio}}]}],stream:false,asr_options:{language:'zh',enable_itn:true}})
      });}catch(error){if(signal.aborted)throw new DOMException('已取消','AbortError');throw new Error(error.name==='TimeoutError'?'识别超时，请重试。':'无法连接语音识别服务，请检查网络。');}
      if(!response.ok)throw new Error(({401:'语音识别认证失败，请检查密钥与地域。',403:'当前密钥没有语音识别权限，请检查百炼授权。',404:'当前地域或业务空间未提供 qwen3-asr-flash。',429:'语音识别额度不足或请求过于频繁。'})[response.status]||'语音识别服务暂时不可用，请重试。');
      const result=await response.json().catch(()=>null),text=result?.choices?.[0]?.message?.content;
      if(typeof text!=='string'||!text.trim())throw new Error('没有识别到说话内容，请靠近手机再试一次。');
      return text.trim();
    }
    return {status,configure,clear,chat,speechResponse,transcribe};
  })();
}
