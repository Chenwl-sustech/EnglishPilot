import {readFile,readdir,lstat,mkdir,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve('.');
const output=join(root,'LICENSES/npm');
const marker='Generated dependency notices for EnglishPilot. Regenerate with npm run licenses:collect.\n';
const existing=await lstat(output).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
if(existing){
 if(existing.isSymbolicLink()||await readFile(join(output,'README.md'),'utf8').catch(()=>null)!==marker)throw new Error('Refusing to replace an unrecognized license directory');
 await rm(output,{recursive:true});
}
await mkdir(output,{recursive:true});await writeFile(join(output,'README.md'),marker);
const rows=new Map();
const noticeName=/^(?:licen[cs]e|notice|copying|copyright)(?:$|[._-])/i;
for(const project of [root,join(root,'backend')]){
 const lock=JSON.parse(await readFile(join(project,'package-lock.json'),'utf8'));
 for(const [path,record] of Object.entries(lock.packages)){
  if(!path||record.dev===true)continue;
  const directory=join(project,path);
  const pkg=await readFile(join(directory,'package.json'),'utf8').then(JSON.parse).catch(()=>null);if(!pkg)continue;
  const id=pkg.name+'@'+pkg.version;if(rows.has(id))continue;
  const row={name:pkg.name,version:pkg.version,license:pkg.license,notices:[],noticeSources:{}};
  async function walk(relative='',insideNotices=false){
   for(const item of (await readdir(join(directory,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    if(item.name==='node_modules'||item.name==='.git')continue;
    const rel=relative?relative+'/'+item.name:item.name;
    if(item.isSymbolicLink()){if(noticeName.test(item.name))throw new Error('Symlinked license needs manual review: '+id);continue;}
    if(item.isDirectory()){await walk(rel,insideNotices||/^licen[cs]es?$/i.test(item.name));continue;}
    if(!item.isFile()||(!insideNotices&&!noticeName.test(item.name)))continue;
    const data=await readFile(join(directory,rel));if(data.includes(0))continue;
    let filename=(id+'--'+rel).replace(/[^A-Za-z0-9_.-]/g,'_')+'.txt';
    if(filename.length>220)filename=id.replace(/[^A-Za-z0-9_.-]/g,'_')+'--'+createHash('sha256').update(rel).digest('hex')+'.txt';
    await writeFile(join(output,filename),data);
    row.notices.push('npm/'+filename);row.noticeSources['npm/'+filename]=rel;
   }
  }
  await walk();rows.set(id,row);
 }
}
const result=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version));
await writeFile(join(root,'LICENSES/npm-dependencies.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({packages:result.length,noticeFiles:result.reduce((n,row)=>n+row.notices.length,0)}));
