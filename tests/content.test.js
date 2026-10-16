const test = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const c=require('../miniprogram/utils/content');
function storage(){const m=new Map();global.wx={getStorageSync:k=>m.get(k),setStorageSync:(k,v)=>m.set(k,v)};return m;}
test('four tabBar entries preserve requested order and paths',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(__dirname,'../miniprogram/app.json'),'utf8'));
 assert.deepEqual(app.tabBar.list.map(t=>t.text),['地图','调酒','社区','我的']);
 for(const tab of app.tabBar.list){ assert.ok(app.pages.includes(tab.pagePath));assert.ok(fs.existsSync(path.join(__dirname,'../miniprogram',tab.iconPath)));assert.ok(fs.existsSync(path.join(__dirname,'../miniprogram',tab.selectedIconPath))); }
});
test('recipes posts and history are locally stored',()=>{
 const m=storage();
 const recipe=c.add('recipes',{title:'test gin',ingredients:'Gin 45ml',steps:'shake'});
 const post=c.add('posts',{type:'visit',title:'sample',body:'nice'});
 assert.equal(c.list('recipes')[0].id,recipe.id);
 assert.equal(c.list('posts')[0].id,post.id);
 assert.equal(c.toggle('favorites','recipe:'+recipe.id),true);
 assert.equal(c.toggle('favorites','recipe:'+recipe.id),false);
 assert.equal(c.toggle('likes',post.id),true);
 assert.equal(c.visited('bar',1),true);
 assert.equal(c.visited('recipe',recipe.id),true);
 assert.equal(c.visited('bar',1),true);
 assert.equal(c.list('history').length,2);
 assert.equal(c.list('history')[0].key,'bar:1');
 delete global.wx;
});
test('Xiaohongshu copy always includes Jiuji tags and discloses promotions',()=>{
 const text=c.xhsText({title:'New bar',body:'a tasting note',tags:'微醺,广州,#酒迹',type:'visit'});
 assert.ok(text.includes('#酒迹 #JiujiBarMap'));
 assert.equal(text.match(/#酒迹/g).length,1);
 const sponsored=c.xhsText({title:'推荐酒吧',body:'合作品牌',tags:'鸡尾酒',type:'promo'});
 assert.ok(sponsored.startsWith('【广告/商业推广】'));
 assert.ok(sponsored.includes('#酒迹'));
});
