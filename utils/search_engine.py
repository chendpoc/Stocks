"""
全文搜索系统 - 支持对项目内所有文本内容进行高效检索

功能特性：
1. 关键词搜索、模糊匹配
2. 时间范围筛选、内容类型筛选
3. 搜索结果高亮显示
4. 基于相关性和时间的排序
5. 搜索历史记录管理
6. 搜索建议功能

技术实现：
- 数据量小，直接遍历全部内容
- 保留优化空间（可扩展为倒排索引）
- 性能目标：<2秒响应，支持10万条记录
"""

import os
import re
import json
import time
import hashlib
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple, Set
from dataclasses import dataclass, field, asdict
from pathlib import Path
import difflib
from collections import defaultdict


@dataclass
class SearchResult:
    """搜索结果条目"""
    id: str
    title: str
    content: str
    file_path: str
    url: Optional[str]
    is_built_page: bool
    created_at: datetime
    content_type: str
    relevance_score: float = 0.0
    highlights: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content[:500] + "..." if len(self.content) > 500 else self.content,
            "file_path": self.file_path,
            "url": self.url,
            "is_built_page": self.is_built_page,
            "created_at": self.created_at.isoformat(),
            "content_type": self.content_type,
            "relevance_score": self.relevance_score,
            "highlights": self.highlights
        }


@dataclass
class SearchHistory:
    """搜索历史记录"""
    query: str
    timestamp: datetime
    result_count: int
    filters: Dict[str, Any] = field(default_factory=dict)


