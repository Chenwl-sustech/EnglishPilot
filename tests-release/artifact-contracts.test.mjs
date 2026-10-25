import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import * as nativePackage from '../scripts/package-native.mjs';

const bytes=text=>new TextEncoder().encode(text);
const catalog='native/ios/App/App/Assets.xcassets/AppIcon.appiconset';
test('native project accepts referenced retina asset names without allowing traversal',()=>{
 assert.equal(nativePackage.isAllowedProjectSourcePath(catalog+'/AppIcon-512@2x.png'),true);
 assert.equal(nativePackage.isAllowedProjectSourcePath('native/../private/icon.png'),false);
});
test('archive validation rejects an asset catalog whose referenced file is absent',()=>{
 const entries={[catalog+'/Contents.json']:bytes(JSON.stringify({images:[{filename:'AppIcon-512@2x.png'}]}))};
 assert.throws(()=>nativePackage.validateAssetCatalogReferences(entries),/asset|资源|图标/i);
 assert.doesNotThrow(()=>nativePackage.validateAssetCatalogReferences({...entries,[catalog+'/AppIcon-512@2x.png']:new Uint8Array([1,2,3])}));
});
test('decimal.js-light redistribution retains its actual author and MIT notice',async()=>{
 const list=JSON.parse(await readFile(new URL('../LICENSES/npm-dependencies.json',import.meta.url),'utf8'));
 const decimal=list.find(row=>row.name==='decimal.js-light');assert.ok(decimal?.notices.length);
 const notices=await Promise.all(decimal.notices.map(path=>readFile(new URL('../LICENSES/'+path,import.meta.url),'utf8')));
 assert.ok(notices.some(text=>text.includes('Michael Mclaughlin')&&text.includes('Permission is hereby granted')));
});
test('local UI instructions reference available npm commands and script targets',async()=>{
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 for(const name of ['service-settings.tsx','whisper-panel.tsx']){
  const text=await readFile(new URL('../src/components/'+name,import.meta.url),'utf8');
  for(const match of text.matchAll(/npm run ([\w:-]+)/g))assert.ok(pkg.scripts[match[1]],'Unavailable command: '+match[1]);
 }
 for(const script of Object.values(pkg.scripts))for(const match of script.matchAll(/\bnode\s+([^\s;&'"]+\.mjs)/g))await access(new URL('../'+match[1],import.meta.url));
 assert.ok(!pkg.scripts['package:mobile'],'Legacy mobile packaging needs omitted deployment inputs');
});
