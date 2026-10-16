export default defineAppConfig({
  pages: [
    'pages/map/index', 'pages/mix/index', 'pages/community/index', 'pages/mine/index', 'pages/venue/index'
  ],
  window: {
    navigationBarTitleText: '酒迹',
    navigationBarBackgroundColor: '#f9f4eb',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f4eddf'
  },
  tabBar: {
    color: '#887969',
    selectedColor: '#82442f',
    backgroundColor: '#f9f4eb',
    list: [
      { pagePath: 'pages/map/index', text: '地图', iconPath: 'assets/tabbar/map.png', selectedIconPath: 'assets/tabbar/map-active.png' },
      { pagePath: 'pages/mix/index', text: '调酒', iconPath: 'assets/tabbar/mix.png', selectedIconPath: 'assets/tabbar/mix-active.png' },
      { pagePath: 'pages/community/index', text: '社区', iconPath: 'assets/tabbar/community.png', selectedIconPath: 'assets/tabbar/community-active.png' },
      { pagePath: 'pages/mine/index', text: '我的', iconPath: 'assets/tabbar/mine.png', selectedIconPath: 'assets/tabbar/mine-active.png' }
    ]
  }
})
