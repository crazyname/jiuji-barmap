module.exports = function (merge) {
  return merge({}, {
    projectName: 'jiuji-barmap',
    designWidth: 750,
    deviceRatio: { 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
    sourceRoot: 'src',
    outputRoot: 'dist',
    framework: 'react',
    compiler: 'webpack5',
    plugins: ['@tarojs/plugin-framework-react', '@tarojs/plugin-platform-weapp'],
    mini: {
      postcss: { pxtransform: { enable: true }, cssModules: { enable: false } },
      // PR-04 activates the PR-03 core from real Taro pages. Taro's default
      // script loader only covers src; transpile the shared TS source as well.
      webpackChain(chain) {
        const coreTs = /packages.*(?:core|sync).*(?:src\/)?[\w-]+\.ts$/
        chain.module.rule('shared-journal-ts').test(coreTs)
          .use('babel-loader').loader(require.resolve('babel-loader'))
          .options({ presets: [[require.resolve('babel-preset-taro'), { framework: 'react', ts: true }]] })
      }
    }
  })
}
