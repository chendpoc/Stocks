import { defineConfig } from 'vitepress'
import fs from 'fs'
import path from 'path'

function getMonthlyDirs(section: string) {
  const sectionDir = path.resolve(__dirname, `../${section}`)

  if (!fs.existsSync(sectionDir)) {
    return []
  }

  return fs
    .readdirSync(sectionDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}$/.test(entry.name))
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a))
}

function getOldMonthlySrcExclude(section: string) {
  return getMonthlyDirs(section)
    .slice(1)
    .map(month => `${section}/${month}/**/*.md`)
}

function getLatestMonth(section: string) {
  return getMonthlyDirs(section)[0] ?? null
}

function getSummarySrcExclude() {
  return [
    'summaries/20*.md',
    'search.md',
    ...getOldMonthlySrcExclude('summaries'),
    ...getOldMonthlySrcExclude('trading-experiences'),
  ]
}

function getSummariesSidebar() {
  const month = getLatestMonth('summaries')
  const summariesDir = path.resolve(__dirname, '../summaries')

  if (!month || !fs.existsSync(summariesDir)) {
    return []
  }

  const monthDir = path.join(summariesDir, month)
  if (!fs.existsSync(monthDir)) {
    return []
  }

  const items = fs
    .readdirSync(monthDir)
    .filter(file => file.endsWith('.md') && file !== '_sidebar.md')
    .sort((a, b) => b.localeCompare(a))
    .map(file => ({
      text: file.replace('.md', ''),
      link: `/summaries/${month}/${file.replace('.md', '')}`,
    }))

  return items.length
    ? [
        {
          text: `${month} 历史总结`,
          collapsed: false,
          items,
        },
      ]
    : []
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

    sidebar: {
      '/summaries/': getSummariesSidebar(),
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/andychenggg/Stocks' }
    ]
  }
})
