"""Sidebar collapse acceptance against the real panel, service and file storage."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + os.environ.get('BONE_WIKI_TEST_PORT', '18895')


def call(page, action, **fields):
    workspace = page.request.get(base + '/state').json()['snapshot']['workspacePath']
    body = page.request.post(base + '/call', data={'channel': 'wiki', 'input': {
        'action': action, 'workspacePath': workspace, **fields
    }}).json()
    assert 'error' not in body, body
    return body['result']


def full_content(page):
    geometry = page.locator('.detail').evaluate('''node => {
        const shell = document.querySelector('.shell').getBoundingClientRect();
        const detail = node.getBoundingClientRect();
        return ['left','top','right','bottom'].map(edge => Math.abs(shell[edge]-detail[edge]));
    }''')
    assert max(geometry) <= 1, geometry
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.set_default_timeout(5000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        toggle = page.locator('.sidebar-toggle')
        expect(page.get_by_role('button', name='Collapse sidebar', exact=True)).to_be_visible()
        page.get_by_role('button', name='Initialize library', exact=True).click()
        note = call(page, 'save', kind='document', category='产品说明', title='Sidebar handbook',
                    content='# Sidebar handbook\n\nKeep the full document and editor state.')
        call(page, 'save', kind='memory', category='memory', status='confirmed',
             title='Sidebar rule', content='Retain review evidence.')
        call(page, 'import', kind='prototype', category='产品说明', title='Sidebar webpage', entryPath='index.html',
             files=[{'path': 'index.html', 'content': '<h1>Retained webpage</h1><button onclick="this.textContent=\'Changed state\'">Change state</button>'}])
        page.reload(wait_until='networkidle')
        expect(toggle).to_have_attribute('aria-expanded', 'true')
        expect(toggle).to_have_attribute('aria-controls', 'wiki-sidebar')
        expect(page.locator('#wiki-sidebar')).to_be_visible()
        page.locator('.record').filter(has_text='Sidebar handbook').click()
        expect(page.locator('.note-reader')).to_be_visible()
        page.evaluate('window.retainedReader = document.querySelector(".note-reader")')
        selected = page.locator('.record[aria-pressed="true"]')
        toggle.click()
        expect(toggle).to_have_accessible_name('Expand sidebar')
        expect(toggle).to_have_attribute('aria-expanded', 'false')
        expect(page.locator('#wiki-sidebar')).to_be_hidden()
        assert page.evaluate('document.querySelector(".note-reader") === window.retainedReader')
        expect(selected).to_have_count(1)
        full_content(page)
        assert call(page, 'read', recordId=note['recordId'])['revision'] == note['revision']
        expect(toggle).to_be_focused()
        page.keyboard.press('Enter')
        expect(toggle).to_have_attribute('aria-expanded', 'true')
        page.keyboard.press('Space')
        expect(toggle).to_have_attribute('aria-expanded', 'false')
        for _ in range(8):
            page.keyboard.press('Tab')
            assert not page.evaluate('document.querySelector("#wiki-sidebar").contains(document.activeElement)')

        # Layout changes cannot reconstruct the editor or discard pending save input.
        page.get_by_role('button', name='Edit record', exact=True).click()
        page.evaluate('window.retainedEditor = document.querySelector(".note-editor")')
        pending = note['content'] + '\nFirst pending input.'
        latest = note['content'] + '\nLatest input survives sidebar toggles.'
        held = []
        def hold_save(route, request):
            data = (request.post_data_json or {}).get('input', {})
            if data.get('action') == 'save' and data.get('content') == pending and not held:
                held.append(route)
                page.evaluate('window.sidebarSaveHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_save)
        page.locator('[name="content"]').fill(pending)
        page.wait_for_function('window.sidebarSaveHeld === true')
        toggle.click()
        page.locator('[name="content"]').fill(latest)
        toggle.click()
        assert page.evaluate('document.querySelector(".note-editor") === window.retainedEditor')
        expect(page.locator('[name="content"]')).to_have_value(latest)
        held[0].continue_()
        page.get_by_role('button', name='Read mode', exact=True).click()
        expect(page.locator('.article')).to_contain_text('Latest input survives sidebar toggles.')
        page.unroute('**/call', hold_save)
        assert call(page, 'read', recordId=note['recordId'])['content'] == latest
        expect(toggle).to_have_attribute('aria-expanded', 'false')

        # A shell rebuild for the other tab keeps the panel-local collapsed choice.
        page.get_by_role('tab', name='Memory', exact=True).click()
        expect(page.get_by_role('heading', name='Memory overview', exact=True)).to_be_visible()
        expect(toggle).to_have_attribute('aria-expanded', 'false')
        query = page.locator('[name="memoryQuery"]')
        query.fill('review evidence')
        page.evaluate('window.retainedOverview = document.querySelector(".memory-overview")')
        toggle.click()
        toggle.click()
        expect(query).to_have_value('review evidence')
        assert page.evaluate('document.querySelector(".memory-overview") === window.retainedOverview')
        page.get_by_role('tab', name='Knowledge base', exact=True).click()
        expect(toggle).to_have_attribute('aria-expanded', 'false')
        toggle.click()
        search = page.locator('.sidebar-search-input')
        search.fill('Sidebar')
        expect(page.locator('.record').filter(has_text='Sidebar webpage')).to_be_visible()
        toggle.click()
        toggle.click()
        expect(search).to_have_value('Sidebar')
        search.fill('')
        page.locator('.record').filter(has_text='Sidebar webpage').click()
        frame = page.frame_locator('iframe.preview')
        expect(frame.get_by_role('heading', name='Retained webpage')).to_be_visible()
        frame.get_by_role('button', name='Change state', exact=True).click()
        page.evaluate('window.retainedFrame = document.querySelector("iframe.preview")')
        toggle.click()
        expect(frame.get_by_role('button', name='Changed state', exact=True)).to_be_visible()
        assert page.evaluate('document.querySelector("iframe.preview") === window.retainedFrame')
        expect(page.locator('iframe.preview')).to_have_attribute('sandbox', 'allow-scripts')
        full_content(page)
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / 'wiki-sidebar-collapsed.png'), full_page=True)
        for theme in ['light', 'dark']:
            page.locator('html').evaluate('(node,theme) => node.dataset.base = theme', theme)
            for width, height in [(1280, 900), (800, 620), (390, 700)]:
                page.set_viewport_size({'width': width, 'height': height})
                full_content(page)
                toggle.click()
                expect(page.locator('#wiki-sidebar')).to_be_visible()
                expect(toggle).to_be_in_viewport()
                toggle.click()
                full_content(page)
                expect(frame.get_by_role('button', name='Changed state', exact=True)).to_be_visible()
        page.set_viewport_size({'width': 1280, 'height': 900})
        toggle.click()
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / 'wiki-sidebar-expanded.png'), full_page=True)

        # A new page starts expanded; no project files or stored settings are written by toggling.
        page.reload(wait_until='networkidle')
        expect(toggle).to_have_attribute('aria-expanded', 'true')
        def chinese_locale(route, request):
            channel = (request.post_data_json or {}).get('channel')
            if channel == 'app.getLocale':
                route.fulfill(json={'result': 'zh-CN'})
            elif channel == 'app.getAppearance':
                route.fulfill(json={'result': {'base': 'light', 'locale': 'zh-CN'}})
            else:
                route.continue_()
        page.route('**/call', chinese_locale)
        page.reload(wait_until='networkidle')
        expect(page.get_by_role('button', name='收起侧栏', exact=True)).to_be_visible()
        toggle.click()
        expect(page.get_by_role('button', name='展开侧栏', exact=True)).to_be_visible()
        assert not errors, errors
        print('PASS: sidebar pointer/keyboard collapse and expansion, full content geometry, retained selection/search/editor/save/overview/iframe state, tabs, responsive themes and bilingual labels')
    finally:
        browser.close()
