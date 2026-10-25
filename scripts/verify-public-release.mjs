import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {unzipSync} from 'fflate';

export function assertPublicEntries(entries,{nativePayload=false}={}){
 for(const [path,bytes] of Object.entries(entries)){
  const parts=path.split('/');
  const generated=nativePayload&&/(?:^|\/)\.local\/native-web\/(?:out\/|\.englishpilot-generated$)/.test(path);
  if(!path||path.startsWith('/')||path.includes('\\')||parts.some(p=>p==='..'||p==='.'||!p)||parts.some(p=>/^(?:\.git|\.vercel|node_modules|recordings|backups|signing|Payload)$/i.test(p))||(!generated&&parts.includes('.local'))||/\.(?:ipa|mobileprovision|provisionprofile|p12|pfx|pem|key|cer|epbackup|epstate|sqlite\d*|db|log|wav|mp3|m4a|webm)$/i.test(path)||/\.app(?:\/|$)/i.test(path))throw new Error('Not a public release file: '+path);
  const name=parts.at(-1);
  if(name.startsWith('.env')&&name!=='.env.example')throw new Error('Private environment file: '+path);
  const text=new TextDecoder().decode(bytes);
  if(/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(text))throw new Error('Credential-like content: '+path);
  if(/DEVELOPMENT_TEAM\s*=\s*(?:"[^"]+"|[A-Z0-9]{6,})\s*;/.test(text))throw new Error('Personal signing identity: '+path);
  if(name==='.env.example'&&text.split('\n').some(line=>/^\s*[A-Z0-9_]*(?:KEY|TOKEN|PASSWORD|SECRET|CREDENTIAL)[A-Z0-9_]*\s*=\s*\S/.test(line)))throw new Error('Nonempty secret template: '+path);
 }
 return Object.keys(entries).length;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);let entries;
 if(args[0]==='--source-archive'||args[0]==='--native-archive')entries=unzipSync(new Uint8Array(await readFile(args[1])));
 else{
  const names=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
  entries={};for(const path of names)entries[path]=new Uint8Array(execFileSync('git',['show',':'+path],{maxBuffer:16*1024*1024}));
 }
 const files=assertPublicEntries(entries,{nativePayload:args[0]==='--native-archive'});
 console.log(JSON.stringify({files,publicReleaseCheck:'passed'}));
}
