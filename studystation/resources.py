"""Extract curated resource links from a Canvas "resources" course.

Some courses (e.g. SWCC Resources) are not real classes — they're a landing
page of links to the bookstore, tech support, tutorials, etc. This module
pulls the course's module pages and scrapes the `<a>` tags into a flat list.
"""

from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import parse_qs, urlparse, unquote


def is_resource_course(name: str | None) -> bool:
    """Courses whose name contains 'resource' are treated as link hubs."""
    return bool(name) and "resource" in (name or "").lower()


class _LinkScraper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[dict] = []
        self._a_href = None
        self._a_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            d = dict(attrs)
            self._a_href = d.get("href")
            self._a_text = []

    def handle_data(self, data):
        if self._a_href is not None:
            self._a_text.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._a_href is not None:
            href = self._a_href
            text = " ".join("".join(self._a_text).split()).strip()
            self._a_href = None
            self._a_text = []
            if not href or not text:
                return
            if href.startswith(("#", "mailto:", "javascript:")):
                return
            if not href.startswith(("http://", "https://")):
                return
            self.links.append({"title": text, "url": _clean_url(href)})


def _clean_url(href: str) -> str:
    """Decode safelinks/redirect wrappers and drop junk query params."""
    try:
        p = urlparse(href)
    except ValueError:
        return href
    # Office 365 SafeLinks wrap the real URL in a `url` query param.
    if "safelinks.protection.outlook.com" in p.netloc:
        qs = parse_qs(p.query)
        if qs.get("url"):
            return unquote(qs["url"][0])
    return href


def extract_links(html: str) -> list[dict]:
    """Return [{title, url}] from an HTML page body (deduplicated)."""
    scraper = _LinkScraper()
    scraper.feed(html)
    seen = set()
    out = []
    for link in scraper.links:
        key = (link["title"], link["url"])
        if key in seen:
            continue
        seen.add(key)
        out.append(link)
    return out
