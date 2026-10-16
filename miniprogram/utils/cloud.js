function invoke(action, data = {}) {
  const app = getApp();
  if (!app.globalData.cloudReady) {
    return Promise.reject(new Error('未配置云开发环境。请在 miniprogram/config.js 填写 cloudEnvId，并部署 mapSearch 云函数。'));
  }
  return wx.cloud.callFunction({ name: 'mapSearch', data: { action, ...data } }).then(res => {
    const result = res.result || {};
    if (!result.ok) throw new Error(result.error || '腾讯地图服务请求失败');
    return result;
  });
}
module.exports = { invoke };
