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

const publicDailySummaryPattern = /^\d{4}-\d{2}-\d{2}-每日总结\.md$/
const isFullHistoryDev = process.env.npm_lifecycle_event === 'docs:dev'

function getSummarySrcExclude() {
  return [
    'summaries/20*.md',
    'summaries/*/*-local.md',
    'summaries/*/*_*.md',
    'summaries/*/*-休市总结.md',
    'opportunities/*.md',
    'opportunities/**/*.md',
    'research-agent/*.md',
    'research-agent/**/*.md',
    'superpowers/*.md',
    'superpowers/**/*.md',
    'search.md',
    ...getOldMonthlySrcExclude('summaries'),
    ...getOldMonthlySrcExclude('trading-experiences'),
  ]
}

function getOpportunityItems(month: string) {
  const opportunitiesDir = path.resolve(__dirname, '../opportunities')
  const monthDir = path.join(opportunitiesDir, month)
  if (!fs.existsSync(monthDir)) {
    return []
  }

  return fs
    .readdirSync(monthDir)
    .filter(file => file.endsWith('.md'))
    .sort((a, b) => b.localeCompare(a))
    .map(file => ({
      text: file.replace('.md', ''),
      link: `/opportunities/${month}/${file.replace('.md', '')}`,
    }))
}

function getOpportunitiesSidebar() {
  return getMonthlyDirs('opportunities')
    .map(month => {
      const items = getOpportunityItems(month)
      if (!items.length) {
        return null
      }

      return {
        text: `${month} 机会观察`,
        collapsed: false,
        items,
      }
    })
    .filter(Boolean)
}

function getSummaryLink(month: string, file: string, files: Set<string>, fullHistory: boolean) {
  if (fullHistory && publicDailySummaryPattern.test(file)) {
    const localFile = file.replace('.md', '-local.md')
    if (files.has(localFile)) {
      return `/summaries/${month}/${localFile.replace('.md', '')}`
    }
  }

  return `/summaries/${month}/${file.replace('.md', '')}`
}

function getSummaryItems(month: string, fullHistory: boolean) {
  const summariesDir = path.resolve(__dirname, '../summaries')
  const monthDir = path.join(summariesDir, month)
  if (!fs.existsSync(monthDir)) {
    return []
  }

  const files = new Set(fs.readdirSync(monthDir).filter(file => file.endsWith('.md')))

  return [...files]
    .filter(file => file.endsWith('.md'))
    .filter(file => !file.endsWith('-local.md'))
    .filter(file => fullHistory || publicDailySummaryPattern.test(file))
    .sort((a, b) => b.localeCompare(a))
    .map(file => ({
      text: file.replace('.md', ''),
      link: getSummaryLink(month, file, files, fullHistory),
    }))
}

function getLegacySummaryItems() {
  const summariesDir = path.resolve(__dirname, '../summaries')
  if (!fs.existsSync(summariesDir)) {
    return []
  }

  return fs
    .readdirSync(summariesDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'index.md')
    .map(entry => entry.name)
    .sort((a, b) => b.localeCompare(a))
    .map(file => ({
      text: file.replace('.md', ''),
      link: `/summaries/${file.replace('.md', '')}`,
    }))
}

function getSummariesSidebar(fullHistory: boolean = false) {
  const latestMonth = getLatestMonth('summaries')
  const months = fullHistory ? getMonthlyDirs('summaries') : getMonthlyDirs('summaries').slice(0, 1)

  if (!latestMonth || !months.length) {
    return []
  }

  const groups = months
    .map(month => {
      const items = getSummaryItems(month, fullHistory)
      if (!items.length) {
        return null
      }

      return {
        text: `${month} 历史总结`,
        collapsed: fullHistory ? month !== latestMonth : false,
        items,
      }
    })
    .filter(Boolean)

  const legacyItems = fullHistory ? getLegacySummaryItems() : []
  if (legacyItems.length) {
    groups.push({
      text: '旧版历史文件',
      collapsed: true,
      items: legacyItems,
    })
  }

  return groups
}

const navItems = [
  { text: '首页', link: '/' },
  { text: '历史总结', link: '/summaries/' },
  { text: '经验总结', link: '/trading-experiences/' },
  { text: '币预警（Beta）', link: '/alerts/' },
]

const sidebarConfig: Record<string, any> = {
  '/summaries/': getSummariesSidebar(isFullHistoryDev),
}

if (isFullHistoryDev) {
  navItems.splice(2, 0, { text: '机会观察', link: '/opportunities/' })
  sidebarConfig['/opportunities/'] = getOpportunitiesSidebar()
}

export default defineConfig({
  title: "Stocks Summaries",
  description: "A VitePress Site for Stocks Summaries.",

  base: '/',

  srcExclude: isFullHistoryDev ? ['search.md'] : getSummarySrcExclude(),


  themeConfig: {
    nav: navItems,

    search: {
      provider: 'local',
      options: {
        detailedView: true
      }
    },

    sidebar: sidebarConfig,
    socialLinks: [
      { icon: 'github', link: 'https://github.com/andychenggg/Stocks' }
    ]
  }
})
