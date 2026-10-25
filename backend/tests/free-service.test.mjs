import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFreeService} from '../dist/free-service.js';

const prefix='englishpilot:free:v1';
const ledger={version:1,limits:{dailyCalls:2,dailyTokens:200000,maxOutputTokens:4096},days:{}};
function fixture(){
 const data=new Map([[prefix+':ai-usage',JSON.stringify(ledger)]]);const sent=[];let providerCalls=0;
 const env={DEEPSEEK_API_KEY:'fixture-provider-secret',BACKEND_ACCESS_TOKEN:'fixture-device-token-01234567890123456789',UPSTASH_REDIS_REST_URL:'https://fixture.upstash.io',UPSTASH_REDIS_REST_TOKEN:'fixture-redis-secret'};
 const fetcher=async(url,init)=>{
  sent.push({url:String(url),init});
  if(String(url).startsWith(env.UPSTASH_REDIS_REST_URL)){
   assert.equal(init.headers.Authorization,'Bearer '+env.UPSTASH_REDIS_REST_TOKEN);assert.equal(init.redirect,'error');
   const [command,...args]=JSON.parse(init.body);let result;
   if(command==='GET')result=data.get(args[0])??null;
   else if(command==='SET'){if(data.has(args[0]))result=null;else{data.set(args[0],args[1]);result='OK';}}
   else if(command==='EVAL'){const [,n,key,before,after]=args;assert.equal(n,1);result=!data.has(key)?-1:data.get(key)!==before?0:(data.set(key,after),1);}
   else throw new Error('Unexpected Redis command');
   return Response.json({result});
  }
  assert.equal(String(url),'https://api.deepseek.com/responses');assert.equal(init.headers.Authorization,'Bearer '+env.DEEPSEEK_API_KEY);assert.equal(init.redirect,'error');providerCalls++;
  return Response.json({status:'completed',output_text:JSON.stringify({reply:'What helps you practise regularly?',corrections:[],suggestions:[]}),usage:{input_tokens:10,output_tokens:20,total_tokens:30}});
 };
 const req=(path,method='GET',body)=>new Request('https://fixture.vercel.app'+path,{method,headers:{Authorization:'Bearer '+env.BACKEND_ACCESS_TOKEN,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const teacher=()=>({sessionId:crypto.randomUUID(),requestId:crypto.randomUUID(),mode:'free',feedbackMode:'coach',topic:'Daily practice',maxTurns:4,action:'turn',history:[{role:'assistant',text:'What do you practise?'},{role:'user',text:'I practise English every day.'}]});
 return {data,sent,env,fetcher,req,teacher,calls:()=>providerCalls};
}

test('free cloud keeps secrets server-side and rejects unauthenticated and browser requests',async()=>{
 const f=fixture();const app=createFreeService({env:f.env,fetcher:f.fetcher});
 assert.equal((await app.fetch(new Request('https://fixture.vercel.app/api/evaluate'))).status,401);assert.equal(f.sent.length,0);
 const status=await app.fetch(f.req('/api/configuration'));assert.equal(status.status,200);const text=await status.text();assert.ok(text.includes('deepseek-flash'));assert.ok(!text.includes('fixture-provider-secret'));assert.ok(!text.includes('fixture-redis-secret'));
 const browser=f.req('/api/teacher','POST',f.teacher());browser.headers.set('Origin','https://evil.test');assert.equal((await app.fetch(browser)).status,403);assert.equal(f.sent.length,0);
});

test('fresh function instances share atomic quota and teacher receipts',async()=>{
 const f=fixture();const inputs=[f.teacher(),f.teacher(),f.teacher()];
 const response=await Promise.all(inputs.map(i=>createFreeService({env:f.env,fetcher:f.fetcher}).fetch(f.req('/api/teacher','POST',i))));
 assert.deepEqual(response.map(r=>r.status).sort(),[200,200,429]);assert.equal(f.calls(),2);
 const index=response.findIndex(r=>r.status===200);const prior=await response[index].json();
 const again=await createFreeService({env:f.env,fetcher:f.fetcher}).fetch(f.req('/api/teacher','POST',inputs[index]));assert.equal(again.status,200);assert.deepEqual(await again.json(),prior);assert.equal(f.calls(),2);
 const quota=await(await createFreeService({env:f.env,fetcher:f.fetcher}).fetch(f.req('/api/ai-usage'))).json();assert.equal(quota.calls.used,2);assert.equal(quota.tokens.used,60);
});

test('missing or unavailable database stops AI without reset or repeated writes',async()=>{
 const f=fixture();f.data.clear();let app=createFreeService({env:f.env,fetcher:f.fetcher});
 assert.equal((await app.fetch(f.req('/api/teacher','POST',f.teacher()))).status,503);assert.equal(f.calls(),0);assert.equal(f.data.has(prefix+':ai-usage'),false);
 let requests=0;app=createFreeService({env:f.env,fetcher:async()=>{requests++;return new Response('Unavailable',{status:503});}});
 assert.equal((await app.fetch(f.req('/api/ai-usage'))).status,503);assert.equal(requests,1);
});

test('free plan caps cannot be raised and bootstrap is not a client API',async()=>{
 const f=fixture();const app=createFreeService({env:f.env,fetcher:f.fetcher});
 const over=await app.fetch(f.req('/api/ai-usage','POST',{dailyCalls:21,dailyTokens:200000,maxOutputTokens:4096}));assert.equal(over.status,400);assert.equal(f.sent.length,0);
 assert.equal((await app.fetch(f.req('/api/bootstrap','POST'))).status,404);
 assert.equal((await app.fetch(f.req('/api/ai-usage','POST',{dailyCalls:0,dailyTokens:0,maxOutputTokens:1024}))).status,200);
});
