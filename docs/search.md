# 全文搜索

<script setup>
import { ref, onMounted, watch } from 'vue'

const query = ref('')
const results = ref([])
const total = ref(0)
const loading = ref(false)
const suggestions = ref([])
const showSuggestions = ref(false)
const searchHistory = ref([])
const selectedIndex = ref(-1)

// 筛选条件
const filters = ref({
  contentType: '',
  startDate: '',
  endDate: '',
  sortBy: 'relevance',
  fuzzy: false
})

// 内容类型选项
const contentTypes = ref(['全天回顾', '盘中总结', '盘中小时总结', '开盘提要', '盘前全天提要', '盘后总结', '休市总结'])

// 加载搜索索引
let searchIndex = []
onMounted(async () => {
  try {
    const response = await fetch('/search_index.json')
    searchIndex = await response.json()
    console.log(`加载了 ${searchIndex.length} 条索引`)
    
    // 加载搜索历史
    const history = localStorage.getItem('search_history')
    if (history) {
      searchHistory.value = JSON.parse(history)
    }
  } catch (e) {
    console.error('加载索引失败:', e)
  }
})

// 防抖处理
let debounceTimer = null
watch(query, (newVal) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  
  if (newVal.length >= 2) {
    debounceTimer = setTimeout(() => {
      updateSuggestions(newVal)
    }, 200)
  } else {
    suggestions.value = []
    showSuggestions.value = false
  }
})

// 更新搜索建议
function updateSuggestions(partial) {
  const lower = partial.toLowerCase()
  const matches = new Set()
  
  // 从历史记录中匹配
  searchHistory.value.forEach(h => {
    if (h.query.toLowerCase().includes(lower) && h.query !== partial) {
      matches.add(h.query)
    }
  })
  
  // 从索引中提取关键词
  searchIndex.forEach(doc => {
    const content = doc.content.toLowerCase()
    // 股票代码匹配
    const stockMatches = content.match(/\b[A-Z]{2,5}\b/g) || []
    stockMatches.forEach(code => {
      if (code.toLowerCase().includes(lower) && code !== partial) {
        matches.add(code)
      }
    })
  })
  
  suggestions.value = Array.from(matches).slice(0, 5)
  showSuggestions.value = suggestions.value.length > 0
}

// 执行搜索
async function performSearch() {
  if (!query.value.trim()) return
  
  loading.value = true
  showSuggestions.value = false
  
  try {
    // 客户端搜索实现
    const query_terms = query.value.toLowerCase().split(/\s+/).filter(t => t.length > 1)
    const filtered = searchIndex.filter(doc => {
      // 类型筛选
      if (filters.value.contentType && !doc.content_type.includes(filters.value.contentType)) {
        return false
      }
      
      // 时间筛选
      if (filters.value.startDate && doc.created_at < filters.value.startDate) {
        return false
      }
      if (filters.value.endDate && doc.created_at > filters.value.endDate) {
        return false
      }
      
      // 关键词匹配
      const text = (doc.title + ' ' + doc.content).toLowerCase()
      return query_terms.every(term => text.includes(term))
    })
    
    // 计算相关性分数
    const scored = filtered.map(doc => {
      let score = 0
      const text = (doc.title + ' ' + doc.content).toLowerCase()
      
      query_terms.forEach(term => {
        if (doc.title.toLowerCase().includes(term)) score += 10
        score += (text.match(new RegExp(term, 'g')) || []).length
      })
      
      // 时间衰减
      const days = (Date.now() - new Date(doc.created_at)) / (1000 * 60 * 60 * 24)
      score *= (1 + Math.max(0, 1 - days / 365) * 0.1)
      
      return { ...doc, score }
    })
    
    // 排序
    if (filters.value.sortBy === 'date_desc') {
      scored.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    } else if (filters.value.sortBy === 'date_asc') {
      scored.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    } else {
      scored.sort((a, b) => b.score - a.score)
    }
    
    results.value = scored.slice(0, 20)
    total.value = scored.length
    
    // 保存到历史
    addToHistory(query.value, total.value)
    
  } catch (e) {
    console.error('搜索失败:', e)
  } finally {
    loading.value = false
  }
}

