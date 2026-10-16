const {DEFAULT_THEME,THEMES,getTheme,setTheme,applyTheme}=require('../../utils/theme');
const content=require('../../utils/content');
const {getBars}=require('../../utils/storage');
Page({
 data:{themeKey:DEFAULT_THEME,profile:{nickname:'酒迹探索者',bio:''},favorites:[],savedRecipes:[],savedPosts:[],likes:[],history:[],recipesCount:0,postsCount:0,themes:Object.values(THEMES).map(t=>({id:t.id,label:t.label,color:t.accent,active:t.id===DEFAULT_THEME}))},
 onShow(){applyTheme(this);this.reload();},
 reload(){const bars=getBars(), posts=content.list('posts'),recipes=content.list('recipes');const selected=content.list('favorites').map(String);const liked=content.list('likes').map(String);
  const hist=content.list('history').map(x=>({...x,title:x.kind==='bar'?(bars.find(b=>String(b.id)===String(x.id))||{}).name:x.kind==='post'?(posts.find(p=>String(p.id)===String(x.id))||{}).title:(recipes.find(r=>String(r.id)===String(x.id))||{}).title})).filter(x=>x.title).slice(0,12);
  const p=content.read('profile',{});
  this.setData({profile:{nickname:p.nickname||'酒迹探索者',bio:p.bio||''},favorites:bars.filter(x=>selected.includes(String(x.id))),savedRecipes:recipes.filter(x=>selected.includes('recipe:'+x.id)),savedPosts:posts.filter(x=>selected.includes('post:'+x.id)),likes:posts.filter(x=>liked.includes(String(x.id))),history:hist,recipesCount:recipes.length,postsCount:posts.length,themes:Object.values(THEMES).map(t=>({...t,active:t.id===getTheme()}))});
 },
 editNick(e){this.setData({'profile.nickname':e.detail.value});},
 editBio(e){this.setData({'profile.bio':e.detail.value});},
 saveProfile(){const p=this.data.profile;const ok=content.write('profile',{nickname:(p.nickname||'').trim().slice(0,30)||'酒迹探索者',bio:(p.bio||'').trim().slice(0,180)});wx.showToast({title:ok?'资料已保存':'保存失败',icon:'none'});},
 chooseTheme(e){const id=e.currentTarget.dataset.theme;if(setTheme(id)){applyTheme(this);this.reload();wx.showToast({title:'外观已切换',icon:'none'});}},
 openSavedRecipe(e){wx.navigateTo({url:'/pages/recipe/recipe?id='+encodeURIComponent(e.currentTarget.dataset.id)});},
 openSavedPost(){wx.switchTab({url:'/pages/community/community'});},
 openFavorite(e){wx.navigateTo({url:'/pages/detail/detail?id='+e.currentTarget.dataset.id});},
 openHistory(e){const {kind,id}=e.currentTarget.dataset;if(kind==='bar')wx.navigateTo({url:'/pages/detail/detail?id='+id});else if(kind==='recipe')wx.navigateTo({url:'/pages/recipe/recipe?id='+encodeURIComponent(id)});else wx.switchTab({url:'/pages/community/community'});},
 goLikes(){wx.setStorageSync('jiuji-community-view-once','liked');wx.switchTab({url:'/pages/community/community'});}
});
