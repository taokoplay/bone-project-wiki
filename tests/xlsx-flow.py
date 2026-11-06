"""Real XLSX panel/service acceptance; no user workbook is modified."""
import os, base64, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
base='http://127.0.0.1:'+os.environ.get('BONE_WIKI_TEST_PORT','18900')

def call(page,action,**fields):
    workspace=page.request.get(base+'/state').json()['snapshot']['workspacePath']
    value=page.request.post(base+'/call',data={'channel':'wiki','input':{'action':action,'workspacePath':workspace,**fields}}).json()
    assert 'error' not in value,value
    return value['result']

def open_file(page,title):
    page.locator('.record').filter(has_text=title).click()
    expect(page.locator('.spreadsheet')).to_be_visible()

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1280,'height':900})
    errors,remote=[],[]
    page.set_default_timeout(5000)
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:remote.append(r.url) if not r.url.startswith(base) else None)
    try:
        page.goto(base+'/index.html',wait_until='networkidle')
        page.get_by_role('button',name='Initialize library',exact=True).click()
        fixture=page.request.post(base+'/test/xlsx-fixture').json()
        workspace=page.request.get(base+'/state').json()['snapshot']['workspacePath']
        original=Path(workspace,'.bone-project-wiki/knowledge/物料/采购清单.xlsx')
        before=hashlib.sha256(original.read_bytes()).hexdigest()
        call(page,'save',title='Return note',kind='document',category='物料',content='# Return note\n\nRetain old reading behavior.')
        page.reload(wait_until='networkidle')
        open_file(page,'采购清单.xlsx')
        expect(page.locator('.spreadsheet [data-cell="B3"]')).to_have_text('底板 & 固定件')
        expect(page.locator('.spreadsheet [data-cell="A3"]')).to_have_text('001')
        expect(page.locator('.spreadsheet [data-cell="D3"]')).to_have_text('12.50')
        expect(page.locator('.spreadsheet [data-cell="E3"]')).to_have_text('25.00')
        expect(page.locator('.spreadsheet [data-cell="F3"]')).to_have_text('2024-01-01')
        expect(page.locator('.spreadsheet [data-cell="A1"]')).to_have_attribute('colspan','6')
        expect(page.locator('.spreadsheet [data-cell="E4"]')).to_have_text('=SUM(E3:E3)')
        expect(page.locator('.spreadsheet-notes')).to_contain_text('not recalculated')
        expect(page.locator('.spreadsheet [data-cell="B4"]')).to_have_text('<img src=x onerror=alert(1)>')
        assert page.locator('.spreadsheet img, .spreadsheet script, .spreadsheet iframe, .spreadsheet a[href^="http"]').count()==0
        expect(page.get_by_role('tab',name='隐藏工作表',exact=True)).to_have_count(0)
        page.locator('[data-cell="E3"]').click()
        expect(page.locator('.spreadsheet-selection')).to_have_text('E3 · =C3*D3')
        page.get_by_role('tab',name='补充数据',exact=True).click()
        expect(page.locator('[data-cell="A1"]')).to_have_text('第二张工作表')
        page.get_by_role('button',name='Next rows',exact=True).click()
        expect(page.locator('[data-cell="A101"]')).to_have_text('分页数据')
        page.get_by_role('button',name='Collapse sidebar',exact=True).click()
        expect(page.locator('[data-cell="A101"]')).to_have_text('分页数据')
        page.get_by_role('button',name='Expand sidebar',exact=True).click()
        page.get_by_role('tab',name='物料清单',exact=True).focus()
        page.keyboard.press('Enter')
        expect(page.locator('[data-cell="A3"]')).to_have_text('001')
        page.get_by_role('tab',name='物料清单',exact=True).focus()
        page.keyboard.press('ArrowRight')
        expect(page.get_by_role('tab',name='补充数据',exact=True)).to_have_attribute('aria-selected','true')
        page.get_by_role('tab',name='物料清单',exact=True).click()
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR'])/'wiki-xlsx-preview.png'),full_page=True)
        # System failures surface inline, without an unhandled rejected promise.
        def no_app(route,request):
            if (request.post_data_json or {}).get('input',{}).get('action')=='openDefault':route.fulfill(json={'result':{'opened':False}})
            else:route.continue_()
        page.route('**/call',no_app)
        page.get_by_role('button',name='Open in system',exact=True).click()
        expect(page.locator('.spreadsheet-status[role="alert"]')).to_contain_text('file could not be opened')
        page.unroute('**/call',no_app)
        open_file(page,'导入的清单')
        expect(page.locator('[data-cell="B3"]')).to_have_text('底板 & 固定件')
        with page.expect_download() as download:
            page.get_by_role('button',name='Download workbook',exact=True).click()
        assert download.value.suggested_filename=='bom.xlsx'
        assert Path(download.value.path()).read_bytes()==base64.b64decode(fixture['base64'])
        # The public file collector and real import API accept a dragged workbook.
        page.evaluate('''encoded=>{
          const data=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
          const transfer=new DataTransfer();transfer.items.add(new File([data],'拖入清单.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
          document.body.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
        }''',fixture['base64'])
        expect(page.locator('.record').filter(has_text='拖入清单')).to_be_visible()
        expect(page.locator('.spreadsheet [data-cell="A3"]')).to_have_text('001')
        imported=next(e for e in page.request.get(base+'/state').json()['entries'] if e['title']=='拖入清单')
        assert base64.b64decode(imported['files'][0]['dataUrl'].split(',')[1])==base64.b64decode(fixture['base64'])
        open_file(page,'工作表异常.xlsx')
        expect(page.locator('[data-cell="A3"]')).to_have_text('001')
        page.get_by_role('tab',name='补充数据',exact=True).click()
        expect(page.locator('.spreadsheet-status[role="alert"]')).not_to_be_empty()
        expect(page.get_by_role('button',name='Next rows',exact=True)).to_be_disabled()
        expect(page.get_by_role('button',name='Previous rows',exact=True)).to_be_disabled()
        expect(page.locator('.spreadsheet td')).to_have_count(0)
        page.get_by_role('tab',name='物料清单',exact=True).click()
        expect(page.locator('[data-cell="A3"]')).to_have_text('001')
        open_file(page,'包含图表页.xlsx')
        expect(page.locator('[data-cell="B3"]')).to_have_text('底板 & 固定件')
        expect(page.locator('.spreadsheet [role="tab"]')).to_have_count(2)
        open_file(page,'多个工作簿')
        expect(page.locator('[data-cell="B3"]')).to_have_text('底板 & 固定件')
        page.get_by_role('button',name='Workbooks',exact=True).click()
        page.get_by_role('option',name='second.xlsx',exact=True).click()
        expect(page.locator('[data-cell="B3"]')).to_have_text('第二个工作簿')
        with page.expect_download() as second_download:
            page.get_by_role('button',name='Download workbook',exact=True).click()
        assert second_download.value.suggested_filename=='second.xlsx'
        assert Path(second_download.value.path()).read_bytes()!=base64.b64decode(fixture['base64'])
        open_file(page,'长表.xlsx')
        page.get_by_role('tab',name='补充数据',exact=True).click()
        expect(page.locator('.spreadsheet-notes')).to_contain_text('first 2,000 rows')
        open_file(page,'损坏.xlsx')
        expect(page.locator('.spreadsheet-status[role="alert"]')).not_to_be_empty()
        expect(page.get_by_role('button',name='Open in system',exact=True)).to_be_visible()
        # A late XLSX read cannot replace a newer Markdown selection.
        held=[]
        def hold_read(route,request):
            data=(request.post_data_json or {}).get('input',{})
            if data.get('action')=='read' and data.get('id')=='采购清单.xlsx' and not held:
                response=route.fetch();held.append((route,response));page.evaluate('window.xlsxReadHeld=true')
            else:route.continue_()
        page.route('**/call',hold_read)
        page.locator('.record').filter(has_text='采购清单.xlsx').click()
        page.wait_for_function('window.xlsxReadHeld===true')
        page.locator('.record').filter(has_text='Return note').click()
        expect(page.locator('.note-reader')).to_be_visible()
        held[0][0].fulfill(response=held[0][1])
        expect(page.locator('.note-reader')).to_be_visible()
        expect(page.locator('.spreadsheet')).to_have_count(0)
        page.unroute('**/call',hold_read)
        open_file(page,'采购清单.xlsx')
        expect(page.locator('[data-cell="B3"]')).to_have_text('底板 & 固定件')
        for theme in ['light','dark']:
            page.locator('html').evaluate('(node,theme)=>node.dataset.base=theme',theme)
            for width in [1280,800,390]:
                page.set_viewport_size({'width':width,'height':850})
                expect(page.get_by_role('tab',name='物料清单',exact=True)).to_be_visible()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                assert page.locator('.spreadsheet-viewport').evaluate('node=>node.clientWidth>0&&node.clientHeight>0')
        assert hashlib.sha256(original.read_bytes()).hexdigest()==before
        assert not errors,errors
        assert not remote,remote
        print('PASS: raw/imported/dragged XLSX data, worksheets, merges, leading zeros, dates, cached and missing formulas, paging, safe text, download bytes, source preservation, errors, stale reads and responsive themes')
    except Exception:
        print(page.locator('.detail').inner_text()[-2500:])
        print('Browser errors:',errors)
        page.screenshot(path=str(Path(os.environ['PI_SCRATCH_DIR'])/'wiki-xlsx-failure.png'),full_page=True)
        raise
    finally:browser.close()