// 添加到历史记录
function addToHistory(q, count) {
  const existing = searchHistory.value.findIndex(h => h.query === q)
  if (existing >= 0) {
    searchHistory.value.splice(existing, 1)
  }
  
  searchHistory.value.unshift({
    query: q,
    timestamp: new Date().toISOString(),
    count: count
  })
  
  // 只保留最近20条
  if (searchHistory.value.length > 20) {
    searchHistory.value = searchHistory.value.slice(0, 20)
  }
  
  localStorage.setItem('search_history', JSON.stringify(searchHistory.value))
}

// 选择建议
function selectSuggestion(s) {
  query.value = s
  showSuggestions.value = false
  performSearch()
}

// 键盘导航
function handleKeydown(e) {
  if (e.key === 'Enter') {
    if (selectedIndex.value >= 0 && suggestions.value[selectedIndex.value]) {
      selectSuggestion(suggestions.value[selectedIndex.value])
    } else {
      performSearch()
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, -1)
  } else if (e.key === 'Escape') {
    showSuggestions.value = false
    selectedIndex.value = -1
  }
}

// 高亮关键词
function highlightText(text, query) {
  if (!query) return text
  const terms = query.split(/\s+/).filter(t => t.length > 1)
  let result = text
  terms.forEach(term => {
    const regex = new RegExp(`(${term})`, 'gi')
    result = result.replace(regex, '<mark>$1</mark>')
  })
  return result
}

// 清空历史
function clearHistory() {
  searchHistory.value = []
  localStorage.removeItem('search_history')
}
</script>

<div class="search-page">
  <h1>全文搜索</h1>
  <p class="search-desc">搜索历史总结、盘中总结、经验分享等内容</p>
  
  <!-- 搜索框 -->
  <div class="search-box">
    <div class="search-input-wrapper">
      <input
        v-model="query"
        @keydown="handleKeydown"
        @focus="showSuggestions = suggestions.length > 0"
        @blur="setTimeout(() => showSuggestions = false, 200)"
        type="text"
        placeholder="输入关键词搜索...（支持股票代码、话题等）"
        class="search-input"
      />
      <button @click="performSearch" class="search-btn" :disabled="loading">
        {{ loading ? '搜索中...' : '搜索' }}
      </button>
    </div>
    
    <!-- 搜索建议 -->
    <div v-if="showSuggestions" class="suggestions">
      <div
        v-for="(s, i) in suggestions"
        :key="s"
        @click="selectSuggestion(s)"
        :class="['suggestion-item', { active: i === selectedIndex }]"
      >
        {{ s }}
      </div>
    </div>
  </div>
  
  <!-- 筛选器 -->
  <div class="filters">
    <div class="filter-group">
      <label>内容类型:</label>
      <select v-model="filters.contentType">
        <option value="">全部</option>
        <option v-for="t in contentTypes" :key="t" :value="t">{{ t }}</option>
      </select>
    </div>
    
    <div class="filter-group">
      <label>开始日期:</label>
      <input type="date" v-model="filters.startDate" />
    </div>
    
    <div class="filter-group">
      <label>结束日期:</label>
      <input type="date" v-model="filters.endDate" />
    </div>
    
    <div class="filter-group">
      <label>排序:</label>
      <select v-model="filters.sortBy">
        <option value="relevance">相关度</option>
        <option value="date_desc">最新优先</option>
        <option value="date_asc">最早优先</option>
      </select>
    </div>
    
    <div class="filter-group">
      <label>
        <input type="checkbox" v-model="filters.fuzzy" />
        模糊匹配
      </label>
    </div>
  </div>
  
  <!-- 搜索历史 -->
  <div v-if="searchHistory.length > 0" class="search-history">
    <div class="history-header">
      <h3>搜索历史</h3>
      <button @click="clearHistory" class="clear-btn">清空</button>
    </div>
    <div class="history-tags">
      <span
        v-for="h in searchHistory.slice(0, 10)"
        :key="h.timestamp"
        @click="query = h.query; performSearch()"
        class="history-tag"
      >
        {{ h.query }}
      </span>
    </div>
  </div>
  
  <!-- 搜索结果 -->
  <div v-if="results.length > 0" class="search-results">
    <div class="results-header">
      <h3>搜索结果 ({{ total }} 条)</h3>
    </div>
    
    <div v-for="r in results" :key="r.id" class="result-item">
      <a v-if="r.is_built_page !== false && r.url" :href="r.url" class="result-title">
        <span v-html="highlightText(r.title, query)"></span>
      </a>
      <div v-else class="result-title result-title-static">
        <span v-html="highlightText(r.title, query)"></span>
      </div>
      <div class="result-meta">
        <span class="result-type">{{ r.content_type }}</span>
        <span v-if="r.is_built_page === false" class="result-archive">历史索引</span>
        <span class="result-date">{{ new Date(r.created_at).toLocaleString('zh-CN') }}</span>
        <span class="result-score">相关度: {{ r.score.toFixed(2) }}</span>
      </div>
      <div class="result-content" v-html="highlightText(r.content.slice(0, 200) + '...', query)"></div>
    </div>
  </div>
  
  <!-- 无结果 -->
  <div v-else-if="query && !loading" class="no-results">
    <p>未找到与 "{{ query }}" 相关的内容</p>
    <p class="tips">
      建议：<br/>
      • 检查关键词拼写<br/>
      • 尝试使用更通用的关键词<br/>
      • 启用"模糊匹配"选项
    </p>
  </div>
