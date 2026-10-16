const cfg = require('./config');
App({
  globalData: { cloudReady: false },
  onLaunch() {
    if (wx.cloud && cfg.cloudEnvId) {
      wx.cloud.init({ env: cfg.cloudEnvId, traceUser: true });
      this.globalData.cloudReady = true;
    }
  }
});
