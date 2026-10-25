import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertPublicEntries} from '../scripts/verify-public-release.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const bytes=text=>new TextEncoder().encode(text);
test('rejects credentials, personal signing files, private stores and traversal',()=>{
 for(const path of ['.env.local','backend/.env.production','embedded.mobileprovision','Payload/App.app/App','recordings/clip.m4a','.local/state.sqlite','../secret.txt']){
  assert.throws(()=>assertPublicEntries({[path]:bytes('private')}));
 }
 assert.throws(()=>assertPublicEntries({'src/config.ts':bytes('sk-'+'a'.repeat(32))}));
 assert.throws(()=>assertPublicEntries({'project.pbxproj':bytes('DEVELOPMENT_'+'TEAM = '+'ABC'+'1234567;')}));
});
test('CLI examines staged blob content even after the working copy is cleaned',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'englishpilot-index-check-'));
 const run=promisify(execFile);
 try{
  await run('git',['init','--quiet'],{cwd:directory});
  await writeFile(join(directory,'config.ts'),'sk-'+'b'.repeat(32));
  await run('git',['add','config.ts'],{cwd:directory});
  await writeFile(join(directory,'config.ts'),'export const safe = true;');
  const script=fileURLToPath(new URL('../scripts/verify-public-release.mjs',import.meta.url));
  await assert.rejects(run(process.execPath,[script],{cwd:directory}),error=>/Credential-like content/.test(error.stderr));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('accepts blank templates and licensed source, and allows only explicit native payload paths',()=>{
 assert.doesNotThrow(()=>assertPublicEntries({'.env.example':bytes('DEEPSEEK_API_KEY=\n'),'LICENSE':bytes('MIT License'),'src/app/page.tsx':bytes('export default function Page(){}')}));
 assert.throws(()=>assertPublicEntries({'.env.example':bytes('DEEPSEEK_API_KEY=real-value')}));
 const payload={'.local/native-web/out/index.html':bytes('<html>Offline app</html>')};
 assert.throws(()=>assertPublicEntries(payload));
 assert.doesNotThrow(()=>assertPublicEntries(payload,{nativePayload:true}));
 assert.throws(()=>assertPublicEntries({'.local/backups/private.json':bytes('{}')},{nativePayload:true}));
});