class ContentIndexer:
    """
    内容索引器
    
    负责：
    1. 扫描并解析所有 Markdown 文件
    2. 提取元数据（时间、类型、内容）
    3. 构建内存索引（支持快速遍历）
    4. 生成静态索引文件（供前端使用）
    """
    
    def __init__(self, summaries_dir: str = "docs/summaries"):
        self.summaries_dir = Path(summaries_dir)
        self.index: List[Dict[str, Any]] = []
        self.index_cache_path = Path("docs/search_index.json")
        
    def build_index(self, force_rebuild: bool = False) -> List[Dict[str, Any]]:
        """
        构建内容索引
        
        Args:
            force_rebuild: 是否强制重建索引
            
        Returns:
            索引列表
        """
        # 检查缓存
        if not force_rebuild and self.index_cache_path.exists():
            cache_mtime = self.index_cache_path.stat().st_mtime
            # 检查是否有文件更新
            needs_rebuild = False
            for md_file in self.summaries_dir.rglob("*.md"):
                if md_file.stat().st_mtime > cache_mtime:
                    needs_rebuild = True
                    break
            if not needs_rebuild:
                with open(self.index_cache_path, 'r', encoding='utf-8') as f:
                    self.index = json.load(f)
                return self.index
        
        self.index = []
        
        if not self.summaries_dir.exists():
            return self.index
            
        for md_file in sorted(self.summaries_dir.rglob("*.md")):
            try:
                doc = self._parse_markdown_file(md_file)
                if doc:
                    self.index.append(doc)
            except Exception as e:
                print(f"解析文件失败 {md_file}: {e}")
                continue
        
        # 保存索引缓存
        self._save_index_cache()
        
        return self.index
    
    def _parse_markdown_file(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """解析单个 Markdown 文件"""
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 从文件名提取时间和类型
        filename = file_path.stem
        created_at, content_type = self._extract_metadata_from_filename(filename)
        
        # 提取标题
        title = self._extract_title(content, filename)
        
        # 清理内容（移除 Markdown 标记）
        clean_content = self._clean_markdown(content)
        
        # 生成唯一ID
        doc_id = hashlib.md5(str(file_path).encode()).hexdigest()[:12]
        is_built_page = self._is_built_page(file_path)
        url = self._build_public_url(file_path)
        
        return {
            "id": doc_id,
            "title": title,
            "content": clean_content,
            "file_path": str(file_path).replace("\\", "/"),
            "url": url if is_built_page else None,
            "is_built_page": is_built_page,
            "created_at": created_at.isoformat(),
            "content_type": content_type,
            "word_count": len(clean_content),
            "raw_content": content  # 保留原始内容用于高亮
        }

    def _summary_relative_path(self, file_path: Path) -> str:
        try:
            return file_path.relative_to(self.summaries_dir).as_posix()
        except ValueError:
            return file_path.name

    def _is_built_page(self, file_path: Path) -> bool:
        summary_rel = self._summary_relative_path(file_path)
        return not ("/" not in summary_rel and summary_rel.startswith("20"))

    def _build_public_url(self, file_path: Path) -> str:
        summary_rel = self._summary_relative_path(file_path)
        return f"/summaries/{Path(summary_rel).with_suffix('').as_posix()}"
    
    def _extract_metadata_from_filename(self, filename: str) -> Tuple[datetime, str]:
        """从文件名提取时间和类型"""
        # 文件名格式: "2025-12-06 05_00_37-全天回顾.md"
        content_type = "总结"
        
        # 尝试提取类型
        daily_match = re.match(r"^(\d{4}-\d{2}-\d{2})-(.+)$", filename)
        if daily_match:
            return datetime.strptime(daily_match.group(1), "%Y-%m-%d"), daily_match.group(2).strip()

        if "-" in filename:
            parts = filename.rsplit("-", 1)
            if len(parts) == 2:
                content_type = parts[1].strip()
        
        # 解析时间，兼容新旧归档文件名
        created_at = datetime.now()
        for pattern in ("%Y-%m-%d_%H-%M-%S", "%Y-%m-%d %H_%M_%S", "%Y-%m-%d %H:%M:%S"):
            try:
                created_at = datetime.strptime(filename[:19], pattern)
                break
            except ValueError:
                continue
        
        return created_at, content_type
    
    def _extract_title(self, content: str, filename: str) -> str:
        """提取文档标题"""
        # 尝试从内容中提取 H1 标题
        match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        if match:
            return match.group(1).strip()
        
        # 回退到文件名
        return filename.replace("_", " ")
    
    def _clean_markdown(self, content: str) -> str:
        """清理 Markdown 标记，返回纯文本"""
        # 移除代码块
        content = re.sub(r'```[\s\S]*?```', '', content)
        # 移除行内代码
        content = re.sub(r'`[^`]*`', '', content)
        # 移除链接，保留文本
        content = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', content)
        # 移除图片
        content = re.sub(r'!\[([^\]]*)\]\([^)]+\)', '', content)
        # 移除 HTML 标签
        content = re.sub(r'<[^>]+>', '', content)
        # 移除标题标记
        content = re.sub(r'^#+\s*', '', content, flags=re.MULTILINE)
        # 移除强调标记
        content = re.sub(r'[*_]{1,2}([^*_]+)[*_]{1,2}', r'\1', content)
        # 移除列表标记
        content = re.sub(r'^\s*[-*+]\s+', '', content, flags=re.MULTILINE)
        content = re.sub(r'^\s*\d+\.\s+', '', content, flags=re.MULTILINE)
        # 移除引用标记
        content = re.sub(r'^>\s*', '', content, flags=re.MULTILINE)
        # 移除水平线
        content = re.sub(r'^-{3,}$', '', content, flags=re.MULTILINE)
        # 合并多余空白
        content = re.sub(r'\n{3,}', '\n\n', content)
        
        return content.strip()
    
    def _save_index_cache(self):
        """保存索引缓存"""
        self.index_cache_path.parent.mkdir(parents=True, exist_ok=True)
        # 不保存 raw_content 到缓存
        cache_data = [{k: v for k, v in doc.items() if k != "raw_content"} 
                      for doc in self.index]
        with open(self.index_cache_path, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)


class SearchEngine:
    """
    搜索引擎核心类
    
    提供：
    1. 全文搜索（关键词匹配）
    2. 模糊搜索（相似度匹配）
    3. 高级筛选（时间范围、内容类型）
    4. 结果排序（相关性、时间）
    5. 搜索建议
    6. 搜索历史管理
    """
    
    def __init__(self, summaries_dir: str = "docs/summaries"):
        self.indexer = ContentIndexer(summaries_dir)
        self.index: List[Dict[str, Any]] = []
        self.history: List[SearchHistory] = []
        self.history_file = Path("data/search_history.json")
        self.suggestions_cache: Dict[str, List[str]] = {}
        
        # 加载索引和历史
        self._load_index()
        self._load_history()
    
    def _load_index(self):
        """加载索引"""
        self.index = self.indexer.build_index()
    
    def _load_history(self):
        """加载搜索历史"""
        if self.history_file.exists():
            try:
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.history = [
                        SearchHistory(
                            query=h["query"],
                            timestamp=datetime.fromisoformat(h["timestamp"]),
                            result_count=h["result_count"],
                            filters=h.get("filters", {})
                        )
                        for h in data
                    ]
            except:
                self.history = []
    
    def _save_history(self):
        """保存搜索历史"""
        self.history_file.parent.mkdir(parents=True, exist_ok=True)
        data = [
            {
                "query": h.query,
                "timestamp": h.timestamp.isoformat(),
                "result_count": h.result_count,
                "filters": h.filters
            }
            for h in self.history[-100:]  # 只保留最近100条
        ]
        with open(self.history_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def search(
        self,
        query: str,
        content_type: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        sort_by: str = "relevance",  # "relevance" | "date_desc" | "date_asc"
        fuzzy: bool = False,
        limit: int = 20,
        offset: int = 0
    ) -> Tuple[List[SearchResult], int]:
        """
        执行搜索
        
        Args:
            query: 搜索关键词
            content_type: 内容类型筛选
            start_date: 开始时间
            end_date: 结束时间
            sort_by: 排序方式
            fuzzy: 是否启用模糊匹配
            limit: 返回结果数量
            offset: 分页偏移
            
        Returns:
            (结果列表, 总数量)
        """
        start_time = time.time()
        
        if not query.strip():
            return [], 0
        
        # 预处理查询
        query = query.strip().lower()
        query_terms = self._tokenize(query)
        
        # 执行搜索
        results = []
        for doc in self.index:
            # 时间筛选
            doc_date = datetime.fromisoformat(doc["created_at"])
            if start_date and doc_date < start_date:
                continue
            if end_date and doc_date > end_date:
                continue
            
            # 类型筛选
            if content_type and content_type not in doc["content_type"]:
                continue
            
            # 计算匹配分数
            score, highlights = self._calculate_score(doc, query_terms, fuzzy)
            
            if score > 0:
                result = SearchResult(
                    id=doc["id"],
                    title=doc["title"],
                    content=doc["content"],
                    file_path=doc["file_path"],
                    url=doc.get("url"),
                    is_built_page=doc.get("is_built_page", True),
                    created_at=doc_date,
                    content_type=doc["content_type"],
                    relevance_score=score,
                    highlights=highlights
                )
                results.append(result)
        
        # 排序
        results = self._sort_results(results, sort_by, query_terms)
        
        # 记录历史
        total_count = len(results)
        self._record_history(query, total_count, {
            "content_type": content_type,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "sort_by": sort_by,
            "fuzzy": fuzzy
        })
        
        # 分页
        paginated_results = results[offset:offset + limit]
        
        elapsed = time.time() - start_time
        print(f"搜索完成: 查询 '{query}' 找到 {total_count} 条结果，耗时 {elapsed:.3f}s")
        
        return paginated_results, total_count
    
    def _tokenize(self, text: str) -> List[str]:
        """分词"""
        # 简单的分词：按空格和标点分割
        tokens = re.findall(r'\b[\w\u4e00-\u9fff]+\b', text.lower())
        # 过滤停用词
        stop_words = {'的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'}
        return [t for t in tokens if t not in stop_words and len(t) > 1]
    
    def _calculate_score(
        self, 
        doc: Dict[str, Any], 
        query_terms: List[str],
        fuzzy: bool
    ) -> Tuple[float, List[str]]:
        """
        计算文档与查询的相关性分数
        
        评分规则：
        - 标题匹配：权重 10
        - 内容开头匹配：权重 5
        - 内容匹配：权重 1
        - 完整短语匹配：额外权重 20
        """
        score = 0.0
        highlights = []
        
        title = doc["title"].lower()
        content = doc["content"].lower()
        
        # 完整短语匹配
        full_query = ' '.join(query_terms)
        if full_query in title:
            score += 20
            highlights.append(self._extract_highlight(doc["title"], full_query))
        elif full_query in content:
            score += 10
            highlights.append(self._extract_highlight(doc["content"], full_query))
        
        # 分词匹配
        for term in query_terms:
            # 标题匹配
            if term in title:
                score += 10
                if len(highlights) < 3:
                    highlights.append(self._extract_highlight(doc["title"], term))
            
            # 内容开头匹配（前500字符）
            content_start = content[:500]
            if term in content_start:
                score += 5
                if len(highlights) < 3:
                    highlights.append(self._extract_highlight(content[:200], term))
            
            # 内容匹配
            count = content.count(term)
            score += count * 1
            
            # 模糊匹配
            if fuzzy and count == 0:
                # 使用 difflib 计算相似度
                for word in re.findall(r'\b[\w\u4e00-\u9fff]+\b', content):
                    similarity = difflib.SequenceMatcher(None, term, word).ratio()
                    if similarity > 0.8:
                        score += 0.5
                        break
        
        # 时间衰减因子（越新的内容分数略高）
        doc_date = datetime.fromisoformat(doc["created_at"])
        days_old = (datetime.now() - doc_date).days
        time_boost = max(0, 1 - days_old / 365) * 0.1  # 一年内最多 10% 加成
        score *= (1 + time_boost)
        
        return score, highlights[:3]
    
    def _extract_highlight(self, text: str, keyword: str, context: int = 50) -> str:
        """提取关键词周围的上下文作为高亮片段"""
        text_lower = text.lower()
        keyword_lower = keyword.lower()
        
        idx = text_lower.find(keyword_lower)
        if idx == -1:
            return text[:100] + "..."
        
        start = max(0, idx - context)
        end = min(len(text), idx + len(keyword) + context)
        
        highlight = text[start:end]
        if start > 0:
            highlight = "..." + highlight
        if end < len(text):
            highlight = highlight + "..."
        
        return highlight
    
    def _sort_results(
        self, 
        results: List[SearchResult], 
        sort_by: str,
        query_terms: List[str]
    ) -> List[SearchResult]:
        """对结果进行排序"""
        if sort_by == "date_desc":
            return sorted(results, key=lambda x: x.created_at, reverse=True)
        elif sort_by == "date_asc":
            return sorted(results, key=lambda x: x.created_at)
        else:  # relevance
            # 综合相关性和时间
            return sorted(results, key=lambda x: (
                x.relevance_score,
                x.created_at.timestamp()
            ), reverse=True)
    
    def _record_history(self, query: str, result_count: int, filters: Dict[str, Any]):
        """记录搜索历史"""
        # 去重：如果相同查询在1分钟内已存在，更新它
        now = datetime.now()
        for h in self.history:
            if h.query == query and (now - h.timestamp).seconds < 60:
                h.timestamp = now
                h.result_count = result_count
                h.filters = filters
                self._save_history()
                return
        
        self.history.append(SearchHistory(
            query=query,
            timestamp=now,
            result_count=result_count,
            filters=filters
        ))
        self._save_history()
    
    def get_suggestions(self, partial: str, limit: int = 5) -> List[str]:
        """
        获取搜索建议
        
        基于：
        1. 搜索历史
        2. 内容中的高频词
        """
        if not partial or len(partial) < 2:
            return []
        
        partial = partial.lower()
        suggestions = set()
        
        # 从历史记录中匹配
        for h in sorted(self.history, key=lambda x: x.timestamp, reverse=True):
            if partial in h.query.lower() and h.query.lower() != partial:
                suggestions.add(h.query)
                if len(suggestions) >= limit:
                    break
        
        # 从内容中提取匹配的关键词
        if len(suggestions) < limit:
            for doc in self.index[:100]:  # 只检查最近的100个文档
                content = doc["content"].lower()
                # 提取股票代码、关键词等
                patterns = [
                    r'\b[A-Z]{2,5}\b',  # 股票代码
                    r'\b\w{3,}\b'  # 普通单词
                ]
                for pattern in patterns:
                    for match in re.finditer(pattern, content):
                        word = match.group()
                        if partial in word.lower() and word.lower() != partial:
                            suggestions.add(word)
                            if len(suggestions) >= limit:
                                break
                    if len(suggestions) >= limit:
                        break
                if len(suggestions) >= limit:
                    break
        
        return list(suggestions)[:limit]
    
    def get_search_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """获取搜索历史"""
        return [
            {
                "query": h.query,
                "timestamp": h.timestamp.isoformat(),
                "result_count": h.result_count
            }
            for h in sorted(self.history, key=lambda x: x.timestamp, reverse=True)[:limit]
        ]
    
    def clear_history(self):
        """清空搜索历史"""
        self.history = []
        if self.history_file.exists():
            self.history_file.unlink()
    
    def get_content_types(self) -> List[str]:
        """获取所有内容类型"""
        types = set()
        for doc in self.index:
            types.add(doc["content_type"])
        return sorted(list(types))
    
    def get_date_range(self) -> Tuple[Optional[datetime], Optional[datetime]]:
        """获取内容的日期范围"""
        if not self.index:
            return None, None
        
        dates = [datetime.fromisoformat(doc["created_at"]) for doc in self.index]
        return min(dates), max(dates)
    
    def refresh_index(self):
        """刷新索引"""
        self.index = self.indexer.build_index(force_rebuild=True)
        print(f"索引已刷新，共 {len(self.index)} 条记录")


# 便捷函数
def search(
    query: str,
    content_type: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: str = "relevance",
    fuzzy: bool = False,
    limit: int = 20
) -> Dict[str, Any]:
    """
    便捷的搜索函数
    
    Args:
        query: 搜索关键词
        content_type: 内容类型筛选
        start_date: 开始日期（ISO格式字符串）
        end_date: 结束日期（ISO格式字符串）
        sort_by: 排序方式
        fuzzy: 是否模糊匹配
        limit: 返回数量
        
    Returns:
        搜索结果字典
    """
    engine = SearchEngine()
    
    # 解析日期
    start = datetime.fromisoformat(start_date) if start_date else None
    end = datetime.fromisoformat(end_date) if end_date else None
    
    results, total = engine.search(
        query=query,
        content_type=content_type,
        start_date=start,
        end_date=end,
        sort_by=sort_by,
        fuzzy=fuzzy,
        limit=limit
    )
    
    return {
        "query": query,
        "total": total,
        "results": [r.to_dict() for r in results],
        "content_types": engine.get_content_types(),
        "date_range": {
            "min": engine.get_date_range()[0].isoformat() if engine.get_date_range()[0] else None,
            "max": engine.get_date_range()[1].isoformat() if engine.get_date_range()[1] else None
        }
    }


if __name__ == "__main__":
    # 测试代码
    engine = SearchEngine()
    
    print("=" * 50)
    print("全文搜索系统测试")
    print("=" * 50)
    
    # 测试搜索
    test_queries = ["比特币", "NVDA", "期权", "管理员"]
    
    for query in test_queries:
        print(f"\n搜索: '{query}'")
        results, total = engine.search(query, limit=3)
        print(f"  找到 {total} 条结果")
        for r in results[:2]:
            print(f"  - {r.title} (相关度: {r.relevance_score:.2f})")
    
    # 测试搜索建议
    print("\n搜索建议测试:")
    for partial in ["比", "NV", "期"]:
        suggestions = engine.get_suggestions(partial)
        print(f"  '{partial}' -> {suggestions}")
    
    # 测试高级搜索
    print("\n高级搜索测试（时间范围）:")
    start = datetime.now() - timedelta(days=7)
    results, total = engine.search("总结", start_date=start, sort_by="date_desc")
    print(f"  最近7天找到 {total} 条结果")
    
    print("\n" + "=" * 50)
    print("测试完成")
