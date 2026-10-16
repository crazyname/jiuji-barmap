const { DEFAULT_THEME, applyTheme } = require('../../utils/theme');
const content=require('../../utils/content');
const types=['all','visit','tasting','promo'];
Page({
 data:{themeKey:DEFAULT_THEME,posts:[],filter:'all',selectedIndex:0,likeIds:[],ownOnly:false},
 onShow(){applyTheme(this);const jump=wx.getStorageSync('jiuji-community-view-once'); if(jump==='liked'){wx.removeStorageSync('jiuji-community-view-once');this.setData({ownOnly:true});}this.refresh();},
 refresh(){const filter=this.data.filter, likes=content.list('likes').map(String);const bookmarks=content.list('favorites').map(String);const posts=content.list('posts').filter(p=>(filter==='all'||p.type===filter)&&(!this.data.ownOnly||likes.includes(String(p.id)))).map(p=>({...p,typeLabel:content.postTypeLabel(p.type),liked:likes.includes(String(p.id)),bookmarked:bookmarks.includes('post:'+p.id)}));this.setData({posts,likeIds:likes});},
 setFilter(e){const index=Number(e.currentTarget.dataset.index);this.setData({selectedIndex:index,filter:types[index],ownOnly:false});this.refresh();},
 showAll(){this.setData({ownOnly:false});this.refresh();},
 addPost(){wx.navigateTo({url:'/pages/compose/compose?kind=post'});},
 toggleSave(e){content.toggle('favorites','post:'+e.currentTarget.dataset.id);this.refresh();},
 toggleLike(e){content.toggle('likes',e.currentTarget.dataset.id);this.refresh();},
 copyXhs(e){const post=content.list('posts').find(p=>p.id===e.currentTarget.dataset.id);if(!post)return;wx.setClipboardData({data:content.xhsText(post),success:()=>wx.showModal({title:'已复制小红书文案',content:'请自行打开小红书粘贴文字、选择图片并确认发布。酒迹不会自动替你发布。',showCancel:false})});},
 openPost(e){const p=content.list('posts').find(x=>x.id===e.currentTarget.dataset.id);if(!p)return;content.visited('post',p.id);wx.showModal({title:p.title,content:(p.type==='promo'?'【广告推广】\n':'')+p.body,showCancel:false});}
});
