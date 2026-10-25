import {test} from 'node:test';
import assert from 'node:assert/strict';
import fengari from 'fengari';
import {parseStateBundle,importStateBundle,emptyStateBundle} from '../dist/state-transfer.js';

const ledger={version:1,limits:{dailyCalls:20,dailyTokens:200000,maxOutputTokens:4096},days:{'2026-10-25':{calls:4,usedTokens:2817,reservations:{'00000000-0000-4000-8000-000000000001':{tokens:7476,maxOutputTokens:4096}}}}};
const bundle=()=>({format:'englishpilot-backend-state-v1',records:[{key:'ai-usage',value:ledger}]});

test('state transfer preserves used quota and uncertain reservations',async()=>{
 const checked=parseStateBundle(JSON.stringify(bundle()));let sent;
 const count=await importStateBundle(checked,async command=>{sent=command;return 1;});
 assert.equal(count,1);assert.equal(sent[0],'EVAL');assert.equal(sent[2],1);assert.equal(sent[3],'englishpilot:free:v1:ai-usage');
 const value=JSON.parse(sent[4]);assert.equal(value.days['2026-10-25'].calls,4);assert.equal(Object.values(value.days['2026-10-25'].reservations)[0].tokens,7476);
});

test('conflicting import fails without retry and invalid bundles never write',async()=>{
 let writes=0;await assert.rejects(importStateBundle(parseStateBundle(JSON.stringify(bundle())),async()=>{writes++;return -1;}),/冲突|变化/);assert.equal(writes,1);
 const duplicates=bundle();duplicates.records.push(duplicates.records[0]);assert.throws(()=>parseStateBundle(JSON.stringify(duplicates)));
 const invalid=bundle();invalid.records[0].value={...ledger,limits:{...ledger.limits,dailyCalls:21}};assert.throws(()=>parseStateBundle(JSON.stringify(invalid)));
 const bad=bundle();bad.records.push({key:'arbitrary-admin-key',value:{}});assert.throws(()=>parseStateBundle(JSON.stringify(bad)));
 assert.deepEqual(emptyStateBundle().records[0].value,{version:1,limits:{dailyCalls:20,dailyTokens:200000,maxOutputTokens:4096},days:{}});
});

test('migration Lua preserves receipts, is idempotent, and checks all conflicts before writing',async()=>{
 const {lua,lauxlib,lualib,to_luastring,to_jsstring}=fengari;
 const L=lauxlib.luaL_newstate();lualib.luaL_openlibs(L);
 const run=source=>{
  const status=lauxlib.luaL_dostring(L,to_luastring(source));
  assert.equal(status,lua.LUA_OK,status===lua.LUA_OK?undefined:to_jsstring(lua.lua_tostring(L,-1)));
 };
 const values=items=>'{'+items.map(value=>JSON.stringify(String(value))).join(',')+'}';
 run(`data={}; writes=0; redis={call=function(command,key,value,option)
 if command=='GET' then return data[key] end
 assert(command=='SET' and option=='NX')
 if data[key] then return false end
 data[key]=value; writes=writes+1; return 'OK' end}`);
 const command=async([name,script,count,...args])=>{
  assert.equal(name,'EVAL');run(`KEYS=${values(args.slice(0,count))}; ARGV=${values(args.slice(count))}; return (function() ${script} end)()`);
  const result=lua.lua_tointeger(L,-1);lua.lua_pop(L,1);return result;
 };
 try{
  const source=bundle();
  source.records.push({key:'teacher:00000000-0000-4000-8000-000000000002',value:{fingerprint:'a'.repeat(64),state:'pending'}});
  source.records.push({key:'teacher:00000000-0000-4000-8000-000000000003',value:{fingerprint:'b'.repeat(64),state:'completed',result:{ok:true,response:{reply:'Keep practising.',corrections:[],suggestions:[]}}}});
  const checked=parseStateBundle(JSON.stringify(source));
  assert.equal(await importStateBundle(checked,command),3);
  assert.equal(await importStateBundle(checked,command),0);
  for(const record of checked.records)run(`assert(data[${JSON.stringify('englishpilot:free:v1:'+record.key)}]==${JSON.stringify(JSON.stringify(record.value))})`);
  const conflict=structuredClone(checked);conflict.records[2].value.fingerprint='c'.repeat(64);
  conflict.records.push({key:'teacher:00000000-0000-4000-8000-000000000004',value:{fingerprint:'d'.repeat(64),state:'pending'}});
  await assert.rejects(importStateBundle(conflict,command),/冲突|变化/);
  run(`assert(writes==3); assert(data['englishpilot:free:v1:teacher:00000000-0000-4000-8000-000000000004']==nil)`);
 }finally{lua.lua_close(L);}
});
