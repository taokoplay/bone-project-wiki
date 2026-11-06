"""Representative UI path for formatter reuse and fresh linked-memory search."""
import os,json,base64,io,zipfile,hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
base='http://127.0.0.1:'+os.environ.get('BONE_WIKI_TEST_PORT','18930')
def call(page,action,**fields):
 workspace=page.request.get(base+'/state').json()['snapshot']['workspacePath']
 value=page.request.post(base+'/call',data={'channel':'wiki','input':{'action':action,'workspacePath':workspace,**fields}}).json()
 assert 'error' not in value,value
 return value['result']
def column(n):
 value=''
 while n:n,r=divmod(n-1,26);value=chr(65+r)+value
 return value
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome',headless=True);page=browser.new_page(viewport={'width':1280,'height':900});page.set_default_timeout(5000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.add_init_script('''const Original=Intl.NumberFormat;window.__formatCreated=0;function CountingFormatter(...args){window.__formatCreated++;return new Original(...args);}CountingFormatter.prototype=Original.prototype;Object.setPrototypeOf(CountingFormatter,Original);Intl.NumberFormat=CountingFormatter;''')
 try:
  page.goto(base+'/index.html',wait_until='networkidle');page.get_by_role('button',name='Initialize library',exact=True).click()
  fixture=page.request.post(base+'/test/xlsx-fixture').json();data=base64.b64decode(fixture['base64'])
  with zipfile.ZipFile(io.BytesIO(data)) as z:parts={name:z.read(name) for name in z.namelist()}
  cells=[];expected=[]
  for row in range(1,101):
   values=[]
   for col in range(1,21):
    ref=f'{column(col)}{row}';number=row*1009+col;values.append(f'<c r="{ref}" s="2"><v>{number}</v></c>');expected.append([ref,f'{number:,.2f}'])
   cells.append(f'<row r="{row}">'+''.join(values)+'</row>')
  parts['xl/worksheets/sheet1.xml']=('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(cells)+'</sheetData></worksheet>').encode()
  out=io.BytesIO()
  with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
   for name,raw in parts.items():z.writestr(name,raw)
  workspace=Path(page.request.get(base+'/state').json()['snapshot']['workspacePath']);file=workspace/'.bone-project-wiki/knowledge/物料/格式化数据.xlsx';file.write_bytes(out.getvalue());before=hashlib.sha256(file.read_bytes()).hexdigest()
  linked=call(page,'remember',kind='document',category='rules',status='confirmed',title='Payment rules',content='Approved source without the summary marker.',summary='Unique approved summary for payment evidence.',readWhen='Before changing payments')
  page.reload(wait_until='networkidle');page.evaluate('window.__formatCreated=0')
  page.locator('.record').filter(has_text='格式化数据.xlsx').click()
  expect(page.locator('.spreadsheet[aria-busy="false"] td')).to_have_count(2000)
  actual=page.locator('.spreadsheet td').evaluate_all('nodes=>nodes.map(node=>[node.dataset.cell,node.textContent])')
  assert actual==expected
  assert page.evaluate('window.__formatCreated')==1
  page.locator('.record').filter(has_text='Payment rules').click();expect(page.locator('.note-reader')).to_be_visible()
  page.locator('.record').filter(has_text='格式化数据.xlsx').click();expect(page.locator('.spreadsheet[aria-busy="false"] td')).to_have_count(2000)
  assert page.evaluate('window.__formatCreated')==2,'a reopened workbook owns a new pool'
  with page.expect_response(lambda r:r.url.endswith('/call') and (r.request.post_data_json or {}).get('input',{}).get('action')=='search'):
   page.locator('.sidebar-search-input').fill('Unique')
  expect(page.locator('.records .record')).to_have_count(1)
  page.locator('.records .record').click();expect(page.get_by_role('button',name='Read current document',exact=True)).to_be_visible()
  page.get_by_role('button',name='Read current document',exact=True).click();expect(page.locator('.note-reader .article')).to_contain_text('Approved source without the summary marker.')
  current=linked['document'];call(page,'save',**{**current,'content':'Changed source; the old summary is no longer current.','expectedRevision':current['revision']})
  page.locator('.sidebar-search-input').fill('')
  with page.expect_response(lambda r:r.url.endswith('/call') and (r.request.post_data_json or {}).get('input',{}).get('action')=='search'):
   page.locator('.sidebar-search-input').fill('Unique')
  expect(page.locator('.records .record')).to_have_count(0)
  assert hashlib.sha256(file.read_bytes()).hexdigest()==before
  assert not errors,errors
  print('PASS: actual UI search -> linked memory -> current source -> changed-source exclusion; 2,000 formatted values preserved; one formatter per workbook and fresh pool on reopen; source bytes unchanged')
 finally:browser.close()
