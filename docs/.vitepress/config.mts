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

function getSummarySrcExclude() {
  return [
    'summaries/index.md',
    'summaries/20*.md',
    'summaries/**/*.md',
    'search.md',
    ...getOldMonthlySrcExclude('trading-experiences'),
  ]
}

export default defineConfig({
  title: "Stocks Summaries",
  description: "A VitePress Site for Stocks Summaries.",

  base: '/',

  srcExclude: getSummarySrcExclude(),


  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '经验总结', link: '/trading-experiences/' },
      { text: '币预警（Beta）', link: '/alerts/' }
    ],

    search: {
      provider: 'local',
      options: {
        detailedView: true
      }
    },

    sidebar: {},
    socialLinks: [
      { icon: 'github', link: 'https://github.com/andychenggg/Stocks' }
    ]
  }
})
