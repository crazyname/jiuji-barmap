// SPDX-License-Identifier: MPL-2.0
// Generate ChatGPT Sites import fixtures from the React client seed snapshot.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'apps/wechat/src/data/bars.json');
const output=path.join(root,'fixtures/sites/seed.json');
const bars=JSON.parse(fs.readFileSync(source,'utf8'));
const data={
  schemaVersion:1,
  dataset:'jiuji-sites-dev',
  description:'Development-only fixture data. Bar records are historical seeds, and sample content is synthetic.',
  bars,
  recipes:[
    {id:'dev-recipe-001',title:'测试酒谱 · 金汤力',base:'金酒',ingredients:'金酒 45ml；汤力水 120ml；青柠角 1 片',steps:'在加冰的高球杯中加入金酒和汤力水，轻轻搅匀，以青柠装饰。',visibility:'public',imageUrl:null},
    {id:'dev-recipe-002',title:'测试酒谱 · 无酒精柑橘苏打',base:'无酒精',ingredients:'橙汁 40ml；柠檬汁 15ml；苏打水 100ml',steps:'加入冰块与果汁，最后注入苏打水。',visibility:'public',imageUrl:null}
  ],
  posts:[
    {id:'dev-post-001',title:'测试探店贴 · 示例内容',body:'这是一条模拟探店记录，用于验证列表、详情和筛选。',type:'visit',visibility:'public',isSponsored:false,sponsorName:null,barId:null},
    {id:'dev-post-002',title:'测试品酒贴 · 示例内容',body:'测试品鉴笔记，不对应真实用户评价。',type:'tasting',visibility:'public',isSponsored:false,sponsorName:null,barId:null},
    {id:'dev-post-003',title:'测试广告贴 · 示例内容',body:'【广告/商业推广】这是一条专门测试商业推广标记的虚构内容。',type:'promo',visibility:'public',isSponsored:true,sponsorName:'演示合作方（虚构）',barId:null}
  ],
  testUsers:[{id:'demo-editor',displayName:'测试编辑'},{id:'demo-reader',displayName:'测试访客'}],
  favorites:[{userId:'demo-reader',kind:'bar',targetId:'1'}]
};
const next=JSON.stringify(data,null,2)+'\n';
if(process.argv.includes('--check')){
  if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==next){
    console.error('Sites seed out of sync; run npm run sites:seed');process.exit(1);
  }
  console.log('ChatGPT Sites demo fixture checked: '+bars.length+' bars, '+data.recipes.length+' recipes, '+data.posts.length+' posts.');
}else{
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,next);
  console.log('Updated fixtures/sites/seed.json');
}
