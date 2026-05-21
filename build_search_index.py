#!/usr/bin/env python3
"""
构建搜索索引脚本

在每次生成新的总结后运行此脚本，更新搜索索引文件。
可以添加到 whop_summary.py 的自动化流程中。
"""

import os
import sys
import json

# Windows GBK 控制台打印 Unicode 可能报错，尽量使用 UTF-8 输出
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass
import re
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple


class SimpleContentIndexer:
    """简化的内容索引器（独立实现，避免导入依赖）"""
    
    def __init__(self, summaries_dir: str = "docs/summaries"):
        self.summaries_dir = Path(summaries_dir)
        self.index: List[Dict[str, Any]] = []
        self.index_cache_path = Path("docs/search_index.json")
        
    def build_index(self, force_rebuild: bool = False) -> List[Dict[str, Any]]:
        """构建内容索引"""
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
            "word_count": len(clean_content)
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
        content_type = "总结"
        
        daily_match = re.match(r"^(\d{4}-\d{2}-\d{2})-(.+)$", filename)
        if daily_match:
            return datetime.strptime(daily_match.group(1), "%Y-%m-%d"), daily_match.group(2).strip()

        if "-" in filename:
            parts = filename.rsplit("-", 1)
            if len(parts) == 2:
                content_type = parts[1].strip()
        
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
        match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
        if match:
            return match.group(1).strip()
        return filename.replace("_", " ")
    
    def _clean_markdown(self, content: str) -> str:
        """清理 Markdown 标记"""
        content = re.sub(r'```[\s\S]*?```', '', content)
        content = re.sub(r'`[^`]*`', '', content)
        content = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', content)
        content = re.sub(r'!\[([^\]]*)\]\([^)]+\)', '', content)
        content = re.sub(r'<[^>]+>', '', content)
        content = re.sub(r'^#+\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'[*_]{1,2}([^*_]+)[*_]{1,2}', r'\1', content)
        content = re.sub(r'^\s*[-*+]\s+', '', content, flags=re.MULTILINE)
        content = re.sub(r'^\s*\d+\.\s+', '', content, flags=re.MULTILINE)
        content = re.sub(r'^>\s*', '', content, flags=re.MULTILINE)
        content = re.sub(r'^-{3,}$', '', content, flags=re.MULTILINE)
        content = re.sub(r'\n{3,}', '\n\n', content)
        return content.strip()
    
    def _save_index_cache(self):
        """保存索引缓存"""
        self.index_cache_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.index_cache_path, 'w', encoding='utf-8') as f:
            json.dump(self.index, f, ensure_ascii=False, indent=2)


def build_search_index():
    """构建搜索索引并保存"""
    print("=" * 50)
    print("构建搜索索引")
    print("=" * 50)
    
    # 创建索引器
    indexer = SimpleContentIndexer(summaries_dir="docs/summaries")
    
    # 构建索引
    index = indexer.build_index(force_rebuild=True)
    
    print(f"\n索引构建完成:")
    print(f"  - 文档数量: {len(index)}")
    
    if index:
        # 统计信息
        content_types = {}
        for doc in index:
            ct = doc.get("content_type", "未知")
            content_types[ct] = content_types.get(ct, 0) + 1
        
        print(f"  - 内容类型分布:")
        for ct, count in sorted(content_types.items(), key=lambda x: -x[1]):
            print(f"    - {ct}: {count} 条")
        
        # 日期范围
        dates = [datetime.fromisoformat(doc["created_at"]) for doc in index]
        print(f"  - 时间范围: {min(dates).strftime('%Y-%m-%d')} ~ {max(dates).strftime('%Y-%m-%d')}")
        
        # 索引文件位置
        index_path = Path("docs/search_index.json")
        print(f"  - 索引文件: {index_path.absolute()}")
        print(f"  - 文件大小: {index_path.stat().st_size / 1024:.1f} KB")
    
    print("\n[OK] 索引构建成功")
    return len(index)


def test_search():
    """测试搜索功能"""
    print("\n" + "=" * 50)
    print("测试搜索功能")
    print("=" * 50)
    
    # 加载索引
    with open("docs/search_index.json", 'r', encoding='utf-8') as f:
        index = json.load(f)
    
    test_queries = ["比特币", "NVDA", "期权"]
    
    for query in test_queries:
        query_lower = query.lower()
        results = []
        for doc in index:
            text = (doc["title"] + " " + doc["content"]).lower()
            if query_lower in text:
                score = text.count(query_lower)
                if query_lower in doc["title"].lower():
                    score += 10
                results.append({**doc, "score": score})
        
        results.sort(key=lambda x: x["score"], reverse=True)
        total = len(results)
        
        print(f"\n  查询 '{query}':")
        print(f"    找到 {total} 条结果")
        for r in results[:2]:
            print(f"    - {r['title'][:50]}... (相关度: {r['score']})")
    
    print("\n[OK] 搜索测试通过")


if __name__ == "__main__":
    try:
        count = build_search_index()
        test_search()
        
        print("\n" + "=" * 50)
        print("所有任务完成")
        print("=" * 50)
        
        sys.exit(0)
    except Exception as e:
        print(f"\n[ERR] 错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
