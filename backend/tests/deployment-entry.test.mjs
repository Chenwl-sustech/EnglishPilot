import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('production entry runs with only emitted JavaScript and no source tree',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'englishpilot-deployment-'));
 try{
  const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
  const entry=Object.keys(config.functions)[0];
  await mkdir(join(directory,'api'));await mkdir(join(directory,'dist'));
  await writeFile(join(directory,'package.json'),JSON.stringify({type:'module'}));
  await copyFile(new URL('../'+entry,import.meta.url),join(directory,entry));
  await copyFile(new URL('../dist/free-service.js',import.meta.url),join(directory,'dist/free-service.js'));
  const code=`const {default:h}=await import(${JSON.stringify(pathToFileURL(join(directory,entry)).href)});const a=await h.fetch(new Request('https://fixture.vercel.app/api/health'));const b=await h.fetch(new Request('https://fixture.vercel.app/api/ai-usage'));console.log(JSON.stringify({health:a.status,unpaired:b.status,healthBody:await a.json()}));`;
  const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',code],{cwd:directory});
  const result=JSON.parse(stdout);assert.equal(result.health,200);assert.equal(result.unpaired,401);assert.equal(result.healthBody.status,'runtime-only');
 }finally{await rm(directory,{recursive:true,force:true});}
});