</div>

<style scoped>
.search-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 20px;
}

.search-desc {
  color: #666;
  margin-bottom: 20px;
}

.search-box {
  position: relative;
  margin-bottom: 20px;
}

.search-input-wrapper {
  display: flex;
  gap: 10px;
}

.search-input {
  flex: 1;
  padding: 12px 16px;
  font-size: 16px;
  border: 2px solid #ddd;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.3s;
}

.search-input:focus {
  border-color: #3eaf7c;
}

.search-btn {
  padding: 12px 24px;
  background: #3eaf7c;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.3s;
}

.search-btn:hover:not(:disabled) {
  background: #359c6d;
}

.search-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 80px;
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 100;
}

.suggestion-item {
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.suggestion-item:hover,
.suggestion-item.active {
  background: #f0f0f0;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 20px;
  padding: 15px;
  background: #f8f8f8;
  border-radius: 8px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-group label {
  font-size: 14px;
  color: #666;
}

.filter-group select,
.filter-group input[type="date"] {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-history {
  margin-bottom: 20px;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-header h3 {
  margin: 0;
  font-size: 16px;
}

.clear-btn {
  padding: 4px 12px;
  font-size: 12px;
  background: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
}

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-tag {
  padding: 4px 12px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 16px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.history-tag:hover {
  background: #c8e6c9;
}

.search-results {
  margin-top: 20px;
}

.results-header {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #eee;
}

.results-header h3 {
  margin: 0;
}

.result-item {
  padding: 20px 0;
  border-bottom: 1px solid #eee;
}

.result-title {
  font-size: 18px;
  font-weight: 500;
  color: #3eaf7c;
  text-decoration: none;
  display: block;
  margin-bottom: 8px;
}

.result-title:hover {
  text-decoration: underline;
}

.result-title-static {
  color: #444;
}

.result-title-static:hover {
  text-decoration: none;
}

.result-meta {
  display: flex;
  gap: 15px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #666;
}

.result-type {
  background: #e3f2fd;
  color: #1976d2;
  padding: 2px 8px;
  border-radius: 4px;
}

.result-archive {
  background: #f5f5f5;
  color: #666;
  padding: 2px 8px;
  border-radius: 4px;
}

.result-content {
  color: #555;
  line-height: 1.6;
  font-size: 14px;
}

.result-content :deep(mark) {
  background: #ffeb3b;
  padding: 0 2px;
  border-radius: 2px;
}

.no-results {
  text-align: center;
  padding: 40px;
  color: #666;
}

.no-results .tips {
  margin-top: 20px;
  text-align: left;
  display: inline-block;
  background: #f5f5f5;
  padding: 15px 20px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.8;
}

@media (max-width: 768px) {
  .filters {
    flex-direction: column;
    gap: 10px;
  }
  
  .filter-group {
    width: 100%;
  }
  
  .filter-group select,
  .filter-group input[type="date"] {
    flex: 1;
  }
}
</style>
