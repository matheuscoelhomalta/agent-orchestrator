"""Check the rendered documentation before publication (no network requests)."""
import json
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import unquote, urljoin, urlsplit
import xml.etree.ElementTree as ET


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.ids, self.links, self.meta, self.canonical = set(), [], {}, []
        self.h1, self.title, self.structured = 0, '', []
        self.capture = None
        self.feed(path.read_text())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, f'Duplicate id: {attrs["id"]}'
            self.ids.add(attrs['id'])
        self.h1 += tag == 'h1'
        if tag == 'title':
            self.capture = 'title'
        if tag == 'meta':
            self.meta[attrs.get('name', attrs.get('property'))] = attrs.get('content')
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical.append(attrs['href'])
        if tag in ('a', 'link', 'img', 'script'):
            link = attrs.get('href', attrs.get('src'))
            if link:
                self.links.append(link)
        if tag == 'script' and attrs.get('type') == 'application/ld+json':
            self.capture = 'json'
            self.structured.append('')

    def handle_endtag(self, tag):
        if tag in ('title', 'script'):
            self.capture = None

    def handle_data(self, data):
        if self.capture == 'title':
            self.title += data
        elif self.capture == 'json':
            self.structured[-1] += data


root = Path(sys.argv[1] if len(sys.argv) > 1 else '_site').resolve()
base = 'https://matheuscoelhomalta.github.io/agent-orchestrator/'
origin = urlsplit(base)
pages = {path.relative_to(root).as_posix(): Page(path) for path in root.rglob('*.html')}
assert len(pages) == 8, f'Expected seven documentation pages and a 404, found {len(pages)}'
titles, descriptions, canonical_urls = set(), set(), set()
for name, page in pages.items():
    url = urljoin(base, name.removesuffix('index.html'))
    assert page.h1 == 1, f'{name}: expected one h1'
    assert page.title.strip() and page.title not in titles, f'{name}: missing or repeated title'
    titles.add(page.title)
    description = page.meta.get('description')
    assert description and description not in descriptions, f'{name}: missing or repeated description'
    descriptions.add(description)
    assert page.canonical == [url], f'{name}: wrong canonical {page.canonical}'
    assert page.meta.get('og:url') == url, f'{name}: wrong Open Graph URL'
    assert page.meta.get('og:title') and page.meta.get('twitter:card'), f'{name}: missing social metadata'
    assert page.structured, f'{name}: missing structured data'
    for data in page.structured:
        assert json.loads(data)['@context'] == 'https://schema.org'
    if name != '404.html':
        canonical_urls.add(url)
    for link in page.links:
        target = urlsplit(urljoin(url, link))
        if (target.scheme, target.netloc) != (origin.scheme, origin.netloc):
            continue
        assert target.path.startswith(origin.path), f'{name}: link escapes site base: {link}'
        local = unquote(target.path[len(origin.path):])
        if not local or local.endswith('/'):
            local += 'index.html'
        destination = (root / local).resolve()
        assert destination.is_relative_to(root) and destination.is_file(), f'{name}: missing target: {link}'
        if target.fragment and local in pages:
            assert unquote(target.fragment) in pages[local].ids, f'{name}: missing anchor: {link}'
sitemap = ET.parse(root / 'sitemap.xml')
urls = {node.text for node in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
assert urls == canonical_urls, f'Sitemap mismatch: {urls ^ canonical_urls}'
assert not list(root.rglob('*.md')), 'Raw Markdown unexpectedly published'
print(f'Checked {len(pages)} pages: local links, anchors, metadata, structured data, and sitemap.')
