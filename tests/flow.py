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

def saved_change(page, name, value):
    def matches(response):
        if not response.url.endswith('/call'):
            return False
        payload = response.request.post_data_json or {}
        request = payload.get('input', {})
        return request.get('action') == 'save' and request.get(name) == value
    with page.expect_response(matches) as response:
        page.locator(f'[name="{name}"]').fill(value)
    body = response.value.json()
    assert response.value.ok and 'error' not in body, body

def saved_setting(page, name, value, action):
    def matches(response):
        request = (response.request.post_data_json or {}).get('input', {}) if response.url.endswith('/call') else {}
        return request.get('action') == 'save' and request.get(name) == value
    def snapshot(response):
        return response.url.endswith('/call') and (response.request.post_data_json or {}).get('input', {}).get('action') == 'snapshot'
    with page.expect_response(matches) as response, page.expect_response(snapshot):
        action()
    body = response.value.json()
    assert response.value.ok and 'error' not in body, body

def context_for(page, **fields):
    state = page.request.get(base + '/state').json()
    payload = {'channel': 'wiki', 'input': {'action': 'context', 'workspacePath': state['snapshot']['workspacePath'], **fields}}
    response = page.request.post(base + '/call', data=json.dumps(payload), headers={'Content-Type': 'application/json'})
    body = response.json()
    assert response.ok and 'error' not in body, body
    return body['result']['text']



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
        saved_change(page, 'content', '# Refund rule\n\nNever refund more than the paid amount.')
        expect(page.locator('[name=\"title\"]')).to_have_value('Refund acceptance rule')
        state = page.request.get(base + '/state').json()
        assert len(state['entries']) == 1, [(e['id'], e['title'], e['kind']) for e in state['entries']]
        entry = state['entries'][0]
        assert entry['content'].endswith('paid amount.')
        assert Path(state['snapshot']['workspacePath'], entry['path']).is_file()
        saved_change(page, 'content', '# Refund rule\n\nKeep an audit record.')
        expect(page.locator('[name=\"content\"]')).to_have_value(re.compile('Keep an audit record\\.'))
        state = page.request.get(base + '/state').json()
        assert state['entries'][0]['id'] == entry['id']
        assert state['entries'][0]['revision'] != entry['revision']
        page.reload(wait_until='networkidle')
        expect(page.locator('.record').filter(has_text='Refund acceptance rule')).to_be_visible()
        page.locator('.record').filter(has_text='Refund acceptance rule').click()
        expect(page.locator('[name=\"content\"]')).to_have_value(re.compile('Keep an audit record\\.'))
        # Confirm a full rule and associate its short summary through the UI.
        page.locator('.document-memory-editor > summary').click()
        page.locator('[name="memorySummary"]').fill('Keep an audit record for refunds.')
        page.locator('[name="readWhen"]').fill('When implementing refunds')
        # Input drafts survive a same-project focus refresh and a source autosave.
        page.locator('.document-memory-editor .memory-policy-editor').evaluate('(node) => { node.open = true; }')
        page.locator('[name="scopePaths"]').fill('apps/payments')
        page.locator('[name="coreMemory"]').check()
        with page.expect_response(lambda response: response.url.endswith('/call') and (response.request.post_data_json or {}).get('input', {}).get('action') == 'snapshot'):
            page.evaluate("window.dispatchEvent(new Event('focus'))")
        expect(page.locator('[name="memorySummary"]')).to_have_value('Keep an audit record for refunds.')
        expect(page.locator('[name="readWhen"]')).to_have_value('When implementing refunds')
        saved_change(page, 'content', '# Refund rule\n\nKeep an audit record.\nKeep a transaction reference with each log.')
        expect(page.locator('[name="memorySummary"]')).to_have_value('Keep an audit record for refunds.')
        expect(page.locator('[name="readWhen"]')).to_have_value('When implementing refunds')
        page.once('dialog', lambda dialog: dialog.dismiss())
        page.locator('header .section-tab').filter(has_text='Memory').click()
        expect(page.locator('[name="memorySummary"]')).to_have_value('Keep an audit record for refunds.')
        page.locator('[name="confirmDocument"]').check()
        page.request.post(base + '/test/fail-memory', data={'enabled': True})
        page.get_by_role('button', name='Confirm and link', exact=True).click()
        expect(page.locator('.notice')).to_contain_text('Document saved; memory link failed')
        page.locator('.document-memory-editor').evaluate('(node) => { node.open = true; }')
        expect(page.locator('[name="memorySummary"]')).to_have_value('Keep an audit record for refunds.')
        expect(page.locator('[name="readWhen"]')).to_have_value('When implementing refunds')
        page.request.post(base + '/test/fail-memory', data={'enabled': False})
        page.locator('[name="confirmDocument"]').check()
        page.get_by_role('button', name='Confirm and link', exact=True).click()
        expect(page.locator('.notice')).to_contain_text('Document saved and memory linked')
        state = page.request.get(base + '/state').json()
        assert len([e for e in state['entries'] if e['kind'] == 'document']) == 1
        linked = next(e for e in state['entries'] if e.get('documentRef'))
        stable_id = linked['documentRef']['recordId']
        memory_id = linked['id']
        page.locator('header .section-tab').filter(has_text='Memory').click()
        page.locator('.record').filter(has_text='Refund acceptance rule').click()
        expect(page.locator('.document-memory-card')).to_contain_text('Summary matches the current document')
        expect(page.locator('[name="content"]')).to_have_attribute('readonly', '')
        page.get_by_role('button', name='Read current document', exact=True).click()
        expect(page.locator('[name="content"]')).to_have_value(re.compile('Keep an audit record'))
        saved_change(page, 'content', '# Refund rule\n\nVerify receipt before refunding.')
        page.locator('header .section-tab').filter(has_text='Memory').click()
        page.locator('.record').filter(has_text='Refund acceptance rule').click()
        expect(page.locator('.document-memory-card')).to_contain_text('The document changed')
        expect(page.locator('[name="content"]')).to_be_hidden()
        page.get_by_role('button', name='Read current document', exact=True).click()
        expect(page.locator('[name="content"]')).to_have_value(re.compile('Verify receipt'))
        page.locator('.document-memory-editor > summary').click()
        page.locator('[name="memorySummary"]').fill('Verify receipt before refunding.')
        page.locator('[name="readWhen"]').fill('When implementing refunds')
        page.locator('[name="confirmDocument"]').check()
        page.get_by_role('button', name='Confirm and link', exact=True).click()
        expect(page.locator('.notice')).to_contain_text('Document saved and memory linked')
        page.locator('.document-memory-editor').evaluate('(node) => { node.open = true; }')
        page.locator('.document-memory-editor .memory-policy-editor').evaluate('(node) => { node.open = true; }')
        expect(page.locator('[name="scopePaths"]')).to_have_value('apps/payments')
        expect(page.locator('[name="coreMemory"]')).to_be_checked()
        page.locator('[name="scopePaths"]').fill('')
        page.locator('[name="coreMemory"]').uncheck()
        saved_change(page, 'title', 'Current refund rules')
        expect(page.locator('[name="scopePaths"]')).to_have_value('')
        expect(page.locator('[name="coreMemory"]')).not_to_be_checked()
        page.locator('[name="memorySummary"]').fill('Verify receipt before refunding.')
        page.locator('[name="readWhen"]').fill('When implementing refunds')
        page.locator('[name="confirmDocument"]').check()
        page.get_by_role('button', name='Confirm and link', exact=True).click()
        expect(page.locator('.notice')).to_contain_text('Document saved and memory linked')
        page.reload(wait_until='networkidle')
        page.locator('header .section-tab').filter(has_text='Memory').click()
        page.locator('.record').filter(has_text='Current refund rules').click()
        expect(page.locator('.document-memory-card')).to_contain_text('Summary matches the current document')
        state = page.request.get(base + '/state').json()
        linked = next(e for e in state['entries'] if e.get('documentRef'))
        assert linked['id'] == memory_id
        assert linked['documentRef']['recordId'] == stable_id
        assert linked['content'] == 'Verify receipt before refunding.'
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
        # Author a candidate, confirm it, restrict its scope, then withdraw confirmation.
        page.get_by_role('button', name='New record', exact=True).click()
        page.locator('[name="title"]').fill('Scoped refund candidate')
        saved_change(page, 'content', 'Scoped refund approvals require an audit receipt.')
        assert 'Scoped refund approvals' not in context_for(page, query='refund')
        page.locator('.memory-policy-editor').evaluate('(node) => { node.open = true; }')
        saved_setting(page, 'scopePaths', ['apps/payments'], lambda: page.locator('[name="scopePaths"]').fill('apps/payments'))
        page.locator('.memory-policy-editor').evaluate('(node) => { node.open = true; }')
        saved_setting(page, 'importance', 'core', lambda: page.locator('[name="coreMemory"]').check())
        page.locator('.memory-policy-editor').evaluate('(node) => { node.open = true; }')
        saved_setting(page, 'status', 'confirmed', lambda: page.locator('[name="confirmMemory"]').check())
        assert 'Scoped refund approvals' in context_for(page, query='refund', paths=['apps/payments/refund.ts'])
        assert 'Scoped refund approvals' not in context_for(page, query='refund', paths=['apps/accounts/refund.ts'])
        saved_change(page, 'title', 'Scoped refund rule')
        state = page.request.get(base + '/state').json()
        scoped = next(entry for entry in state['entries'] if entry['title'] == 'Scoped refund rule')
        assert scoped['scopePaths'] == ['apps/payments'] and scoped['importance'] == 'core'
        page.locator('.memory-policy-editor').evaluate('(node) => { node.open = true; }')
        held = []
        def hold_scope_save(route, request):
            payload = (request.post_data_json or {}).get('input', {})
            if payload.get('action') == 'save' and payload.get('scopePaths') == ['apps/payments', 'apps/billing'] and not held:
                held.append(route)
                page.evaluate('window.scopeSavePaused = true')
            else:
                route.continue_()
        page.route('**/call', hold_scope_save)
        page.locator('[name="scopePaths"]').fill('apps/payments, apps/billing')
        page.wait_for_function('window.scopeSavePaused === true')
        page.locator('[name="confirmMemory"]').uncheck()
        def draft_saved(response):
            payload = (response.request.post_data_json or {}).get('input', {}) if response.url.endswith('/call') else {}
            return payload.get('action') == 'save' and payload.get('status') == 'draft'
        with page.expect_response(draft_saved, timeout=5000) as latest:
            held[0].continue_()
        assert latest.value.ok, latest.value.json()
        page.unroute('**/call', hold_scope_save)
        state = page.request.get(base + '/state').json()
        scoped = next(entry for entry in state['entries'] if entry['title'] == 'Scoped refund rule')
        assert scoped['status'] == 'draft' and scoped['scopePaths'] == ['apps/payments', 'apps/billing']
        assert 'Scoped refund approvals' not in context_for(page, query='refund', paths=['apps/payments/refund.ts'])
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
        print('PASS: real panel -> service -> Markdown, candidate authoring/confirmation/withdrawal, scoped core memory and persisted policy, input draft preservation, partial link failure/retry, source navigation, stale summary withholding, refresh/rename/reload, private preferences, context and export')
        print('Screenshot:', screenshot)
    finally:
        browser.close()
