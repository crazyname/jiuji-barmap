const { DEFAULT_THEME, applyTheme }=require('../../utils/theme');
const content=require('../../utils/content');
Page({
 data:{themeKey:DEFAULT_THEME,recipe:null,saved:false},
 onLoad(options){this.id=decodeURIComponent(options.id||'');this.load();},
 onShow(){applyTheme(this);},
 load(){const item=content.list('recipes').find(x=>x.id===this.id);if(item){this.setData({recipe:item,saved:content.list('favorites').map(String).includes('recipe:'+item.id)});content.visited('recipe',item.id);}else wx.showToast({title:'配方不存在',icon:'none'});},
 toggleFavorite(){const r=this.data.recipe;if(!r)return;this.setData({saved:content.toggle('favorites','recipe:'+r.id)});},
 copy(){const r=this.data.recipe;if(!r)return;
  wx.setClipboardData({data:`${r.title}\n${r.base||''}\n材料：\n${r.ingredients}\n步骤：\n${r.steps}\n#酒迹 #JiujiBarMap`,success:()=>wx.showToast({title:'配方已复制',icon:'success'})});}
});
