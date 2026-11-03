import os
import sys
import time
from playwright.sync_api import sync_playwright

pkg_path = "/Users/xutaoyu/CodeSource/PI-Plugins/bone-project-wiki/dist/bone.project-wiki-0.1.0.piplug"

print("=" * 60)
print("启动 Chrome 协助提交插件到官方平台：https://plugins.aiuo.net")
print("=" * 60)

with sync_playwright() as p:
    # 启动可见界面的 Chrome 窗口
    browser = p.chromium.launch(channel="chrome", headless=False)
    context = browser.new_context(viewport={"width": 1280, "height": 850})
    page = context.new_page()

    target_url = "https://plugins.aiuo.net/console/publish/upload"
    page.goto(target_url)

    print("已在浏览器中打开插件发布上传页面。")
    print("若尚未登录，请在弹出的浏览器中登录您的账号（支持 GitHub 快捷登录）。")
    print("一旦检测到登录成功，脚本将自动选择插件安装包并提交...")

    uploaded = False
    for i in range(180):
        url = page.url
        if "/console/publish/upload" in url and "/login" not in url:
            print(f"[{i}s] 检测到已进入控制台上传页面: {url}")
            page.wait_for_timeout(1500)

            file_inputs = page.locator('input[type="file"]')
            if file_inputs.count() > 0:
                print(f"--> 自动附加插件安装包文件: {pkg_path}")
                file_inputs.first.set_input_files(pkg_path)
                page.wait_for_timeout(3000)

                # 检查页面上的解析结果或确认按钮
                confirm_buttons = page.locator('button:has-text("确认"), button:has-text("提交"), button:has-text("发布"), button:has-text("下一步"), button[type="submit"]')
                btn_count = confirm_buttons.count()
                print(f"--> 找到可用操作按钮数量: {btn_count}")
                for b_idx in range(btn_count):
                    b = confirm_buttons.nth(b_idx)
                    txt = b.inner_text().strip()
                    print(f"    按钮 {b_idx + 1}: {txt}")

                uploaded = True
                print("--> 插件包已成功载入上传表单！")
                print("--> 您可以在浏览器中查看校验详情，并点击最终确认提交。")
                # 保持窗口打开 60 秒让用户查看
                page.wait_for_timeout(60000)
                break
        time.sleep(1)

    if not uploaded:
        print("等待超时或页面未完成登录。")
    browser.close()
