import { readFile,writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { parseStateBundle,emptyStateBundle,importStateBundle } from '../dist/state-transfer.js';
import { createRedisClient } from '../dist/redis.js';

const [mode,input,output]=process.argv.slice(2);
try{
 if(mode==='export-sqlite'){
  if(!input||!output)throw new Error('用法：export-sqlite <现有state.sqlite> <私有文件.epstate>');
  const db=new DatabaseSync(input,{readOnly:true});let rows;
  try{db.exec('BEGIN');rows=db.prepare('SELECT key,value FROM state ORDER BY key').all();db.exec('COMMIT');}finally{db.close();}
  const sourcePrefix='englishpilot:v1:';
  const records=rows.map(row=>{if(!row.key.startsWith(sourcePrefix))throw new Error('发现未知命名空间，未导出。');return {key:row.key.slice(sourcePrefix.length),value:JSON.parse(row.value)};});
  const bundle=parseStateBundle(JSON.stringify({format:'englishpilot-backend-state-v1',records}));
  await writeFile(output,JSON.stringify(bundle),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({exportedRecords:records.length,privateOutput:output}));
 }else if(mode==='import'||mode==='init'){
  const bundle=mode==='init'?emptyStateBundle():parseStateBundle(await readFile(input,'utf8'));
  const added=await importStateBundle(bundle,createRedisClient(process.env),process.env.ENGLISHPILOT_CLOUD_PREFIX||'englishpilot:free:v1');
  console.log(JSON.stringify({addedRecords:added,existingRecordsOverwritten:false}));
 }else throw new Error('支持命令：export-sqlite、import、init。已有后端必须导出并迁移，不要使用init替代现有用量。');
}catch(error){console.error(error.message==='Invalid URL'?'配置地址无效':['ZodError','SyntaxError'].includes(error.name)?'迁移文件校验失败，未输出数据内容':error.message);process.exitCode=1;}
