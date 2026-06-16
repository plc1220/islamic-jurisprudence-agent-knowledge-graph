#!/usr/bin/env python3
"""Small JSON bridge between the Node server and Crawl4AI.

The Node process owns auth, LLM extraction, graph writes, and UI status.
This script only crawls/render pages and returns clean markdown documents.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from typing import Any, Iterable
from urllib.parse import urldefrag


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crawl a seed URL with Crawl4AI and emit JSON documents.")
    parser.add_argument("--seed-url", required=True)
    parser.add_argument("--source-name", default="Manual URL")
    parser.add_argument("--category", default="website")
    parser.add_argument("--max-pages", type=int, default=1)
    parser.add_argument("--max-depth", type=int, default=0)
    parser.add_argument("--min-chars", type=int, default=450)
    parser.add_argument("--include-pattern", action="append", default=[])
    return parser.parse_args()


def emit(payload: dict[str, Any], code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False))
    raise SystemExit(code)


def compact_markdown(markdown: str) -> str:
    markdown = re.sub(r"\r\n?", "\n", markdown)
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    markdown = re.sub(r"[ \t]{2,}", " ", markdown)
    markdown = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", markdown)
    return markdown.strip()


def normalize_url(url: str) -> str:
    return urldefrag(url)[0].rstrip("/")


def markdown_from_result(result: Any) -> str:
    markdown = getattr(result, "markdown", "") or ""
    if isinstance(markdown, str):
        return compact_markdown(markdown)

    for attr in ("fit_markdown", "raw_markdown", "markdown_with_citations"):
        value = getattr(markdown, attr, None)
        if value:
            return compact_markdown(str(value))

    return compact_markdown(str(markdown))


def title_from_result(result: Any, fallback: str) -> str:
    metadata = getattr(result, "metadata", None) or {}
    for key in ("title", "og:title", "twitter:title"):
        value = metadata.get(key)
        if value:
            return str(value).strip()

    markdown = markdown_from_result(result)
    for line in markdown.splitlines():
        clean = line.strip("# ").strip()
        if len(clean) > 8:
            return clean[:180]

    return fallback


def result_depth(result: Any) -> int:
    metadata = getattr(result, "metadata", None) or {}
    try:
      return int(metadata.get("depth", 0))
    except Exception:
      return 0


def is_probably_article(markdown: str, min_chars: int) -> bool:
    if len(markdown) < min_chars:
        return False

    low = markdown.lower()
    noisy_markers = ("cookie", "privacy policy", "javascript", "enable cookies")
    if len(markdown) < 900 and any(marker in low for marker in noisy_markers):
        return False

    return True


def build_document(result: Any, fallback_title: str, min_chars: int) -> dict[str, Any] | None:
    markdown = markdown_from_result(result)
    if not is_probably_article(markdown, min_chars):
        return None

    return {
        "url": normalize_url(getattr(result, "url", "") or ""),
        "title": title_from_result(result, fallback_title),
        "content": markdown,
        "depth": result_depth(result),
        "status_code": getattr(result, "status_code", None),
    }


def unique_documents(documents: Iterable[dict[str, Any]], max_pages: int) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for document in documents:
        url = normalize_url(document.get("url", ""))
        if not url or url in seen:
            continue
        seen.add(url)
        output.append(document)
        if len(output) >= max_pages:
            break
    return output


async def crawl(args: argparse.Namespace) -> dict[str, Any]:
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig
        from crawl4ai.content_filter_strategy import PruningContentFilter
        from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
    except Exception as exc:  # pragma: no cover - depends on deployment image
        return {
            "ok": False,
            "error": f"crawl4ai is not installed or not importable: {exc}",
            "documents": [],
        }

    browser_config = BrowserConfig(headless=True)
    markdown_generator = DefaultMarkdownGenerator(
        content_filter=PruningContentFilter(threshold=0.45, threshold_type="fixed")
    )

    run_config_kwargs: dict[str, Any] = {
        "cache_mode": CacheMode.BYPASS,
        "markdown_generator": markdown_generator,
        "word_count_threshold": 80,
        "remove_overlay_elements": True,
        "exclude_external_links": True,
        "exclude_social_media_links": True,
        "exclude_external_images": True,
    }

    if args.max_pages > 1 and args.max_depth > 0:
        try:
            from crawl4ai.deep_crawling import BFSDeepCrawlStrategy
            from crawl4ai.deep_crawling.filters import ContentTypeFilter, FilterChain, URLPatternFilter
            from crawl4ai.content_scraping_strategy import LXMLWebScrapingStrategy

            filters = [ContentTypeFilter(allowed_types=["text/html"])]
            if args.include_pattern:
                filters.insert(0, URLPatternFilter(patterns=args.include_pattern))

            run_config_kwargs.update(
                {
                    "deep_crawl_strategy": BFSDeepCrawlStrategy(
                        max_depth=args.max_depth,
                        include_external=False,
                        max_pages=args.max_pages,
                        filter_chain=FilterChain(filters),
                    ),
                    "scraping_strategy": LXMLWebScrapingStrategy(),
                    "stream": False,
                }
            )
        except Exception as exc:
            print(f"Deep crawl unavailable, falling back to single-page crawl: {exc}", file=sys.stderr)

    run_config = CrawlerRunConfig(**run_config_kwargs)

    async with AsyncWebCrawler(config=browser_config) as crawler:
        raw_results = await crawler.arun(args.seed_url, config=run_config)

    if not isinstance(raw_results, list):
        raw_results = [raw_results]

    documents = []
    errors = []
    for result in raw_results:
        if not getattr(result, "success", False):
            errors.append(
                {
                    "url": getattr(result, "url", args.seed_url),
                    "error": getattr(result, "error_message", "Unknown crawl failure"),
                }
            )
            continue

        document = build_document(result, args.source_name, args.min_chars)
        if document:
            documents.append(document)

    return {
        "ok": bool(documents),
        "crawler": "crawl4ai",
        "seedUrl": args.seed_url,
        "sourceName": args.source_name,
        "category": args.category,
        "documents": unique_documents(documents, args.max_pages),
        "errors": errors,
        "error": None if documents else "No crawlable documents passed the content threshold.",
    }


def main() -> None:
    args = parse_args()
    try:
        payload = asyncio.run(crawl(args))
    except Exception as exc:
        emit({"ok": False, "error": str(exc), "documents": []}, code=1)

    emit(payload, code=0 if payload.get("ok") else 2)


if __name__ == "__main__":
    main()
