"""Phase A user path through the real panel, service and offline extension."""
import hashlib
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + os.environ['BONE_WIKI_TEST_PORT']


def call(page, action, **fields):
    workspace = page.request.get(base + '/state').json()['snapshot']['workspacePath']
    response = page.request.post(base + '/call', data={'channel': 'wiki', 'input': {'action': action, 'workspacePath': workspace, **fields}})
    body = response.json()
    assert response.ok and 'error' not in body, body
    return body['result']


def pick(page, name, value):
    page.locator(f'[data-select="{name}"] .select-trigger').click()
    page.locator(f'.popover [role="option"][data-value="{value}"]').click()


def preview(page):
    with page.expect_response(lambda response: response.url.endswith('/call') and (response.request.post_data_json or {}).get('input', {}).get('explain') is True):
        page.get_by_role('button', name='Preview recall', exact=True).click()
    expect(page.locator('.mo-preview-output .mo-usage')).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 1000})
    page.set_default_timeout(5000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        page.get_by_role('button', name='Initialize library', exact=True).click()
        common = {'kind': 'memory', 'category': 'memory', 'status': 'confirmed'}
        core = call(page, 'save', **common, title='Refund audit', content='Refunds retain an audit receipt.', importance='core', scopePaths=['apps/payments'], topics=['Payments'])
        ordinary = call(page, 'save', **common, title='Layout preference', content='Use compact margins.')
        draft = call(page, 'save', **{**common, 'status': 'draft'}, title='Pending refund allowance', content='Unconfirmed allowance marker must remain hidden.')
        long = call(page, 'save', **common, title='Refund exceptions', content=('Refund exceptions require an original receipt. ' * 12).strip())
        linked = call(page, 'remember', kind='document', category='business', status='confirmed', title='Refund source', content='# Refund source rules\n\nRefunds need a receipt.', summary='Refunds need a receipt.', readWhen='Before changing refund policy')
        assert linked['linked']
        before = page.request.get(base + '/state').json()
        workspace = Path(before['snapshot']['workspacePath'])
        saved_bytes = {entry['path']: (workspace / entry['path']).read_bytes() for entry in before['entries']}
        prepared = page.request.post(base + '/test/prepare-memory', data={'query': 'Implement refund in apps/payments/refund.ts private-query-573'})
        assert prepared.ok and not prepared.json()['notices'], prepared.json()
        traces = call(page, 'memoryTraces')
        assert len(traces['traces']) == 1
        assert traces['traces'][0]['contextHash'] == hashlib.sha256(prepared.json()['prepared']['systemPrompt'].removeprefix('TEST BASE\n\n').encode()).hexdigest()
        assert 'private-query-573' not in str(traces)
        assert 'Refunds retain an audit receipt.' not in str(traces)

        page.reload(wait_until='networkidle')
        page.get_by_role('tab', name='Memory', exact=True).click()
        expect(page.get_by_role('heading', name='Memory overview', exact=True)).to_be_visible()
        expect(page.locator('.mo-record')).to_have_count(5)
        assert all((workspace / path).read_bytes() == data for path, data in saved_bytes.items()), 'Read-only overview must not rewrite the source'
        page.get_by_role('button', name='Core rules', exact=True).click()
        expect(page.locator('.mo-record')).to_have_count(1)
        expect(page.locator('.mo-record')).to_contain_text('Refund audit')
        page.get_by_role('button', name='Topics', exact=True).click()
        expect(page.locator('.mo-record')).to_have_count(1)
        page.get_by_role('button', name='Candidates', exact=True).click()
        expect(page.locator('.mo-record')).to_contain_text('Pending refund allowance')
        expect(page.locator('.mo-record .mo-fact')).to_have_count(0)
        expect(page.locator('.memory-overview')).not_to_contain_text('Unconfirmed allowance marker must remain hidden.')
        page.get_by_role('button', name='All', exact=True).click()
        overview = call(page, 'memoryOverview')
        keys = {entry['id']: entry['key'] for entry in overview['entries']}
        page.locator('[name="memoryQuery"]').fill('refund')
        preview(page)
        omitted = page.locator(f'.mo-preview-output .mo-decision[data-memory-key="{keys[core["id"]]}"]')
        page.locator('.mo-preview-output details').evaluate_all('nodes => nodes.forEach(node => node.open = true)')
        expect(omitted).to_contain_text('The task does not name a matching project path.')
        page.locator('[name="memoryPaths"]').fill('apps/payments/refund.ts')
        preview(page)
        core_decision = page.locator(f'.mo-preview-output .mo-decision[data-memory-key="{keys[core["id"]]}"]')
        expect(core_decision.locator('.mo-fact')).to_have_text(core['content'])
        expect(core_decision).not_to_contain_text('Updated since preparation')
        expect(page.locator('.mo-preview-output')).to_contain_text('1200 characters')
        long_decision = page.locator(f'.mo-preview-output .mo-decision[data-memory-key="{keys[long["id"]]}"]')
        expect(long_decision).to_contain_text('The complete fact exceeds the per-entry limit.')
        expect(long_decision.locator('.mo-fact')).to_have_count(0)
        pick(page, 'memoryMode', 'manual')
        preview(page)
        expect(long_decision.locator('.mo-fact')).to_have_text(long['content'])
        expect(page.locator('.mo-preview-output')).to_contain_text('10000 characters')
        assert len(call(page, 'memoryTraces')['traces']) == 1, 'Manual previews do not write trace files'

        page.locator('.mo-preparations > summary').click()
        page.locator('.mo-trace > summary').first.click()
        expect(page.locator('.mo-preparations')).to_contain_text('do not confirm that a model consumed it')
        expect(page.locator('.mo-preparations .mo-fact')).to_have_count(0)
        expect(page.locator('.mo-preparations')).not_to_contain_text('private-query-573')

        # Source navigation uses stable document identity, never a filename guess.
        source_card = page.locator(f'.mo-record[data-memory-key="{keys[linked["memory"]["id"]]}"]')
        source_card.get_by_role('button', name='Read source', exact=True).click()
        expect(page.locator('.note-reader .article h1')).to_have_text('Refund source rules')
        call(page, 'save', **{**linked['document'], 'content': '# Current refund rules\n\nRefunds need an invoice.', 'expectedRevision': linked['document']['revision']})
        page.get_by_role('tab', name='Memory', exact=True).click()
        expect(source_card).to_contain_text('Source changed')
        expect(source_card.locator('.mo-fact')).to_have_count(0)

        # Opening/new authoring and returning to the overview retain original editor behavior.
        page.get_by_role('button', name='New memory', exact=True).click()
        page.locator('.note-editor [name="title"]').fill('New overview note')
        page.locator('.note-editor [name="content"]').fill('New memory stays a candidate until confirmed.')
        expect(page.locator('.notice')).to_contain_text('Saved')
        page.get_by_role('button', name='Read mode', exact=True).click()
        page.get_by_role('button', name='Memory overview', exact=True).click()
        expect(page.locator('.mo-record')).to_have_count(6)

        # A preview completing after newer input is visibly stale and cannot replace it.
        held = []
        def hold_context(route, request):
            payload = (request.post_data_json or {}).get('input', {})
            if payload.get('action') == 'context' and payload.get('explain') and not held:
                held.append(route)
                page.evaluate('window.overviewPreviewHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_context)
        page.locator('[name="memoryQuery"]').fill('refund')
        page.get_by_role('button', name='Preview recall', exact=True).click()
        page.wait_for_function('window.overviewPreviewHeld === true')
        page.locator('[name="memoryQuery"]').fill('layout')
        held[0].continue_()
        expect(page.locator('.mo-preview-output')).to_contain_text('Inputs changed.')
        expect(page.locator('[name="memoryQuery"]')).to_have_value('layout')
        expect(page.locator('.mo-preview-output .mo-fact')).to_have_count(0)
        page.unroute('**/call', hold_context)
        preview(page)
        expect(page.locator('.mo-preview-output')).to_contain_text('Use compact margins.')
        page.locator('[name="memoryPaths"]').fill('apps/payments')
        page.get_by_role('button', name='Refresh overview', exact=True).click()
        expect(page.locator('[name="memoryQuery"]')).to_have_value('layout')
        expect(page.locator('[name="memoryPaths"]')).to_have_value('apps/payments')
        expect(page.locator('.mo-record')).to_have_count(6)
        for theme in ['light', 'dark']:
            page.evaluate('(theme) => { document.documentElement.dataset.base = theme; document.documentElement.dataset.theme = theme; }', theme)
            for width in [1280, 800, 390]:
                page.set_viewport_size({'width': width, 'height': 1000})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (theme, width)
        page.set_viewport_size({'width': 1280, 'height': 1000})
        page.locator('.detail').evaluate('node => node.scrollTop = 0')
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR']) / 'wiki-memory-overview-acceptance.png'), full_page=True)
        assert not errors, errors
        print('PASS: real memory overview, source/candidate integrity, groups, automatic/manual recall explanation, prepared trace privacy, navigation/authoring, late preview guards and responsive themes')
    except Exception:
        print('Panel:', page.locator('body').inner_text()[-6500:])
        print('Errors:', errors)
        raise
    finally:
        browser.close()
