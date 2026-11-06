"""Real panel regressions for file selection while automatic focus sync runs."""
import os
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + os.environ['BONE_WIKI_TEST_PORT']


def action(response):
    if not response.url.endswith('/call') or response.request.method != 'POST':
        return None
    return (response.request.post_data_json or {}).get('input', {}).get('action')


def call(page, name, **fields):
    snapshot = page.request.get(base + '/state').json()['snapshot']
    response = page.request.post(base + '/call', data={
        'channel': 'wiki', 'input': {'action': name, 'workspacePath': snapshot['workspacePath'], **fields}
    })
    body = response.json()
    assert response.ok and 'error' not in body, body
    return body['result']


def focus(page):
    page.evaluate("window.dispatchEvent(new Event('focus'))")


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.set_default_timeout(5000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        page.get_by_role('button', name='Initialize library', exact=True).click()
        first = call(page, 'save', title='First selection note', kind='document', category='general', content='# Opens on one click\n\nInitial source.')
        second = call(page, 'save', title='Second selection note', kind='document', category='general', content='# Second document\n')
        page.reload(wait_until='networkidle')
        record = page.locator('.record').filter(has_text='First selection note')
        expect(record).to_be_visible()

        # Activation arrives between the physical mouse press and release. No
        # synthetic .click() or retry can conceal a replaced mouse target.
        rect = record.bounding_box()
        page.mouse.move(rect['x'] + 30, rect['y'] + rect['height'] / 2)
        page.mouse.down()
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            focus(page)
        page.mouse.up()
        expect(page.locator('.note-reader .article h1')).to_have_text('Opens on one click')
        expect(record).to_have_attribute('aria-pressed', 'true')

        # A late focus snapshot must not replace a newer file selection.
        held = []
        def hold_snapshot(route, request):
            payload = (request.post_data_json or {}).get('input', {})
            if payload.get('action') == 'snapshot' and not held:
                held.append(route)
                page.evaluate('window.focusSnapshotHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_snapshot)
        focus(page)
        page.wait_for_function('window.focusSnapshotHeld === true')
        page.locator('.record').filter(has_text='Second selection note').click()
        expect(page.locator('.note-reader .article h1')).to_have_text('Second document')
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            held[0].continue_()
        page.unroute('**/call', hold_snapshot)
        expect(page.locator('.note-reader .article h1')).to_have_text('Second document')

        # Focus during an in-flight read must not invalidate that read.
        held_reads = []
        def hold_read(route, request):
            payload = (request.post_data_json or {}).get('input', {})
            if payload.get('action') == 'read' and payload.get('recordId', payload.get('id')) in [first['recordId'], first['id']] and not held_reads:
                held_reads.append(route)
                page.evaluate('window.focusReadHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_read)
        page.locator('.record').filter(has_text='First selection note').click()
        page.wait_for_function('window.focusReadHeld === true')
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            focus(page)
        held_reads[0].continue_()
        expect(page.locator('.note-reader .article h1')).to_have_text('Opens on one click')
        page.unroute('**/call', hold_read)

        # An unchanged focus sync keeps the actual reader and current selection.
        page.locator('.note-reader').evaluate('node => { window.readerBeforeFocus = node; }')
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            focus(page)
        expect(page.locator('.record').filter(has_text='First selection note')).to_have_attribute('aria-pressed', 'true')
        assert page.evaluate('window.readerBeforeFocus === document.querySelector(".note-reader")')

        # External changes still synchronize on app activation, including a new
        # file and changed content in the current read-only document.
        current = call(page, 'read', recordId=first['recordId'])
        call(page, 'save', **{**current, 'content': '# Updated outside the panel\n', 'expectedRevision': current['revision']})
        call(page, 'save', title='Externally added note', kind='document', category='general', content='Visible after activation.')
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            focus(page)
        expect(page.locator('.record').filter(has_text='Externally added note')).to_be_visible()
        expect(page.locator('.note-reader .article h1')).to_have_text('Updated outside the panel')

        # A clean editor keeps focus/caret; a draft typed during a held snapshot
        # cannot be overwritten when that snapshot completes.
        page.get_by_role('button', name='Edit record', exact=True).click()
        editor = page.locator('.note-editor [name="content"]')
        editor.evaluate('node => { window.editorBeforeFocus = node; node.focus(); node.setSelectionRange(4, 4); }')
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            focus(page)
        assert page.evaluate('window.editorBeforeFocus === document.querySelector(".note-editor [name=content]")')
        held.clear()
        page.evaluate('window.focusSnapshotHeld = false')
        page.route('**/call', hold_snapshot)
        focus(page)
        page.wait_for_function('window.focusSnapshotHeld === true')
        editor.fill('# Keep input during synchronization\n')
        with page.expect_response(lambda response: action(response) == 'snapshot'):
            held[0].continue_()
        page.unroute('**/call', hold_snapshot)
        expect(editor).to_have_value('# Keep input during synchronization\n')
        page.get_by_role('button', name='Read mode', exact=True).click()
        expect(page.locator('.note-reader .article h1')).to_have_text('Keep input during synchronization')
        assert call(page, 'read', recordId=first['recordId'])['content'] == '# Keep input during synchronization\n'
        assert not errors, errors
        print('PASS: one physical click during activation, late focus snapshots, focus during reads, retained selection/editor, external synchronization and in-flight input protection')
    finally:
        browser.close()
