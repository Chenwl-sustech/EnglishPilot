import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('malformed private migration files do not leak content into CLI errors',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ep-private-test-'));const file=join(dir,'test.epstate');
 try{
  await writeFile(file,'SENSITIVE_LEARNER_TEXT_NOT_JSON');let stderr='';
  try{await promisify(execFile)(process.execPath,['scripts/manage-state.mjs','import',file]);}catch(error){stderr=error.stderr;}
  assert.ok(stderr);assert.ok(!stderr.includes('SENSITIVE'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
