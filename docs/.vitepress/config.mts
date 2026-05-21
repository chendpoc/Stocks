import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'

// 自动生成 summaries 列表
function getSummaryMonthDirs() {
  const summariesDir = path.resolve(__dirname, '../summaries')

  if (!fs.existsSync(summariesDir)) {
    return []
  }

  return fs
    .readdirSync(summariesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a))
}

function getLatestSummaryMonth() {
  return getSummaryMonthDirs()[0] ?? null
}

const latestSummaryMonth = getLatestSummaryMonth()

function getSummarySrcExclude() {
  return [
    'summaries/20*.md',
    ...getSummaryMonthDirs()
      .filter(month => month !== latestSummaryMonth)
      .map(month => `summaries/${month}/**/*.md`),
  ]
}

function getSummariesSidebar() {
  const summariesDir = path.resolve(__dirname, '../summaries')

  if (!latestSummaryMonth || !fs.existsSync(summariesDir)) {
    return []
  }

  return getSummaryMonthDirs()
    .filter(month => month === latestSummaryMonth)
    .map(month => {
      const monthDir = path.join(summariesDir, month)
      const items = fs
        .readdirSync(monthDir)
        .filter(file => file.endsWith('.md') && file !== '_sidebar.md')
        .sort((a, b) => b.localeCompare(a))
        .map(file => ({
          text: file.replace('.md', ''),
          link: `/summaries/${month}/${file.replace('.md', '')}`,
        }))

      return {
        text: month,
        collapsed: false,
        items,
      }
    })
    .filter(group => group.items.length > 0)
}

export default defineConfig({
  title: "Stocks Summaries",
  description: "A VitePress Site for Stocks Summaries.",

  base: '/',

  srcExclude: getSummarySrcExclude(),


  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '历史总结', link: '/summaries/' },
      { text: '经验总结', link: '/trading-experiences/' },
      { text: '币预警（Beta）', link: '/alerts/' }
    ],

    search: {
      provider: 'local',
      options: {
        detailedView: true
      }
    },

    // 🔥 侧边栏：只有 summaries 才需要
    sidebar: {
      '/summaries/': [
        {
          text: '历史总结',
          items: getSummariesSidebar()
        }
      ]
      // 首页 / 不需要 sidebar，因此不写 '/'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/andychenggg/Stocks' }
    ]
  }
})
