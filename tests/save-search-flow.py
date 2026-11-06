"""Save reconciliation, first-click safety and latest search through the real service."""
import os
from playwright.sync_api import sync_playwright, expect

base = 'http://127.0.0.1:' + os.environ.get('BONE_WIKI_TEST_PORT', '18940')


def call(page, action, **fields):
    workspace = page.request.get(base + '/state').json()['snapshot']['workspacePath']
    response = page.request.post(base + '/call', data={'channel': 'wiki', 'input': {'action': action, 'workspacePath': workspace, **fields}})
    body = response.json()
    assert response.ok and 'error' not in body, body
    return body['result']


def channel(response, name):
    return response.url.endswith('/call') and (response.request.post_data_json or {}).get('channel') == name


with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 960})
    page.set_default_timeout(6000)
    errors, calls = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: calls.append(request.post_data_json) if request.url.endswith('/call') else None)
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        page.get_by_role('button', name='Initialize library', exact=True).click()
        source = '# Source rules\n\n' + '\n'.join('Rule line ' + str(i) for i in range(150))
        original = call(page, 'save', title='Source rules', category='rules', kind='document', status='confirmed', content=source)
        call(page, 'save', title='Neighbor rule', category='rules', kind='document', content='Neighbor content.')
        call(page, 'save', title='Other folder', category='other', kind='document', content='Unchanged folder.')
        page.reload(wait_until='networkidle')
        caps = page.request.get(base + '/state').json()['snapshot']['requestCapabilities']
        assert caps == {'schemaVersion': 1, 'latestSearch': True, 'saveSnapshot': True}, caps
        page.locator('.tree-group[data-category="other"] .tree-folder').click()
        page.locator('.record').filter(has_text='Source rules').click()
        page.get_by_role('button', name='Edit record', exact=True).click()
        page.locator('.document-memory-editor').evaluate('(node) => { node.open = true; }')
        page.locator('[name="memorySummary"]').fill('Retain this unfinished source summary.')
        page.locator('[name="readWhen"]').fill('Before changing source rules')
        page.locator('.document-memory-editor .memory-policy-editor').evaluate('(node) => { node.open = true; }')
        page.locator('[name="scopePaths"]').fill('apps/rules')
        page.locator('[name="coreMemory"]').check()
        page.evaluate('''() => {
          window.kept = Object.fromEntries(['.note-editor', '[name="title"]', '[name="content"]', '.sidebar-search-input', '[name="memorySummary"]', '[name="scopePaths"]'].map(selector => [selector, document.querySelector(selector)]));
          window.keptRow = [...document.querySelectorAll('.record')].find(node => node.textContent === 'Source rules');
        }''')
        held = []
        renamed = 'Renamed source rules'
        def hold_rename(route, request):
            envelope = request.post_data_json or {}
            payload = envelope.get('input', {})
            if envelope.get('channel') == 'wiki.save' and payload.get('title') == renamed and not held:
                response = route.fetch()
                assert response.ok, response.text()
                held.append((route, response))
                page.evaluate('window.renameHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_rename)
        page.locator('[name="title"]').fill(renamed)
        page.wait_for_function('window.renameHeld === true')
        # A real held click on another row must keep its target and rectangle
        # while the save changes ordering and record metadata.
        target = page.locator('.record').filter(has_text='Neighbor rule')
        rect = target.bounding_box()
        page.mouse.move(rect['x'] + 35, rect['y'] + rect['height'] / 2)
        page.mouse.down()
        page.evaluate('window.heldTarget = [...document.querySelectorAll(".record")].find(node => node.textContent === "Neighbor rule")')
        held[0][0].fulfill(response=held[0][1])
        expect(page.locator('.notice')).to_have_text('Saved')
        assert page.evaluate('''document.querySelector('[name="title"]') === kept['[name="title"]']''')
        assert page.evaluate('heldTarget.isConnected')
        assert target.bounding_box() == rect
        expect(page.locator('[name="memorySummary"]')).to_have_value('Retain this unfinished source summary.')
        expect(page.locator('[name="scopePaths"]')).to_have_value('apps/rules')
        expect(page.locator('[name="coreMemory"]')).to_be_checked()
        # Explicit navigation may discard the draft after the held click finishes.
        page.once('dialog', lambda dialog: dialog.accept())
        page.mouse.up()
        expect(page.locator('.note-reader')).to_contain_text('Neighbor rule')
        page.unroute('**/call', hold_rename)
        returned = held[0][1].json()['result']
        expected_order = [entry['title'] for entry in returned['snapshot']['sections']['knowledge']['entries'] if entry['category'] == 'rules' and entry['status'] != 'archived']
        actual_order = page.locator('.tree-group[data-category="rules"] .record strong').all_text_contents()
        assert actual_order == expected_order, (actual_order, expected_order)
        assert page.evaluate('keptRow.isConnected && keptRow.textContent === "Renamed source rules"')
        expect(page.locator('.tree-group[data-category="other"] .tree-folder')).to_have_attribute('aria-expanded', 'false')
        # Reused handlers resolve the renamed path, including an already-open menu.
        page.locator('.record').filter(has_text=renamed).click(button='right')
        with page.expect_response(lambda response: channel(response, 'fs.reveal')):
            page.get_by_role('menuitem', name='Reveal in File Manager').click()
        host_actions = page.request.get(base + '/state').json()['hostActions']
        assert host_actions[-1]['path'] == returned['entry']['path'], host_actions
        page.locator('.record').filter(has_text=renamed).click()
        page.get_by_role('button', name='Edit record', exact=True).click()
        page.locator('.document-memory-editor').evaluate('(node) => { node.open = true; }')
        page.locator('[name="memorySummary"]').fill('Current rules require a checked source.')
        page.locator('[name="readWhen"]').fill('When changing source rules')
        page.locator('.document-memory-editor .memory-policy-editor').evaluate('(node) => { node.open = true; }')
        page.locator('[name="scopePaths"]').fill('apps/rules')
        page.locator('[name="coreMemory"]').check()
        # A plain autosave keeps input, selection, scroll, focus and policy DOM.
        content = source + '\nAutosaved body with latest input.'
        with page.expect_response(lambda response: channel(response, 'wiki.save') and (response.request.post_data_json or {}).get('input', {}).get('content') == content):
            page.locator('[name="content"]').fill(content)
            page.evaluate('''() => {
              window.keptEditor = document.querySelector('.note-editor');
              window.keptContent = document.querySelector('[name="content"]');
              window.keptSummary = document.querySelector('[name="memorySummary"]');
              window.keptScope = document.querySelector('[name="scopePaths"]');
              keptContent.focus(); keptContent.setSelectionRange(17, 29); keptContent.scrollTop = 300;
              window.keptScroll = keptContent.scrollTop;
            }''')
        expect(page.locator('.notice')).to_have_text('Saved')
        assert page.evaluate('''() => document.querySelector('.note-editor') === keptEditor && document.querySelector('[name="content"]') === keptContent && document.activeElement === keptContent && keptContent.selectionStart === 17 && keptContent.selectionEnd === 29 && keptContent.scrollTop === keptScroll && document.querySelector('[name="memorySummary"]') === keptSummary && document.querySelector('[name="scopePaths"]') === keptScope''')
        expect(page.locator('[name="memorySummary"]')).to_have_value('Current rules require a checked source.')
        expect(page.locator('[name="scopePaths"]')).to_have_value('apps/rules')
        expect(page.locator('[name="coreMemory"]')).to_be_checked()
        saved = call(page, 'read', recordId=original['recordId'])
        page.locator('[name="confirmDocument"]').check()
        with page.expect_response(lambda response: response.url.endswith('/call') and (response.request.post_data_json or {}).get('input', {}).get('action') == 'remember') as remembered:
            page.get_by_role('button', name='Confirm and link', exact=True).click()
        assert remembered.value.request.post_data_json['input']['expectedRevision'] == saved['revision']
        expect(page.locator('.notice')).to_contain_text('Document saved and memory linked')
        # A committed save with an unavailable refresh retains its revision and
        # newer input; the immediately following save must not conflict.
        if page.locator('.note-reader').count():
            page.get_by_role('button', name='Edit record', exact=True).click()
        partial, next_partial = [], []
        partial_content = content + '\nPartial refresh operation.'
        newest = content + '\nNewest input after partial refresh.'
        def partial_refresh(route, request):
            envelope = request.post_data_json or {}
            if envelope.get('channel') == 'wiki.save' and envelope.get('input', {}).get('content') == partial_content and not partial:
                response = route.fetch()
                body = response.json()
                assert body['result']['entry']['revision']
                body['result']['snapshot'] = None
                body['result']['refreshError'] = 'REFRESH_FAILED'
                partial.append((route, body))
                page.evaluate('window.partialHeld = true')
            elif envelope.get('channel') == 'wiki.save' and envelope.get('input', {}).get('content') == newest and partial:
                next_partial.append(route)
                page.evaluate('window.nextPartialHeld = true')
            else:
                route.continue_()
        page.route('**/call', partial_refresh)
        page.locator('[name="content"]').fill(partial_content)
        page.wait_for_function('window.partialHeld === true')
        page.locator('[name="content"]').fill(newest)
        partial[0][0].fulfill(json=partial[0][1])
        page.wait_for_function('window.nextPartialHeld === true')
        expect(page.locator('.notice')).to_contain_text('Document saved; the file list could not be refreshed')
        expect(page.locator('[name="content"]')).to_have_value(newest)
        with page.expect_response(lambda response: channel(response, 'wiki.save') and (response.request.post_data_json or {}).get('input', {}).get('content') == newest) as latest_save:
            next_partial[0].continue_()
        assert latest_save.value.request.post_data_json['input']['expectedRevision'] == partial[0][1]['result']['entry']['revision']
        assert latest_save.value.ok and 'error' not in latest_save.value.json()
        expect(page.locator('[name="content"]')).to_have_value(newest)
        expect(page.locator('.note-editor')).to_be_visible()
        page.unroute('**/call', partial_refresh)
        assert call(page, 'read', recordId=original['recordId'])['content'] == newest
        # New search text entered while a save response is held survives applying
        # the returned snapshot.
        preserved = []
        search = page.locator('.sidebar-search-input')
        preserved_content = newest + '\nSearch text survives this save.'
        def hold_for_search(route, request):
            envelope = request.post_data_json or {}
            if envelope.get('channel') == 'wiki.save' and envelope.get('input', {}).get('content') == preserved_content and not preserved:
                response = route.fetch(); preserved.append((route, response)); page.evaluate('window.saveForSearchHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_for_search)
        page.locator('[name="content"]').fill(preserved_content)
        page.wait_for_function('window.saveForSearchHeld === true')
        with page.expect_response(lambda response: channel(response, 'wiki.search')):
            search.fill('Newest input')
        preserved[0][0].fulfill(response=preserved[0][1])
        expect(page.locator('.notice')).to_have_text('Saved')
        expect(search).to_have_value('Newest input')
        expect(page.locator('.records .record')).to_have_count(1)
        expect(page.locator('.records .record')).to_contain_text(renamed)
        page.unroute('**/call', hold_for_search)
        # Superseded requests never restore old results.
        late = []
        def hold_search(route, request):
            envelope = request.post_data_json or {}
            if envelope.get('channel') == 'wiki.search' and envelope.get('input', {}).get('query') == 'Neighbor' and not late:
                response = route.fetch(); late.append((route, response, envelope['input'])); page.evaluate('window.searchHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_search)
        search = page.locator('.sidebar-search-input')
        search.fill('Neighbor'); page.wait_for_function('window.searchHeld === true')
        # This cancellation must be sent before waiting for another debounce.
        with page.expect_request(lambda request: request.url.endswith('/call') and (request.post_data_json or {}).get('channel') == 'wiki.search.cancel') as cancelled:
            search.fill('Newest input')
        cancellation = cancelled.value.post_data_json
        old_request = late[0][2]
        assert cancellation['input']['clientId'] == old_request['clientId']
        assert cancellation['input']['sequence'] > old_request['sequence']
        expect(page.locator('.records .record')).to_have_count(1)
        expect(page.locator('.records .record')).to_contain_text(renamed)
        late[0][0].fulfill(response=late[0][1])
        expect(page.locator('.records .record')).to_have_count(1)
        expect(page.locator('.records .record')).to_contain_text(renamed)
        page.unroute('**/call', hold_search)
        with page.expect_request(lambda request: request.url.endswith('/call') and (request.post_data_json or {}).get('channel') == 'wiki.search.cancel'):
            search.fill('')
        expect(page.locator('.records .record')).to_have_count(3)
        page.get_by_role('button', name='New record', exact=True).click()
        page.evaluate('window.newEditor = document.querySelector(".note-editor")')
        with page.expect_response(lambda response: channel(response, 'wiki.save')) as created:
            page.locator('[name="content"]').fill('# Generated title\n\nCreated without a separate title.')
        assert created.value.json()['result']['entry']['title'] == 'Generated title'
        expect(page.get_by_role('button', name='Read mode', exact=True)).to_be_visible()
        assert page.evaluate('newEditor === document.querySelector(".note-editor")')
        with page.expect_response(lambda response: channel(response, 'wiki.save')) as generated:
            page.locator('[name="content"]').fill('# Changed body heading\n\nThe generated file title stays fixed.')
        assert generated.value.json()['result']['entry']['title'] == 'Generated title'
        page.get_by_role('button', name='Read mode', exact=True).click()
        expect(page.locator('.note-reader .article h1')).to_have_text('Changed body heading')
        # A menu opened before a rename must use the new path and revision
        # when its action is eventually chosen.
        page.get_by_role('button', name='Edit record', exact=True).click()
        menu_save = []
        def hold_menu_save(route, request):
            envelope = request.post_data_json or {}
            if envelope.get('channel') == 'wiki.save' and envelope.get('input', {}).get('title') == 'Generated menu title' and not menu_save:
                response = route.fetch(); menu_save.append((route, response)); page.evaluate('window.menuSaveHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_menu_save)
        page.locator('[name="title"]').fill('Generated menu title')
        page.wait_for_function('window.menuSaveHeld === true')
        page.locator('.record').filter(has_text='Generated title').click(button='right')
        menu_save[0][0].fulfill(response=menu_save[0][1])
        expect(page.locator('.record').filter(has_text='Generated menu title')).to_be_visible()
        page.evaluate('window.menuEditor = document.querySelector(".note-editor")')
        page.get_by_role('menuitem', name='Move to…').click()
        with page.expect_response(lambda response: response.url.endswith('/call') and (response.request.post_data_json or {}).get('input', {}).get('action') == 'move') as moved:
            page.locator('.popover.context-menu .popover-option-label').filter(has_text='rules').click()
        assert moved.value.request.post_data_json['input']['expectedRevision'] == menu_save[0][1].json()['result']['entry']['revision']
        assert moved.value.ok and 'error' not in moved.value.json()
        page.wait_for_function('document.querySelector(".note-editor") !== window.menuEditor')
        page.unroute('**/call', hold_menu_save)
        with page.expect_response(lambda response: channel(response, 'wiki.save')) as before_delete:
            page.locator('[name="content"]').fill('Latest body before deletion through a reused tree row.')
        page.locator('.record').filter(has_text='Generated menu title').click(button='right')
        page.once('dialog', lambda dialog: dialog.accept())
        with page.expect_response(lambda response: response.url.endswith('/call') and (response.request.post_data_json or {}).get('input', {}).get('action') == 'delete') as deleted:
            page.get_by_role('menuitem', name='Delete', exact=False).click()
        assert deleted.value.request.post_data_json['input']['expectedRevision'] == before_delete.value.json()['result']['entry']['revision']
        assert deleted.value.ok and 'error' not in deleted.value.json()
        expect(page.locator('.records .record')).to_have_count(3)
        # Workspace invalidation cancels the old generation immediately and a
        # response from that generation cannot repopulate the refreshed tree.
        project_late = []
        def hold_project_search(route, request):
            envelope = request.post_data_json or {}
            if envelope.get('channel') == 'wiki.search' and envelope.get('input', {}).get('query') == 'Neighbor' and not project_late:
                response = route.fetch(); project_late.append((route, response)); page.evaluate('window.projectSearchHeld = true')
            else:
                route.continue_()
        page.route('**/call', hold_project_search)
        search.fill('Neighbor'); page.wait_for_function('window.projectSearchHeld === true')
        with page.expect_request(lambda request: request.url.endswith('/call') and (request.post_data_json or {}).get('channel') == 'wiki.search.cancel'):
            page.evaluate("window.wikiTestEvent('workspace:changed')")
        expect(page.locator('.records .record')).to_have_count(3)
        project_late[0][0].fulfill(response=project_late[0][1])
        expect(page.locator('.sidebar-search-input')).to_have_value('')
        expect(page.locator('.records .record')).to_have_count(3)
        page.unroute('**/call', hold_project_search)
        with page.expect_request(lambda request: request.url.endswith('/call') and (request.post_data_json or {}).get('channel') == 'wiki.search.cancel'):
            page.evaluate("window.dispatchEvent(new Event('pagehide'))")
        assert not errors, errors
        print('PASS: combined save/caps, retained editor/selection/focus/scroll, stable tree/order/expansion, physical first click during rename, fresh menu/reveal/move/delete and association revisions, summary/policy drafts, partial refresh/newer input, immediate search replacement/clear/project/pagehide cancellation and late-result guards')
    finally:
        browser.close()
