const { DEFAULT_THEME, applyTheme }=require('../../utils/theme');
const content=require('../../utils/content');
const typeValues=['visit','tasting','promo'];
Page({
 data:{themeKey:DEFAULT_THEME,kind:'post',title:'',base:'',ingredients:'',steps:'',body:'',tags:'',shop:'',partner:'',typeIndex:0,typeLabels:['探店体验','品酒笔记','广告推广'],promoConfirmed:false,imagePath:'',busy:false},
 onLoad(options){this.setData({kind:options.kind==='recipe'?'recipe':'post'});},
 onShow(){applyTheme(this);},
 change(e){const k=e.currentTarget.dataset.field;if(!['title','base','ingredients','steps','body','tags','shop','partner'].includes(k))return;this.setData({[k]:e.detail.value});},
 pickType(e){this.setData({typeIndex:Number(e.detail.value),promoConfirmed:false});},
 confirmPromo(e){this.setData({promoConfirmed:!!e.detail.value});},
 pickImage(){wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album','camera'],success:res=>{
  const file=res.tempFiles && res.tempFiles[0];if(!file)return;
  if(file.size>8*1024*1024){wx.showToast({title:'图片请小于8MB',icon:'none'});return;}
  wx.saveFile({tempFilePath:file.tempFilePath,success:s=>this.setData({imagePath:s.savedFilePath}),fail:()=>wx.showToast({title:'图片保存失败',icon:'none'})});
 },fail:()=>{}});},
 save(){if(this.data.busy)return;const d=this.data,title=d.title.trim();
  if(title.length<2){wx.showToast({title:'标题至少2个字',icon:'none'});return;}
  let obj;
  if(d.kind==='recipe'){
    if(!d.ingredients.trim()||!d.steps.trim()){wx.showToast({title:'请填写材料和步骤',icon:'none'});return;}
    obj={title,base:d.base.trim(),ingredients:d.ingredients.trim(),steps:d.steps.trim(),imagePath:d.imagePath};
  } else {
    if(!d.body.trim()){wx.showToast({title:'请填写正文',icon:'none'});return;}
    const type=typeValues[d.typeIndex];
    if(type==='promo' && (!d.partner.trim()||!d.promoConfirmed)){wx.showModal({title:'广告信息未完成',content:'商业推广请填写合作方，并确认公开标注广告性质。',showCancel:false});return;}
    obj={title,type,body:d.body.trim(),tags:d.tags.trim(),shop:d.shop.trim(),partner:type==='promo'?d.partner.trim():'',imagePath:d.imagePath};
  }
  this.setData({busy:true});
  const saved=content.add(d.kind==='recipe'?'recipes':'posts',obj);
  this.setData({busy:false});
  if(!saved){wx.showToast({title:'保存失败，请检查空间',icon:'none'});return;}
  wx.showToast({title:'已保存到本机',icon:'success'});
  setTimeout(()=>wx.navigateBack({delta:1}),350);
 }
});
