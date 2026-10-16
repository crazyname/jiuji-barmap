const { DEFAULT_THEME, applyTheme } = require('../../utils/theme');
const content = require('../../utils/content');
Page({
 data:{ themeKey: DEFAULT_THEME, recipes:[], query:'' },
 onShow(){applyTheme(this);this.refresh();},
 refresh(){const q=this.data.query.trim().toLowerCase();this.setData({recipes:content.list('recipes').filter(x=>(x.title+' '+x.base+' '+x.ingredients).toLowerCase().includes(q))});},
 input(e){this.setData({query:e.detail.value});this.refresh();},
 addRecipe(){wx.navigateTo({url:'/pages/compose/compose?kind=recipe'});},
 openRecipe(e){wx.navigateTo({url:'/pages/recipe/recipe?id='+encodeURIComponent(e.currentTarget.dataset.id)});}
});
