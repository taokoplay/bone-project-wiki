"""Markdown reading/editing acceptance against the real panel and service."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + os.environ.get('BONE_WIKI_TEST_PORT', '18861')
source = '''# Product handbook

A readable paragraph with **strong**, *emphasis*, ~~old text~~ and `inline <code>`.
Continue the same paragraph with &amp; and &#60;literal&#62;.

## Lists and decisions

3. First decision
4. Second decision
   - Nested detail
     - Deep detail

- [x] Complete
- [ ] Pending

> A quoted **rule**.
>
> Another paragraph.

| Item | Owner | Status |
| :--- | :---: | ---: |
| **Read mode** | Team | Ready |
| Edit mode | Team | Saving |

```javascript
const value = "<script>unsafe</script>";
console.log(value);
```

---

[Website](https://example.com/docs?one=1&two=2) · [Email](mailto:hello@example.com)

[Unsafe](javascript:alert%281%29) [Encoded](jav&#x61;script:alert%281%29)
[Local file](file:///private/document) [Relative](../../index.html)

<script>window.markdownEscaped = true</script>
<img src="https://example.invalid/private-image" onerror="window.markdownEscaped=true">

![Remote image](https://example.invalid/private-image.png)

Escaped: \\*literal asterisks\\*.
'''


def call(page, action, **fields):
    snapshot = page.request.get(base + '/state').json()['snapshot']
    response = page.request.post(base + '/call', data={
        'channel': 'wiki', 'input': {'action': action, 'workspacePath': snapshot['workspacePath'], **fields}
    })
    body = response.json()
    assert response.ok and 'error' not in body, body
    return body['result']


def open_note(page, title):
    page.locator('.record').filter(has_text=title).click()
    expect(page.locator('.note-reader')).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 960})
    errors, remote_requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: remote_requests.append(request.url) if 'example.invalid' in request.url else None)
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        page.get_by_role('button', name='Initialize library', exact=True).click()
        raw_source = page.request.post(base + '/test/markdown-fixture').json()['content']
        page.reload(wait_until='networkidle')
        open_note(page, 'Raw handbook')
        expect(page.locator('.note-reader .article h1')).to_have_text('Raw handbook')
        expect(page.locator('.note-reader .article strong')).to_have_text('formatted')
        expect(page.locator('.note-reader .article tbody td').last).to_have_text('Ready')
        temporary_project = page.request.get(base + '/state').json()['snapshot']['workspacePath']
        assert Path(temporary_project, '.bone-project-wiki/knowledge/产品说明/raw-handbook.md').read_text() == raw_source
        entry = call(page, 'save', title='Markdown handbook', kind='document', category='产品说明', content=source)
        page.reload(wait_until='networkidle')
        open_note(page, 'Markdown handbook')
        body = page.locator('.note-reader .article')
        expect(page.locator('.note-editor')).to_have_count(0)
        expect(body.locator('h1')).to_have_text('Product handbook')
        expect(body.locator('h2')).to_have_text('Lists and decisions')
        expect(body.locator('strong').first).to_have_text('strong')
        expect(body.locator('em')).to_have_text('emphasis')
        expect(body.locator('del')).to_have_text('old text')
        expect(body.locator('ol')).to_have_attribute('start', '3')
        expect(body.locator('ol ul ul li')).to_have_text('Deep detail')
        expect(body.locator('input[type="checkbox"]')).to_have_count(2)
        expect(body.locator('input[type="checkbox"]').first).to_be_checked()
        expect(body.locator('input[type="checkbox"]').first).to_be_disabled()
        expect(body.locator('blockquote p')).to_have_count(2)
        expect(body.locator('table th')).to_have_count(3)
        expect(body.locator('table tbody tr')).to_have_count(2)
        expect(body.locator('pre code')).to_have_text('const value = "<script>unsafe</script>";\nconsole.log(value);')
        expect(body.locator('hr')).to_have_count(1)
        expect(body).to_contain_text('with & and <literal>')
        expect(body).to_contain_text('*literal asterisks*')
        assert body.locator('a').count() == 2
        assert body.locator('script, iframe, object, img[src^="http"]').count() == 0
        assert page.evaluate('window.markdownEscaped === undefined')
        assert not remote_requests, remote_requests
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / 'wiki-markdown-reading.png'), full_page=True)
        before = call(page, 'read', recordId=entry['recordId'])
        assert before['revision'] == entry['revision'], 'Reading must not rewrite the source'

        # Returning to reading flushes the pending debounce, preserving source identity.
        page.get_by_role('button', name='Edit record', exact=True).click()
        expect(page.locator('[name="content"]')).to_have_value(source)
        edited = source + '\n## Saved from edit mode\n\nA **fresh** paragraph.\n'
        page.locator('[name="content"]').fill(edited)
        page.get_by_role('button', name='Read mode', exact=True).click()
        expect(page.locator('.note-reader .article h2').last).to_have_text('Saved from edit mode')
        after = call(page, 'read', recordId=entry['recordId'])
        assert after['content'] == edited and after['recordId'] == entry['recordId']
        page.reload(wait_until='networkidle')
        open_note(page, 'Markdown handbook')
        expect(page.locator('.article')).to_contain_text('A fresh paragraph.')

        # An input made while a write is held must save after that revision before reading.
        page.get_by_role('button', name='Edit record', exact=True).click()
        held = []
        first = edited + '\nFirst pending version.\n'
        latest = edited + '\n## Latest pending version\n'
        def hold_save(route, request):
            payload = (request.post_data_json or {}).get('input', {})
            if payload.get('action') == 'save' and payload.get('content') == first and not held:
                held.append(route)
                page.evaluate('window.markdownSavePaused = true')
            else:
                route.continue_()
        page.route('**/call', hold_save)
        page.locator('[name="content"]').fill(first)
        page.wait_for_function('window.markdownSavePaused === true')
        page.locator('[name="content"]').fill(latest)
        page.get_by_role('button', name='Read mode', exact=True).click()
        expect(page.locator('.note-editor')).to_be_visible()
        held[0].continue_()
        expect(page.locator('.note-reader .article h2').last).to_have_text('Latest pending version')
        page.unroute('**/call', hold_save)
        assert call(page, 'read', recordId=entry['recordId'])['content'] == latest

        # Input after the combined operation committed, before its response is applied, also survives.
        page.get_by_role('button', name='Edit record', exact=True).click()
        snapshots = []
        def hold_snapshot(route, request):
            envelope = request.post_data_json or {}
            payload = envelope.get('input', {})
            if envelope.get('channel') == 'wiki.save' and payload.get('content') == latest + '\nBefore snapshot.\n' and not snapshots:
                response = route.fetch()
                assert response.json()['result']['snapshot']['requestCapabilities']['saveSnapshot'] is True
                snapshots.append((route, response))
                page.evaluate('window.markdownSnapshotPaused = true')
            else:
                route.continue_()
        page.route('**/call', hold_snapshot)
        page.locator('[name="content"]').fill(latest + '\nBefore snapshot.\n')
        page.wait_for_function('window.markdownSnapshotPaused === true')
        newest = latest + '\n## After snapshot input\n'
        page.locator('[name="content"]').fill(newest)
        page.get_by_role('button', name='Read mode', exact=True).click()
        snapshots[0][0].fulfill(response=snapshots[0][1])
        expect(page.locator('.note-reader .article h2').last).to_have_text('After snapshot input')
        page.unroute('**/call', hold_snapshot)
        assert call(page, 'read', recordId=entry['recordId'])['content'] == newest

        # Conflict retains the draft and editing mode; reading cannot hide a failed save.
        page.get_by_role('button', name='Edit record', exact=True).click()
        current = call(page, 'read', recordId=entry['recordId'])
        call(page, 'save', **{**current, 'content': 'Externally changed source.', 'expectedRevision': current['revision']})
        page.locator('[name="content"]').fill('Keep this conflict draft intact.')
        page.get_by_role('button', name='Read mode', exact=True).click()
        expect(page.locator('.notice')).to_contain_text('REVISION_CONFLICT')
        expect(page.locator('[name="content"]')).to_have_value('Keep this conflict draft intact.')
        expect(page.locator('.note-reader')).to_have_count(0)
        assert call(page, 'read', recordId=entry['recordId'])['content'] == 'Externally changed source.'
        page.once('dialog', lambda dialog: dialog.accept())
        page.reload(wait_until='networkidle')
        open_note(page, 'Markdown handbook')
        expect(page.locator('.article')).to_have_text('Externally changed source.')

        # Theme and overflow checks use the rich reading view, including long table/code content.
        current = call(page, 'read', recordId=entry['recordId'])
        call(page, 'save', **{**current, 'content': source.replace('console.log(value);', 'x' * 400).replace('| Team | Ready |', '| ' + 'column' * 80 + ' | Ready |'), 'expectedRevision': current['revision']})
        page.reload(wait_until='networkidle')
        open_note(page, 'Markdown handbook')
        for width in [1280, 800, 390]:
            page.set_viewport_size({'width': width, 'height': 960})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            assert page.locator('.article pre').first.evaluate('(node) => getComputedStyle(node).overflowX') == 'auto'
            assert page.locator('.markdown-table').evaluate('(node) => node.scrollWidth >= node.clientWidth')
        page.set_viewport_size({'width': 1280, 'height': 960})
        theme_colors = {}
        for theme in ['light', 'dark']:
            page.evaluate('(base) => { document.documentElement.dataset.base = base; document.documentElement.dataset.theme = base; }', theme)
            theme_colors[theme] = page.evaluate('({background: getComputedStyle(document.documentElement).backgroundColor, foreground: getComputedStyle(document.querySelector(".article")).color})')
            assert page.locator('.article').evaluate('(node) => getComputedStyle(node).color') != page.evaluate('getComputedStyle(document.documentElement).backgroundColor')
            page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / f'wiki-markdown-{theme}.png'), full_page=True)
        assert theme_colors['light']['background'] != theme_colors['dark']['background'], theme_colors
        assert theme_colors['light']['foreground'] != theme_colors['dark']['foreground'], theme_colors
        assert not errors, errors
        print('PASS: raw/managed formatted Markdown, safe rendering, default reading, edit/autosave/read/reload, in-flight save and snapshot input, conflict draft protection, distinct dark/light themes and responsive overflow')
    finally:
        browser.close()
