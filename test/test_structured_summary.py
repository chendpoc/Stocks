import json
import hashlib
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock, patch


class StructuredSummaryTests(unittest.TestCase):
    def _image_post(self):
        return {
            "id": "post_img_1",
            "createdAt": "1779272408002",
            "content": "",
            "feedId": "chat_feed_test",
            "isPosterAdmin": True,
            "userId": "user_admin",
            "attachments": [
                {
                    "__typename": "ImageAttachment",
                    "id": "file_img_1",
                    "filename": "image.png",
                    "contentType": "image/png",
                    "byteSizeV2": "22068",
                    "width": 531,
                    "height": 371,
                    "blurhash": "LLRMi7",
                    "aspectRatio": 1.431,
                    "source": {"url": "https://img-v2-prod.whop.com/example/image.png?X-Amz-Expires=86400"},
                }
            ],
        }

    def _link_embed_post(self):
        return {
            "id": "post_link_1",
            "createdAt": "1779272508002",
            "content": "https://example.com/market-note",
            "feedId": "chat_feed_test",
            "isPosterAdmin": False,
            "userId": "user_member",
            "attachments": [],
            "linkEmbeds": [
                {
                    "title": "Market Note",
                    "description": "Daily chart",
                    "url": "https://example.com/market-note",
                    "image": "https://cdn.example.com/cards/market-note.jpg?width=1200",
                    "favicon": "https://example.com/favicon.ico",
                }
            ],
        }

    def test_extract_image_attachments_from_whop_posts(self):
        from utils.media_utils import extract_image_attachments

        records = extract_image_attachments([self._image_post()], {"user_admin": "xiaozhaolucky"})

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["id"], "file_img_1")
        self.assertEqual(record["post_id"], "post_img_1")
        self.assertEqual(record["username"], "xiaozhaolucky")
        self.assertTrue(record["is_admin"])
        self.assertEqual(record["content_type"], "image/png")
        self.assertEqual(record["width"], 531)
        self.assertEqual(record["height"], 371)
        self.assertEqual(record["original_url"], "https://img-v2-prod.whop.com/example/image.png?X-Amz-Expires=86400")

    def test_extract_image_attachments_includes_link_embed_images(self):
        from utils.media_utils import extract_image_attachments

        records = extract_image_attachments([self._link_embed_post()], {"user_member": "alice"})

        self.assertEqual(len(records), 1)
        record = records[0]
        self.assertEqual(record["id"], "link_embed_1")
        self.assertEqual(record["source_type"], "link_embed")
        self.assertEqual(record["post_id"], "post_link_1")
        self.assertEqual(record["username"], "alice")
        self.assertFalse(record["is_admin"])
        self.assertEqual(record["filename"], "market-note.jpg")
        self.assertEqual(record["content_type"], "image/link-preview")
        self.assertEqual(record["original_url"], "https://cdn.example.com/cards/market-note.jpg?width=1200")
        self.assertEqual(record["link_url"], "https://example.com/market-note")
        self.assertEqual(record["link_title"], "Market Note")

    def test_download_image_assets_mirrors_to_docs_assets(self):
        from utils.media_utils import download_image_assets, extract_image_attachments

        class FakeResponse:
            status_code = 200
            content = b"fake image bytes"

            def raise_for_status(self):
                return None

        with tempfile.TemporaryDirectory() as tmp:
            records = extract_image_attachments([self._image_post()], {"user_admin": "xiaozhaolucky"})
            mirrored = download_image_assets(records, "2026-05-20", docs_root=tmp, fetcher=lambda url: FakeResponse())

            self.assertEqual(mirrored[0]["download_status"], "downloaded")
            self.assertEqual(mirrored[0]["markdown_path"], "/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png")
            self.assertTrue((Path(tmp) / "assets" / "chat-images" / "2026-05-20" / "1779272408002-post_img_1-file_img_1.png").is_file())

    def test_download_image_assets_mirrors_link_embed_images(self):
        from utils.media_utils import download_image_assets, extract_image_attachments

        class FakeResponse:
            status_code = 200
            content = b"fake link preview bytes"

            def raise_for_status(self):
                return None

        with tempfile.TemporaryDirectory() as tmp:
            records = extract_image_attachments([self._link_embed_post()], {"user_member": "alice"})
            mirrored = download_image_assets(records, "2026-05-20", docs_root=tmp, fetcher=lambda url: FakeResponse())

            self.assertEqual(mirrored[0]["download_status"], "downloaded")
            self.assertEqual(mirrored[0]["source_type"], "link_embed")
            self.assertEqual(mirrored[0]["markdown_path"], "/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg")
            self.assertTrue((Path(tmp) / "assets" / "chat-images" / "2026-05-20" / "1779272508002-post_link_1-link_embed_1.jpg").is_file())

    def test_archive_raw_messages_writes_daily_snapshot_manifest(self):
        from utils.structured_summary import archive_raw_messages

        with tempfile.TemporaryDirectory() as tmp:
            posts = [
                {
                    "id": "post_1",
                    "createdAt": "1779272408002",
                    "content": "hello",
                    "feedId": "chat_feed_test",
                },
                {
                    "id": "post_2",
                    "createdAt": "1779272508002",
                    "content": "world",
                    "feedId": "chat_feed_test",
                },
            ]
            users = {"user_1": "alice"}

            result = archive_raw_messages(
                posts,
                users,
                output_root=tmp,
                generated_at=datetime(2026, 5, 20, 0, 30, tzinfo=timezone.utc),
                from_cache=True,
                images=[
                    {
                        "id": "file_img_1",
                        "post_id": "post_1",
                        "download_status": "downloaded",
                        "local_path": "docs/assets/chat-images/2026-05-20/example.png",
                    },
                    {
                        "id": "file_img_2",
                        "post_id": "post_2",
                        "download_status": "failed",
                        "error": "HTTP 403",
                    },
                ],
            )

            day_dir = Path(tmp) / "2026-05-20"
            self.assertEqual(result["day_dir"], str(day_dir))
            self.assertTrue((day_dir / "posts.jsonl").is_file())
            self.assertTrue((day_dir / "users.json").is_file())
            manifest = json.loads((day_dir / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["post_count"], 2)
            self.assertEqual(manifest["user_count"], 1)
            self.assertEqual(manifest["feed_id"], "chat_feed_test")
            self.assertTrue(manifest["from_cache"])
            self.assertEqual(manifest["image_count"], 2)
            self.assertEqual(manifest["downloaded_image_count"], 1)
            self.assertEqual(manifest["failed_image_count"], 1)
            images = json.loads((day_dir / "images.json").read_text(encoding="utf-8"))
            self.assertEqual(len(images), 2)

    def test_normalize_summary_payload_fills_missing_admin_statement(self):
        from utils.structured_summary import normalize_summary_payload

        payload = {
            "overview": ["市场震荡"],
            "key_symbols": [{"symbol": "NVDA", "summary": "等待财报"}],
            "admin_core": [],
        }

        normalized = normalize_summary_payload(payload)

        self.assertEqual(normalized["schema_version"], "1.0")
        self.assertIn("未发现管理员发言", normalized["admin_core"])
        self.assertEqual(normalized["key_symbols"][0]["source"], "user")
        self.assertIn("core", normalized["image_digest"])
        self.assertEqual(normalized["image_digest"]["core"], ["市场震荡"])

    def test_normalize_summary_payload_groups_admin_and_user_content(self):
        from utils.structured_summary import normalize_summary_payload

        normalized = normalize_summary_payload(
            {
                "overview": ["市场震荡，先看管理员框架。"],
                "admin_quotes": ["xiaozhaolucky 说: 不赌财报，等缺口确认。"],
                "admin_deep_reading": ["管理员重点不是预测方向，而是用缺口和仓位纪律过滤噪音。"],
                "user_core": ["用户主要在讨论是否追高。"],
                "key_symbols": [
                    {"symbol": "NVDA", "summary": "财报前等待 189 缺口。", "source": "admin"},
                    {"symbol": "TSLA", "summary": "用户关注 385 支撑。", "source": "user"},
                ],
            }
        )

        self.assertEqual(normalized["admin_quotes"], ["xiaozhaolucky 说: 不赌财报，等缺口确认。"])
        self.assertEqual(normalized["admin_deep_reading"], ["管理员重点不是预测方向，而是用缺口和仓位纪律过滤噪音。"])
        self.assertEqual(normalized["user_core"], ["用户主要在讨论是否追高。"])
        self.assertEqual([item["symbol"] for item in normalized["admin_symbols"]], ["NVDA"])
        self.assertEqual([item["symbol"] for item in normalized["user_symbols"]], ["TSLA"])

    def test_normalize_summary_payload_preserves_professional_brief(self):
        from utils.structured_summary import normalize_summary_payload

        normalized = normalize_summary_payload(
            {
                "overview": ["市场震荡，先看管理员框架。"],
                "admin_core": ["等待缺口确认。"],
                "professional_brief": {
                    "market_regime": "财报窗口叠加节前流动性收缩，高波动但不适合追高。",
                    "core_theory": "核心理论是用缺口和时间窗口过滤噪音。",
                    "evidence_chain": ["英伟达财报前 AI 线分歧扩大。"],
                    "trade_framework": {
                        "entry_conditions": ["缺口回补且盘中缩量企稳。"],
                        "holding_logic": ["小仓位做T，等待节前资金回补。"],
                        "exit_conditions": ["反弹到节前高点或量能衰竭。"],
                        "position_control": ["单标的不超过 0.3 成。"],
                        "risk_control": ["不赌财报，不追盘前急拉。"],
                    },
                    "watch_points": ["10:30 到 11:30 的盘中承接。"],
                    "invalidation": ["关键缺口跌破后不能快速收回。"],
                },
            }
        )

        brief = normalized["professional_brief"]
        self.assertEqual(brief["market_regime"], ["财报窗口叠加节前流动性收缩，高波动但不适合追高。"])
        self.assertEqual(brief["core_theory"], ["核心理论是用缺口和时间窗口过滤噪音。"])
        self.assertEqual(brief["trade_framework"]["entry_conditions"], ["缺口回补且盘中缩量企稳。"])
        self.assertEqual(brief["trade_framework"]["position_control"], ["单标的不超过 0.3 成。"])
        self.assertEqual(brief["invalidation"], ["关键缺口跌破后不能快速收回。"])

    def test_normalize_summary_payload_preserves_arbitrage_opportunities(self):
        from utils.structured_summary import normalize_summary_payload

        normalized = normalize_summary_payload(
            {
                "overview": ["等待缺口确认。"],
                "admin_core": ["赵哥强调不追高，只做确认后的节奏机会。"],
                "arbitrage_opportunities": [
                    {
                        "title": "AI 光模块财报错位价差",
                        "symbols": ["LITE", "COHR"],
                        "setup": "管理员提到 AI 线先杀估值，群聊同时讨论光模块补涨。",
                        "trigger": "NVDA 财报后 AI 线不再扩散下跌，LITE 先回补缺口。",
                        "data_points": ["LITE 缺口", "NVDA 财报窗口", "盘前急拉不追"],
                        "action_bias": "只观察低吸和价差收敛，不追盘前急拉。",
                        "risk": "财报后资金继续撤离 AI 线。",
                        "confidence": "medium",
                        "source_basis": "基于 xiaozhaolucky 缺口纪律和群聊 AI 线索。",
                    }
                ],
            }
        )

        opportunity = normalized["arbitrage_opportunities"][0]
        self.assertEqual(opportunity["title"], "AI 光模块财报错位价差")
        self.assertEqual(opportunity["symbols"], ["LITE", "COHR"])
        self.assertEqual(opportunity["setup"], "管理员提到 AI 线先杀估值，群聊同时讨论光模块补涨。")
        self.assertEqual(opportunity["trigger"], "NVDA 财报后 AI 线不再扩散下跌，LITE 先回补缺口。")
        self.assertEqual(opportunity["data_points"], ["LITE 缺口", "NVDA 财报窗口", "盘前急拉不追"])
        self.assertEqual(opportunity["action_bias"], "只观察低吸和价差收敛，不追盘前急拉。")
        self.assertEqual(opportunity["risk"], "财报后资金继续撤离 AI 线。")
        self.assertEqual(opportunity["confidence"], "medium")
        self.assertEqual(opportunity["source_basis"], "基于 xiaozhaolucky 缺口纪律和群聊 AI 线索。")

    def test_normalize_summary_payload_ignores_empty_arbitrage_opportunities(self):
        from utils.structured_summary import normalize_summary_payload

        normalized = normalize_summary_payload(
            {
                "overview": ["等待缺口确认。"],
                "admin_core": ["控制仓位。"],
                "arbitrage_opportunities": [{}, None, ""],
            }
        )

        self.assertEqual(normalized["arbitrage_opportunities"], [])

    def test_normalize_summary_payload_fallback_event_summary_is_beginner_friendly(self):
        from utils.structured_summary import normalize_summary_payload

        normalized = normalize_summary_payload(
            {
                "overview": ["SPX从7500缓跌至7200补缺口。"],
                "admin_deep_reading": [
                    "管理员构建了以SPX 7500→7200为基准的9天缓跌模型，每日目标跌幅-0.44%，通过幅度和时间判断人为干预（如盘前反弹），从而实现机械化套利。"
                ],
                "market_context": ["SPX从7500开始缓跌至7200，当前已进入第2天。"],
                "risks": ["急跌风险：夜盘和盘前可能突发跳水。"],
            }
        )

        self.assertEqual(len(normalized["event_summary"]), 3)
        self.assertIn("赵哥的框架：", normalized["event_summary"][0])
        self.assertIn("SPX（标普500指数）", normalized["event_summary"][0])
        self.assertIn("缓跌模型（", normalized["event_summary"][0])
        self.assertIn("机械化套利（", normalized["event_summary"][0])
        self.assertIn("市场发生的事：", normalized["event_summary"][1])
        self.assertIn("操作含义：", normalized["event_summary"][2])
        self.assertIn("夜盘（", normalized["event_summary"][2])
        self.assertIn("盘前（", normalized["event_summary"][2])

    def test_build_structured_summary_prompt_requires_beginner_friendly_event_summary(self):
        from utils.structured_summary import build_structured_summary_prompt

        prompt = build_structured_summary_prompt("2026-05-20 08:30:08 [管理员]xiaozhaolucky 说: SPX缓跌")

        self.assertIn("小白友好", prompt)
        self.assertIn("专业术语", prompt)
        self.assertIn("SPX=标普500指数", prompt)
        self.assertIn("专业报告", prompt)
        self.assertIn("professional_brief", prompt)
        self.assertIn("market_regime", prompt)
        self.assertIn("core_theory", prompt)
        self.assertIn("trade_framework", prompt)
        self.assertIn("arbitrage_opportunities", prompt)
        self.assertIn("机会观察/推测，不是确定性交易建议", prompt)
        self.assertIn("必须基于 xiaozhaolucky / 核心理论和群聊内容线索", prompt)
        self.assertIn("title", prompt)
        self.assertIn("source_basis", prompt)
        self.assertIn("不要把套利机会写成确定性买卖指令", prompt)

    def test_render_summary_markdown_uses_structured_sections(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload(
            {
                "overview": ["资金高低切换，指数震荡。"],
                "event_summary": [
                    "核心理论是先识别被动减仓节奏，再用仓位和缺口纪律等待确定性。",
                    "市场实际表现为高位回落和缺口回补，短线只适合小仓位做T。",
                    "普通用户讨论提供情绪和个股线索，但不改变管理员框架。",
                ],
                "market_context": ["美股盘中波动加大。"],
                "admin_quotes": ["xiaozhaolucky 说: 每天只做一次日内波段。"],
                "admin_deep_reading": ["管理员在强调交易频率控制，核心不是多做，而是等待确定性。"],
                "user_core": ["用户主要关注是否追高。"],
                "key_symbols": [
                    {
                        "symbol": "TSLA",
                        "name": "特斯拉",
                        "summary": "观察 385 支撑。",
                        "source": "admin",
                    }
                ],
                "options": ["不赌财报。"],
                "events": ["英伟达财报临近。"],
                "admin_core": ["每天只做一次日内波段。"],
                "disagreements": ["部分用户想追高，管理员建议等回调。"],
                "risks": ["仓位不超过三成。"],
            }
        )

        markdown = render_summary_markdown(
            summary,
            chat_text="2026-05-20 08:30:08 [管理员]xiaozhaolucky 说: 每天只做一次日内波段。\n"
            "2026-05-20 08:31:48 alice 说: 我想追高 TSLA\n"
            "2026-05-20 08:32:18 bob (回复xiaozhaolucky之前的发言: 每天只做一次日内波段。)说: 收到赵哥",
        )

        self.assertLess(markdown.index("## 三句话总结"), markdown.index("## 核心结论"))
        self.assertIn("- 核心理论是先识别被动减仓节奏", markdown)
        self.assertIn("## 核心结论", markdown)
        self.assertIn("## xiaozhaolucky", markdown)
        self.assertIn("### 深度解读", markdown)
        self.assertIn("- 管理员在强调交易频率控制", markdown)
        self.assertIn("### 管理员重点标的", markdown)
        self.assertIn("- **TSLA（特斯拉）**: 观察 385 支撑。", markdown)
        self.assertIn("<summary>查看 xiaozhaolucky 原始发言", markdown)
        self.assertIn("2026-05-20 08:30:08 [管理员]xiaozhaolucky 说: 每天只做一次日内波段。", markdown)
        self.assertNotIn("原话：2026-05-20", markdown)
        self.assertNotIn("2026-05-20 08:31:48 alice 说: 我想追高 TSLA\n```\n\n</details>\n\n## 其他用户", markdown)
        admin_detail = markdown.split("<summary>查看 xiaozhaolucky 原始发言", 1)[1].split("</details>", 1)[0]
        self.assertNotIn("2026-05-20 08:32:18 bob", admin_detail)
        self.assertNotIn("来源：admin", markdown)
        self.assertNotIn("来源：user", markdown)
        self.assertIn("## 其他用户", markdown)
        self.assertIn("### 用户观点提炼", markdown)
        self.assertIn("- 用户主要关注是否追高。", markdown)

    def test_render_summary_markdown_includes_professional_report_sections(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload(
            {
                "overview": ["不追高，等待缺口确认。"],
                "event_summary": [
                    "赵哥的理论是用缺口和节奏判断资金意图。",
                    "市场在财报窗口里高波动。",
                    "操作上以小仓位等待确认。",
                ],
                "admin_core": ["等待缺口确认。"],
                "admin_deep_reading": ["管理员强调用时间窗口和价格缺口过滤噪音。"],
                "professional_brief": {
                    "market_regime": ["财报窗口叠加节前流动性收缩，盘中容易急拉急跌。"],
                    "core_theory": ["核心理论是等待缺口回补后再判断资金是否重新承接。"],
                    "evidence_chain": ["AI 线在财报前已经出现分歧，说明资金不愿继续追高。"],
                    "trade_framework": {
                        "entry_conditions": ["缺口回补，且 10:30-11:30 出现承接。"],
                        "holding_logic": ["小仓位做T，等待节前资金回补。"],
                        "exit_conditions": ["到达节前反弹高点或量能衰竭。"],
                        "position_control": ["单标的不超过 0.3 成。"],
                        "risk_control": ["不赌财报，不追盘前急拉。"],
                    },
                    "watch_points": ["10:30-11:30 是否有真实买盘承接。"],
                    "invalidation": ["关键缺口跌破后不能快速收回。"],
                },
                "admin_symbols": [
                    {
                        "symbol": "LITE",
                        "name": "Lumentum",
                        "thesis": "AI 光通信弹性标的。",
                        "trigger": "缺口回补后放量企稳。",
                        "action": "等待低吸，不追高。",
                        "risk": "财报窗口波动放大。",
                        "evidence": "来自管理员对 AI 线节奏的判断。",
                    }
                ],
            }
        )

        markdown = render_summary_markdown(summary, include_audit_records=False)

        self.assertIn("## 市场状态判断", markdown)
        self.assertIn("### 核心理论", markdown)
        self.assertIn("### 交易框架拆解", markdown)
        self.assertIn("**入场条件**", markdown)
        self.assertIn("**失效条件**", markdown)
        self.assertIn("### 管理员重点标的", markdown)
        self.assertIn("| 标的 | 逻辑 | 触发条件 | 动作 | 风险 |", markdown)
        self.assertIn("| LITE（Lumentum） | AI 光通信弹性标的。 | 缺口回补后放量企稳。 | 等待低吸，不追高。 | 财报窗口波动放大。 |", markdown)
        self.assertLess(markdown.index("## 市场状态判断"), markdown.index("## xiaozhaolucky"))

    def test_render_summary_markdown_includes_arbitrage_opportunities_after_admin_symbols(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload(
            {
                "overview": ["不追高，等待缺口确认。"],
                "admin_core": ["只在缺口回补和仓位纪律内观察。"],
                "admin_deep_reading": ["赵哥框架强调节奏、缺口和风控，不是预测确定方向。"],
                "admin_symbols": [
                    {"symbol": "NVDA", "summary": "财报后观察 AI 线是否扩散。"},
                ],
                "user_core": ["用户讨论 LITE 和 COHR 的补涨可能。"],
                "arbitrage_opportunities": [
                    {
                        "title": "AI 光模块补涨价差",
                        "symbols": ["LITE", "COHR"],
                        "setup": "AI 主线情绪退潮后，群聊提到光模块分支仍有补涨讨论。",
                        "trigger": "NVDA 财报后 AI 线止跌，LITE/COHR 出现放量承接。",
                        "data_points": ["NVDA 财报", "LITE 缺口", "COHR 补涨讨论"],
                        "action_bias": "观察价差收敛，只考虑小仓位试错。",
                        "risk": "AI 主线继续杀估值会让补涨逻辑失效。",
                        "confidence": "medium",
                        "source_basis": "赵哥缺口纪律 + 群聊光模块线索。",
                    }
                ],
            }
        )

        markdown = render_summary_markdown(summary, include_audit_records=False)

        self.assertIn("## 套利机会推测", markdown)
        self.assertIn("免责声明：以下内容是基于聊天信息和管理员框架的机会观察，不是确定性交易建议。", markdown)
        self.assertIn("### AI 光模块补涨价差", markdown)
        self.assertIn("- **标的**：LITE, COHR", markdown)
        self.assertIn("- **触发条件**：NVDA 财报后 AI 线止跌，LITE/COHR 出现放量承接。", markdown)
        self.assertIn("- **数据点**：NVDA 财报；LITE 缺口；COHR 补涨讨论", markdown)
        self.assertIn("- **动作倾向**：观察价差收敛，只考虑小仓位试错。", markdown)
        self.assertIn("- **置信度**：medium", markdown)
        self.assertLess(markdown.index("### 管理员重点标的"), markdown.index("## 套利机会推测"))
        self.assertLess(markdown.index("## 套利机会推测"), markdown.index("## 其他用户"))

    def test_render_summary_markdown_appends_collapsed_image_gallery(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload({"overview": ["市场震荡"], "admin_core": ["管理员提示控制仓位"]})
        markdown = render_summary_markdown(
            summary,
            images=[
                {
                    "id": "file_img_1",
                    "post_id": "post_img_1",
                    "created_at_text": "2026-05-20 08:30:08 CST",
                    "username": "xiaozhaolucky",
                    "is_admin": True,
                    "filename": "image.png",
                    "content_type": "image/png",
                    "width": 531,
                    "height": 371,
                    "markdown_path": "/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png",
                    "original_url": "https://img-v2-prod.whop.com/example/image.png",
                    "download_status": "downloaded",
                }
            ],
        )

        self.assertIn("## 群聊图片记录", markdown)
        self.assertIn("<details>", markdown)
        self.assertIn("<summary>共 1 张图片</summary>", markdown)
        self.assertIn("管理员", markdown)
        self.assertIn(
            '<img src="/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png" '
            'alt="image.png" loading="lazy"',
            markdown,
        )
        self.assertIn("[本地镜像](/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png)", markdown)
        self.assertIn("[原始链接](https://img-v2-prod.whop.com/example/image.png)", markdown)

    def test_render_summary_markdown_hides_non_admin_images(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload({"overview": ["市场震荡"], "admin_core": ["管理员提示控制仓位"]})
        markdown = render_summary_markdown(
            summary,
            images=[
                {
                    "id": "link_embed_1",
                    "source_type": "link_embed",
                    "post_id": "post_link_1",
                    "created_at_text": "2026-05-20 08:31:48 CST",
                    "username": "alice",
                    "is_admin": False,
                    "filename": "market-note.jpg",
                    "content_type": "image/link-preview",
                    "markdown_path": "/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg",
                    "original_url": "https://cdn.example.com/cards/market-note.jpg",
                    "link_url": "https://example.com/market-note",
                    "link_title": "Market Note",
                    "download_status": "downloaded",
                }
            ],
        )

        self.assertNotIn("## 群聊图片记录", markdown)
        self.assertNotIn("market-note.jpg", markdown)
        self.assertNotIn("/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg", markdown)

    def test_render_summary_markdown_labels_admin_link_embed_images(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload({"overview": ["市场震荡"], "admin_core": ["管理员提示控制仓位"]})
        markdown = render_summary_markdown(
            summary,
            images=[
                {
                    "id": "link_embed_1",
                    "source_type": "link_embed",
                    "post_id": "post_link_1",
                    "created_at_text": "2026-05-20 08:31:48 CST",
                    "username": "xiaozhaolucky",
                    "is_admin": True,
                    "filename": "market-note.jpg",
                    "content_type": "image/link-preview",
                    "markdown_path": "/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg",
                    "original_url": "https://cdn.example.com/cards/market-note.jpg",
                    "link_url": "https://example.com/market-note",
                    "link_title": "Market Note",
                    "download_status": "downloaded",
                }
            ],
        )

        self.assertIn("- 来源：链接预览图", markdown)
        self.assertIn("- 链接标题：Market Note", markdown)
        self.assertIn("- [来源链接](https://example.com/market-note)", markdown)
        self.assertIn(
            '<img src="/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg" '
            'alt="market-note.jpg" loading="lazy"',
            markdown,
        )

    def test_render_summary_markdown_formats_dict_items_without_python_literal(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload(
            {
                "overview": ["市场震荡"],
                "admin_core": ["管理员提示控制仓位"],
                "disagreements": [
                    {
                        "user": "部分用户",
                        "point": "盘前上涨担心踏空",
                        "resolution": "管理员坚持被动减持未结束",
                    }
                ],
            }
        )
        markdown = render_summary_markdown(summary)

        self.assertIn("user：部分用户；point：盘前上涨担心踏空；resolution：管理员坚持被动减持未结束", markdown)
        self.assertNotIn("{'user'", markdown)

    def test_history_list_to_text_includes_image_placeholders(self):
        from utils.parse_utils import history_list_to_text

        text = history_list_to_text(
            [self._image_post()],
            {"user_admin": "xiaozhaolucky"},
            images=[
                {
                    "asset_index": "image_001",
                    "post_id": "post_img_1",
                    "content_type": "image/png",
                    "width": 531,
                    "height": 371,
                    "markdown_path": "/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png",
                }
            ],
        )

        self.assertIn("[图片 image_001: image/png 531x371 local=/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png]", text)

    def test_history_list_to_text_includes_link_embed_context(self):
        from utils.parse_utils import history_list_to_text

        text = history_list_to_text(
            [self._link_embed_post()],
            {"user_member": "alice"},
            images=[
                {
                    "asset_index": "image_001",
                    "source_type": "link_embed",
                    "post_id": "post_link_1",
                    "content_type": "image/link-preview",
                    "original_url": "https://cdn.example.com/cards/market-note.jpg?width=1200",
                    "markdown_path": "/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg",
                }
            ],
        )

        self.assertIn(
            "[链接预览: Market Note url=https://example.com/market-note desc=Daily chart "
            "image=/assets/chat-images/2026-05-20/1779272508002-post_link_1-link_embed_1.jpg]",
            text,
        )

    def test_render_summary_markdown_appends_chat_content_record(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload({"overview": ["市场震荡"], "admin_core": ["管理员提示控制仓位"]})
        markdown = render_summary_markdown(
            summary,
            chat_text="2026-05-20 08:30:08 [管理员]xiaozhaolucky 说: 控制仓位\n"
            "2026-05-20 08:31:48 alice 说: https://example.com/market-note",
        )

        self.assertIn("## 群聊内容记录", markdown)
        self.assertIn("<summary>共 2 条群聊记录</summary>", markdown)
        self.assertIn("```text", markdown)
        self.assertIn("xiaozhaolucky 说: 控制仓位", markdown)
        self.assertIn("alice 说: https://example.com/market-note", markdown)

    def test_render_summary_markdown_hides_image_placeholders_in_chat_record(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload({"overview": ["市场震荡"], "admin_core": ["管理员提示控制仓位"]})
        markdown = render_summary_markdown(
            summary,
            chat_text="2026-05-20 08:31:48 alice 说: 看这个图 [图片 image_001: image/png 531x371 local=/assets/chat-images/2026-05-20/user.png]\n"
            "2026-05-20 08:32:18 bob 说: 链接 [链接预览: Market Note url=https://example.com desc=Daily chart image=/assets/chat-images/2026-05-20/link.jpg]",
        )

        self.assertIn("alice 说: 看这个图", markdown)
        self.assertIn("[链接预览: Market Note url=https://example.com desc=Daily chart]", markdown)
        self.assertNotIn("image_001", markdown)
        self.assertNotIn("/assets/chat-images/2026-05-20/user.png", markdown)
        self.assertNotIn("/assets/chat-images/2026-05-20/link.jpg", markdown)

    def test_render_summary_markdown_public_mode_excludes_audit_records(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_markdown

        summary = normalize_summary_payload(
            {
                "overview": ["PUBLIC_SUMMARY"],
                "admin_core": ["ADMIN_SUMMARY"],
                "admin_quotes": ["RAW_ADMIN_QUOTE_SHOULD_NOT_PUBLISH"],
                "user_core": ["USER_SUMMARY_SHOULD_STAY"],
            }
        )
        markdown = render_summary_markdown(
            summary,
            images=[
                {
                    "id": "file_public",
                    "post_id": "post_public",
                    "filename": "image.png",
                    "username": "xiaozhaolucky",
                    "is_admin": True,
                    "markdown_path": "/assets/chat-images/2026-05-20/image.png",
                    "local_path": "docs/assets/chat-images/2026-05-20/image.png",
                    "original_url": "https://img-v2-prod.whop.com/example/image.png",
                    "download_status": "downloaded",
                }
            ],
            chat_text="2026-05-20 08:30:00 alice 说: CHAT_RECORD_SHOULD_NOT_PUBLISH",
            include_audit_records=False,
        )

        self.assertIn("PUBLIC_SUMMARY", markdown)
        self.assertIn("USER_SUMMARY_SHOULD_STAY", markdown)
        self.assertNotIn("RAW_ADMIN_QUOTE_SHOULD_NOT_PUBLISH", markdown)
        self.assertNotIn("CHAT_RECORD_SHOULD_NOT_PUBLISH", markdown)
        self.assertNotIn("群聊图片记录", markdown)
        self.assertNotIn("群聊内容记录", markdown)
        self.assertNotIn("/assets/chat-images/2026-05-20/image.png", markdown)

    def test_render_summary_text_excludes_audit_records(self):
        from utils.structured_summary import normalize_summary_payload, render_summary_text

        summary = normalize_summary_payload(
            {
                "event_summary": ["EVENT_SEND"],
                "overview": ["OVERVIEW_SEND"],
                "admin_quotes": ["RAW_QUOTE_SHOULD_NOT_SEND"],
                "admin_deep_reading": ["ADMIN_INSIGHT_SEND"],
                "admin_symbols": [
                    {"symbol": "NVDA", "summary": "ADMIN_SYMBOL_SEND"},
                    {"symbol": "NVDA", "summary": "DUPLICATE_ADMIN_SYMBOL_SHOULD_NOT_SEND"},
                ],
                "user_core": ["USER_VIEW_SEND"],
                "user_symbols": [{"symbol": "TSLA", "summary": "USER_SYMBOL_SEND"}],
                "market_context": ["MARKET_SEND"],
                "options": ["OPTION_SEND"],
                "events": ["CATALYST_SEND"],
                "risks": ["RISK_SEND"],
            }
        )

        text = render_summary_text(
            summary,
            chat_text="CHAT_RECORD_SHOULD_NOT_SEND",
            images=[{"filename": "IMAGE_RECORD_SHOULD_NOT_SEND"}],
        )

        self.assertIn("EVENT_SEND", text)
        self.assertIn("ADMIN_INSIGHT_SEND", text)
        self.assertIn("ADMIN_SYMBOL_SEND", text)
        self.assertNotIn("DUPLICATE_ADMIN_SYMBOL_SHOULD_NOT_SEND", text)
        self.assertIn("USER_VIEW_SEND", text)
        self.assertIn("USER_SYMBOL_SEND", text)
        self.assertIn("MARKET_SEND", text)
        self.assertIn("OPTION_SEND", text)
        self.assertIn("CATALYST_SEND", text)
        self.assertIn("RISK_SEND", text)
        self.assertNotIn("RAW_QUOTE_SHOULD_NOT_SEND", text)
        self.assertNotIn("CHAT_RECORD_SHOULD_NOT_SEND", text)
        self.assertNotIn("IMAGE_RECORD_SHOULD_NOT_SEND", text)
        self.assertNotIn("\u539f\u59cb\u53d1\u8a00\u8bb0\u5f55", text)
        self.assertNotIn("\u7fa4\u804a\u5185\u5bb9\u8bb0\u5f55", text)
        self.assertNotIn("\u7fa4\u804a\u56fe\u7247\u8bb0\u5f55", text)

    def test_save_structured_summary_returns_chat_image_paths_for_publish(self):
        from utils.structured_summary import save_structured_summary

        with tempfile.TemporaryDirectory() as tmp:
            result = save_structured_summary(
                summary={"overview": ["市场震荡"], "admin_core": ["管理员提示控制仓位"]},
                description="测试",
                model="test-model",
                title="每日总结",
                output_dir=tmp,
                generated_at=datetime(2026, 5, 20, 0, 30, tzinfo=timezone.utc),
                images=[
                    {
                        "id": "file_img_1",
                        "post_id": "post_img_1",
                        "filename": "image.png",
                        "markdown_path": "/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png",
                        "local_path": "docs/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png",
                        "original_url": "https://img-v2-prod.whop.com/example/image.png",
                        "download_status": "downloaded",
                    }
                ],
            )

        self.assertEqual(result["chat_image_dir"], "docs/assets/chat-images/2026-05-20")
        self.assertEqual(result["chat_image_paths"], ["docs/assets/chat-images/2026-05-20/1779272408002-post_img_1-file_img_1.png"])

    def test_save_structured_summary_overwrites_daily_archive_markdown(self):
        from utils.structured_summary import save_structured_summary

        with tempfile.TemporaryDirectory() as tmp:
            first = save_structured_summary(
                summary={"overview": ["FIRST_DAILY_SUMMARY"], "admin_core": ["admin"]},
                description="daily",
                model="test-model",
                title="\u6bcf\u65e5\u603b\u7ed3",
                output_dir=tmp,
                generated_at=datetime(2026, 5, 20, 0, 30, tzinfo=timezone.utc),
            )
            second = save_structured_summary(
                summary={"overview": ["SECOND_DAILY_SUMMARY"], "admin_core": ["admin"]},
                description="daily",
                model="test-model",
                title="\u6bcf\u65e5\u603b\u7ed3",
                output_dir=tmp,
                generated_at=datetime(2026, 5, 20, 8, 30, tzinfo=timezone.utc),
            )

            archive_path = Path(second["archive_path"])
            content = archive_path.read_text(encoding="utf-8")

        self.assertEqual(first["archive_path"], second["archive_path"])
        self.assertIn("/summaries/2026-05/", second["archive_path"])
        self.assertTrue(second["archive_path"].endswith("2026-05-20-\u6bcf\u65e5\u603b\u7ed3.md"))
        self.assertIn("SECOND_DAILY_SUMMARY", content)
        self.assertNotIn("FIRST_DAILY_SUMMARY", content)

    def test_save_structured_summary_writes_public_daily_archive_and_local_audit_archive(self):
        from utils.structured_summary import save_structured_summary

        with tempfile.TemporaryDirectory() as tmp:
            result = save_structured_summary(
                summary={"overview": ["PUBLIC_DAILY_SUMMARY"], "admin_core": ["admin"]},
                description="daily",
                model="test-model",
                title="\u6bcf\u65e5\u603b\u7ed3",
                output_dir=tmp,
                generated_at=datetime(2026, 5, 20, 8, 30, tzinfo=timezone.utc),
                chat_text="2026-05-20 09:00:00 xiaozhaolucky \u8bf4: PRIVATE_RAW_ADMIN_QUOTE",
                images=[
                    {
                        "id": "file_img_1",
                        "post_id": "post_img_1",
                        "filename": "image.png",
                        "markdown_path": "/assets/chat-images/2026-05-20/file_img_1.png",
                        "local_path": "docs/assets/chat-images/2026-05-20/file_img_1.png",
                        "original_url": "https://img-v2-prod.whop.com/private/image.png",
                        "download_status": "downloaded",
                        "is_admin": True,
                        "username": "xiaozhaolucky",
                    }
                ],
            )
            archive_content = Path(result["archive_path"]).read_text(encoding="utf-8")
            local_archive_path = Path(result["local_archive_path"])
            local_archive_content = local_archive_path.read_text(encoding="utf-8")

        self.assertIn("PUBLIC_DAILY_SUMMARY", archive_content)
        self.assertNotIn("PRIVATE_RAW_ADMIN_QUOTE", archive_content)
        self.assertNotIn("\u539f\u59cb\u53d1\u8a00\u8bb0\u5f55", archive_content)
        self.assertNotIn("\u7fa4\u804a\u56fe\u7247\u8bb0\u5f55", archive_content)
        self.assertNotIn("\u7fa4\u804a\u5185\u5bb9\u8bb0\u5f55", archive_content)
        self.assertNotIn("img-v2-prod.whop.com", archive_content)
        self.assertNotIn("/assets/chat-images/", archive_content)
        self.assertTrue(str(local_archive_path).replace("\\", "/").endswith("2026-05-20-\u6bcf\u65e5\u603b\u7ed3-local.md"))
        self.assertIn("PUBLIC_DAILY_SUMMARY", local_archive_content)
        self.assertIn("PRIVATE_RAW_ADMIN_QUOTE", local_archive_content)
        self.assertIn("\u539f\u59cb\u53d1\u8a00\u8bb0\u5f55", local_archive_content)
        self.assertIn("\u7fa4\u804a\u56fe\u7247\u8bb0\u5f55", local_archive_content)
        self.assertIn("\u7fa4\u804a\u5185\u5bb9\u8bb0\u5f55", local_archive_content)
        self.assertIn("/assets/chat-images/2026-05-20/file_img_1.png", local_archive_content)

    def test_save_structured_summary_updates_homepage_once_and_skips_identical_content(self):
        from utils.structured_summary import save_structured_summary

        with tempfile.TemporaryDirectory() as tmp:
            first = save_structured_summary(
                summary={"overview": ["LATEST_HOME_SUMMARY"], "admin_core": ["admin"]},
                description="daily",
                model="test-model",
                title="\u6bcf\u65e5\u603b\u7ed3",
                output_dir=tmp,
                generated_at=datetime(2026, 5, 20, 8, 30, tzinfo=timezone.utc),
            )
            index_path = Path(first["index_path"])
            homepage_content = index_path.read_text(encoding="utf-8")
            self.assertTrue(first["index_updated"])
            self.assertIn("LATEST_HOME_SUMMARY", homepage_content)
            self.assertNotIn("/summaries/", homepage_content)
            self.assertNotIn("finance-community-summary", homepage_content)
            self.assertNotIn("可以 star", homepage_content)
            self.assertNotIn("欢迎提 issue", homepage_content)

            old_mtime = 1_700_000_000
            os.utime(index_path, (old_mtime, old_mtime))
            second = save_structured_summary(
                summary={"overview": ["LATEST_HOME_SUMMARY"], "admin_core": ["admin"]},
                description="daily",
                model="test-model",
                title="\u6bcf\u65e5\u603b\u7ed3",
                output_dir=tmp,
                generated_at=datetime(2026, 5, 20, 8, 30, tzinfo=timezone.utc),
            )

            self.assertFalse(second["index_updated"])
            self.assertEqual(int(index_path.stat().st_mtime), old_mtime)

    def test_search_index_parses_new_archive_filename_format(self):
        from build_search_index import SimpleContentIndexer

        created_at, content_type = SimpleContentIndexer()._extract_metadata_from_filename(
            "2026-05-20_18-21-57-每日总结"
        )

        self.assertEqual(created_at.isoformat(), "2026-05-20T18:21:57")
        self.assertEqual(content_type, "每日总结")

    def test_search_index_parses_daily_archive_filename_format(self):
        from build_search_index import SimpleContentIndexer

        created_at, content_type = SimpleContentIndexer()._extract_metadata_from_filename(
            "2026-05-20-\u6bcf\u65e5\u603b\u7ed3"
        )

        self.assertEqual(created_at.isoformat(), "2026-05-20T00:00:00")
        self.assertEqual(content_type, "\u6bcf\u65e5\u603b\u7ed3")

    def test_search_index_recurses_monthly_summary_directories(self):
        from build_search_index import SimpleContentIndexer

        with tempfile.TemporaryDirectory() as tmp:
            summaries_dir = Path(tmp) / "summaries"
            monthly_dir = summaries_dir / "2026-05"
            monthly_dir.mkdir(parents=True)
            (monthly_dir / "2026-05-20-\u6bcf\u65e5\u603b\u7ed3.md").write_text(
                "# Daily\n\nNVDA daily content",
                encoding="utf-8",
            )
            indexer = SimpleContentIndexer(str(summaries_dir))
            indexer.index_cache_path = Path(tmp) / "search_index.json"
            index = indexer.build_index(force_rebuild=True)

        self.assertEqual(len(index), 1)
        self.assertEqual(index[0]["file_path"].replace("\\", "/").split("/summaries/", 1)[1], "2026-05/2026-05-20-\u6bcf\u65e5\u603b\u7ed3.md")
        self.assertEqual(index[0]["created_at"], "2026-05-20T00:00:00")
        self.assertTrue(index[0]["is_built_page"])
        self.assertEqual(index[0]["url"], "/summaries/2026-05/2026-05-20-\u6bcf\u65e5\u603b\u7ed3")

    def test_search_index_public_mode_indexes_only_latest_month_public_daily_files(self):
        from build_search_index import SimpleContentIndexer

        with tempfile.TemporaryDirectory() as tmp:
            summaries_dir = Path(tmp) / "summaries"
            latest_dir = summaries_dir / "2026-05"
            older_dir = summaries_dir / "2026-04"
            latest_dir.mkdir(parents=True)
            older_dir.mkdir(parents=True)
            (latest_dir / "2026-05-20-\u6bcf\u65e5\u603b\u7ed3.md").write_text(
                "# Public Daily\n\nPUBLIC_CURRENT_MONTH",
                encoding="utf-8",
            )
            (latest_dir / "2026-05-20-\u6bcf\u65e5\u603b\u7ed3-local.md").write_text(
                "# Local Daily\n\nPRIVATE_LOCAL_AUDIT",
                encoding="utf-8",
            )
            (latest_dir / "2026-05-20_18-21-57-\u6bcf\u65e5\u603b\u7ed3.md").write_text(
                "# Legacy Timed\n\nPRIVATE_TIMED_HISTORY",
                encoding="utf-8",
            )
            (older_dir / "2026-04-20-\u6bcf\u65e5\u603b\u7ed3.md").write_text(
                "# Older Daily\n\nPUBLIC_OLDER_MONTH",
                encoding="utf-8",
            )
            (summaries_dir / "2025-11-28 12_22_35.md").write_text(
                "# Legacy Flat\n\nPRIVATE_LEGACY_FLAT",
                encoding="utf-8",
            )
            indexer = SimpleContentIndexer(str(summaries_dir))
            indexer.index_cache_path = Path(tmp) / "search_index.json"
            index = indexer.build_index(force_rebuild=True)

        self.assertEqual(len(index), 1)
        self.assertEqual(index[0]["title"], "Public Daily")
        self.assertIn("PUBLICCURRENTMONTH", index[0]["content"])
        serialized = json.dumps(index, ensure_ascii=False)
        self.assertNotIn("PRIVATE_LOCAL_AUDIT", serialized)
        self.assertNotIn("PRIVATE_TIMED_HISTORY", serialized)
        self.assertNotIn("PUBLIC_OLDER_MONTH", serialized)
        self.assertNotIn("PRIVATE_LEGACY_FLAT", serialized)

    def test_search_index_keeps_legacy_flat_summary_without_public_page_url(self):
        from build_search_index import SimpleContentIndexer

        with tempfile.TemporaryDirectory() as tmp:
            summaries_dir = Path(tmp) / "summaries"
            summaries_dir.mkdir(parents=True)
            (summaries_dir / "2025-11-28 12_22_35.md").write_text(
                "# Legacy\n\nNVDA legacy content",
                encoding="utf-8",
            )
            indexer = SimpleContentIndexer(str(summaries_dir), public_only=False)
            indexer.index_cache_path = Path(tmp) / "search_index.json"
            index = indexer.build_index(force_rebuild=True)

        self.assertEqual(len(index), 1)
        self.assertFalse(index[0]["is_built_page"])
        self.assertIsNone(index[0]["url"])
        self.assertIn("NVDA legacy content", index[0]["content"])

    def test_wework_image_payload_uses_base64_and_md5(self):
        from utils.wework_webhook import build_wework_image_payload

        image_bytes = b"fake-png-bytes"
        payload = build_wework_image_payload(image_bytes)

        self.assertEqual(payload["msgtype"], "image")
        self.assertEqual(payload["image"]["base64"], "ZmFrZS1wbmctYnl0ZXM=")
        self.assertEqual(payload["image"]["md5"], hashlib.md5(image_bytes).hexdigest())
        self.assertNotIn("text", payload)

    def test_env_secret_loader_accepts_python_literal_assignments(self):
        repo_root = Path(__file__).resolve().parents[1]
        env = os.environ.copy()
        env["WHOP_HEADERS_JSON"] = "whom_headers = {'Cookie': 'abc', 'content-type': 'application/json'}"
        env["MODEL_KEY_JSON"] = (
            "model_key = [{'model': 'test-model', 'key': 'test-key', "
            "'base_url': 'https://api.example.com/v1', 'app': 'openai'}]"
        )
        env["WEWORK_WEBHOOK_URL"] = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test"
        code = (
            "import json\n"
            "import utils._secrets as secrets\n"
            "print(json.dumps({"
            "'cookie': secrets.whom_headers['Cookie'], "
            "'model': secrets.model_key[0]['model'], "
            "'hook': secrets.wework_webhook_url"
            "}))\n"
        )

        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=repo_root,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        parsed = json.loads(result.stdout)
        self.assertEqual(parsed["cookie"], "abc")
        self.assertEqual(parsed["model"], "test-model")
        self.assertEqual(parsed["hook"], env["WEWORK_WEBHOOK_URL"])

    def test_send_wework_image_posts_image_payload(self):
        from utils.wework_webhook import send_wework_image

        response = Mock()
        response.json.return_value = {"errcode": 0}

        with tempfile.TemporaryDirectory() as tmp:
            image_path = Path(tmp) / "summary.png"
            image_path.write_bytes(b"fake-png-bytes")
            with patch("utils.wework_webhook.requests.post", return_value=response) as post:
                send_wework_image("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test", image_path)

        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["msgtype"], "image")
        self.assertNotIn("text", payload)


if __name__ == "__main__":
    unittest.main()
