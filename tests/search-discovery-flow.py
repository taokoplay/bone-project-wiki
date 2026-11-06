"""Externally discovered search results remain actionable before a panel snapshot refresh."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
base = 'http://127.0.0.1:' + os.environ.get('BONE_WIKI_TEST_PORT', '18950')
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1280, 'height': 900})
    page.set_default_timeout(5000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(base + '/index.html', wait_until='networkidle')
        page.get_by_role('button', name='Initialize library', exact=True).click()
        root = Path(page.request.get(base + '/state').json()['snapshot']['workspacePath'])
        file = root / '.bone-project-wiki/knowledge/external/External discovery.md'
        file.parent.mkdir(parents=True, exist_ok=True)
        original = '# External discovery\n\nFreshdiscoverymarker preserves this external source.\n'
        file.write_text(original)
        page.locator('.sidebar-search-input').fill('Freshdiscoverymarker')
        row = page.locator('.records .record')
        expect(row).to_have_count(1)
        row.click()
        expect(page.locator('.note-reader .article')).to_contain_text('Freshdiscoverymarker')
        expect(row).to_have_count(1)
        row.click(button='right')
        with page.expect_response(lambda response: response.url.endswith('/call') and (response.request.post_data_json or {}).get('channel') == 'fs.reveal'):
            page.get_by_role('menuitem', name='Reveal in File Manager').click()
        state = page.request.get(base + '/state').json()
        assert state['hostActions'][-1]['path'] == '.bone-project-wiki/knowledge/external/External discovery.md', state['hostActions']
        assert file.read_text() == original
        assert not errors, errors
        print('PASS: external file discovered by search opens and reveals before panel snapshot refresh; source unchanged')
    finally:
        browser.close()
