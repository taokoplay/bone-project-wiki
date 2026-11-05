import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + os.environ.get('BONE_WIKI_TEST_PORT', '18859')
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors, remote = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: remote.append(request.url) if request.url.startswith('https://example.invalid') else None)
    calls = []
    page.on('request', lambda request: calls.append((request.post_data_json or {}).get('input', {})) if request.url.endswith('/call') and request.method == 'POST' else None)
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        page.get_by_role('button', name='Initialize library', exact=True).click()
        assert page.request.post(base + '/test/html-fixture').ok
        page.reload(wait_until='networkidle')
        page.locator('.record').filter(has_text='完整产品与交互文档.html').click()
        frame = page.frame_locator('iframe.preview')
        expect(frame.get_by_role('heading', name='完整产品与交互文档')).to_be_visible()
        expect(frame.locator('h1')).to_have_css('color', 'rgb(12, 80, 120)')
        expect(frame.locator('body')).to_have_attribute('data-local-script', 'loaded')
        expect(frame.locator('body')).to_have_attribute('data-network-blocked', 'yes')
        frame.get_by_role('button', name='切换页面').click()
        expect(frame.get_by_role('button', name='已切换')).to_be_visible()
        expect(frame.locator('img')).to_have_js_property('naturalWidth', 1)
        expect(page.locator('iframe.preview')).to_have_attribute('sandbox', 'allow-scripts')
        assert page.locator('body').get_attribute('data-preview-escaped') is None
        assert page.evaluate('document.body.dataset.previewEscaped') is None
        assert not remote, remote
        expect(page.get_by_role('button', name='Open in system', exact=True)).to_be_visible()
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / 'wiki-html-preview-acceptance.png'), full_page=True)
        # Existing files stay readable after a panel refresh and source edits.
        state = page.request.get(base + '/state').json()
        entry = next(item for item in state['entries'] if item['id'] == '完整产品与交互文档.html')
        filename = Path(state['snapshot']['workspacePath']) / entry['path']
        original = filename.read_text()
        assert entry['kind'] == 'attachment'
        filename.write_text(original.replace('完整产品与交互文档</h1>', '更新后的页面</h1>'))
        page.reload(wait_until='networkidle')
        page.locator('.record').filter(has_text='完整产品与交互文档.html').click()
        expect(page.frame_locator('iframe.preview').get_by_role('heading', name='更新后的页面')).to_be_visible()
        filename.write_text('x' * (10 * 1024 * 1024 + 1))
        page.reload(wait_until='networkidle')
        page.locator('.record').filter(has_text='完整产品与交互文档.html').click()
        expect(page.locator('.html-preview [role="alert"]')).to_contain_text('100-file or 10 MB limit')
        assert page.locator('iframe.preview').count() == 0
        expect(page.get_by_role('button', name='Open in system', exact=True)).to_be_visible()
        # An imported HTML attachment uses the same renderer without record conversion.
        page.locator('.record').filter(has_text='Imported HTML attachment').click()
        frame = page.frame_locator('iframe.preview')
        expect(frame.get_by_role('heading', name='Imported attachment preview')).to_be_visible()
        frame.get_by_role('button', name='Try attachment').click()
        expect(frame.get_by_role('button', name='Worked')).to_be_visible()
        # Missing optional resources report a degraded preview rather than a blank file card.
        page.locator('.record').filter(has_text='missing-assets.html').click()
        expect(page.locator('.html-preview')).to_contain_text('Some local resources could not be loaded: missing.js')
        expect(page.frame_locator('iframe.preview').get_by_role('heading', name='Readable partial page')).to_be_visible()
        for width in [1280, 800, 390]:
            page.set_viewport_size({'width': width, 'height': 900})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
        page.set_viewport_size({'width': 1280, 'height': 900})
        assert not errors, errors
        print('PASS: raw/imported HTML -> real service -> sandboxed webpage, local CSS/JS/image, interaction, source refresh, missing-resource notice, network/parent isolation, responsive layout')
    except Exception:
        print('Panel state:', page.locator('body').inner_text()[-5000:])
        print('Recent calls:', calls[-12:])
        print('Browser errors:', errors)
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / 'wiki-html-flow-failure.png'), full_page=True)
        raise
    finally:
        browser.close()
