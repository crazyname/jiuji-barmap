export default defineAppConfig({
  pages: [
    'pages/map/index', 'pages/mix/index', 'pages/community/index', 'pages/mine/index', 'pages/venue/index',
    'pages/journal-drink/index', 'pages/journal-visit/index',
    'pages/journal-timeline/index', 'pages/journal-footprints/index',
    'pages/journal-cocktails/index', 'pages/journal-drink-detail/index',
    'pages/journal-visit-detail/index', 'pages/cocktail-detail/index', 'pages/recipe-variant/index'
  ],
  window: {
    navigationBarTitleText: '酒迹',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F7F5F5'
  },
  permission: {
    'scope.userLocation': { desc: '仅在点击定位或手动选点时获取当前位置' }
  },
  requiredPrivateInfos: ['chooseLocation', 'getLocation'],
  tabBar: {
    custom: true,
    color: '#6F6D74',
    selectedColor: '#82442F',
    backgroundColor: '#FFFFFF',
    list: [
      { pagePath: 'pages/map/index', text: '地图', iconPath: 'assets/tabbar/map.png', selectedIconPath: 'assets/tabbar/map-active.png' },
      { pagePath: 'pages/mix/index', text: '调酒', iconPath: 'assets/tabbar/mix.png', selectedIconPath: 'assets/tabbar/mix-active.png' },
      { pagePath: 'pages/community/index', text: '社区', iconPath: 'assets/tabbar/community.png', selectedIconPath: 'assets/tabbar/community-active.png' },
      { pagePath: 'pages/mine/index', text: '我的', iconPath: 'assets/tabbar/mine.png', selectedIconPath: 'assets/tabbar/mine-active.png' }
    ]
  }
})
