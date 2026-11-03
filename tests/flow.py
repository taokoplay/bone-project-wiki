import re
import os
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


base = 'http://127.0.0.1:' + os.environ.get('BONE_WIKI_TEST_PORT', '18766')


def pick(page, name, value):
    """Choose an option from the panel's own menu select (never a native <select>)."""
    page.locator(f'[data-select="{name}"] .select-trigger').click()
    page.locator(f'.popover [role="option"][data-value="{value}"]').click()


def menu(page, label):
    """Secondary header actions live in one overflow menu."""
    page.locator('.menu-trigger').click()
    page.get_by_role('menuitem', name=label, exact=True).click()


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        assert page.locator('select').count() == 0, 'the panel must not use a native select'
        page.get_by_role('button', name='Initialize library', exact=True).click()
        page.get_by_role('button', name='New record', exact=True).click()
        page.locator('[name="title"]').fill('Refund acceptance rule')
        page.locator('[name="content"]').fill('# Refund rule\n\nNever refund more than the paid amount.')
        page.wait_for_timeout(600)
        expect(page.locator('[name=\"title\"]')).to_have_value('Refund acceptance rule')
        state = page.request.get(base + '/state').json()
        assert len(state['entries']) == 1
        entry = state['entries'][0]
        assert entry['content'].endswith('paid amount.')
        assert Path(state['snapshot']['workspacePath'], entry['path']).is_file()
        page.locator('[name="content"]').fill('# Refund rule\n\nKeep an audit record.')
        page.wait_for_timeout(600)
        expect(page.locator('[name=\"content\"]')).to_have_value(re.compile('Keep an audit record\\.'))
        state = page.request.get(base + '/state').json()
        assert state['entries'][0]['id'] == entry['id']
        assert state['entries'][0]['revision'] != entry['revision']
        page.reload(wait_until='networkidle')
        expect(page.locator('.record').filter(has_text='Refund acceptance rule')).to_be_visible()
        page.locator('.record').filter(has_text='Refund acceptance rule').click()
        expect(page.locator('[name=\"content\"]')).to_have_value(re.compile('Keep an audit record\\.'))
        state = page.request.get(base + '/state').json()
        memory_payload = {
            'channel': 'wiki',
            'input': {
                'action': 'save',
                'workspacePath': state['snapshot']['workspacePath'],
                'title': 'Project coding convention',
                'category': 'memory',
                'kind': 'memory',
                'status': 'confirmed',
                'content': 'Record verification before delivery.'
            }
        }
        response = page.request.post(base + '/call', data=json.dumps(memory_payload), headers={'Content-Type': 'application/json'})
        assert response.ok
        page.reload(wait_until='networkidle')
        page.locator('header .section-tab').filter(has_text='Memory').click()
        page.locator('.record').filter(has_text='Project coding convention').click()
        expect(page.get_by_role('button', name='Forget memory', exact=True)).to_be_visible()
        state = page.request.get(base + '/state').json()
        assert any(e['kind'] == 'memory' and e['category'] == 'memory' for e in state['entries'])
        page.evaluate('window.wikiUi.preferences()')
        page.locator('[name="content"]').fill('Prefer concise Chinese responses.')
        page.get_by_role('button', name='Save preferences', exact=True).click()
        expect(page.get_by_role('button', name='Save preferences', exact=True)).to_be_visible()
        assert 'Prefer concise' not in str(page.request.get(base + '/state').json()['entries'])
        page.evaluate('window.wikiUi.context()')
        expect(page.locator('pre.context')).to_contain_text('BoneProjectWiki project context')
        expect(page.locator('pre.context')).to_contain_text('Record verification before delivery.')
        page.evaluate('window.wikiUi.exportHtml()')
        screenshot = Path(os.environ.get('PI_SCRATCH_DIR', '/tmp')) / 'bone-project-wiki-acceptance.png'
        page.screenshot(path=str(screenshot), full_page=True)
        assert not errors, errors
        print('PASS: real panel -> service -> Markdown persistence, revision update, reload, private preferences, context and export')
        print('Screenshot:', screenshot)
    finally:
        browser.close()
