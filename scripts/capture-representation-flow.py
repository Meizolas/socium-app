import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


root = Path(__file__).resolve().parents[1]
output = root / "prints-teste"
output.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
    page.set_default_timeout(10000)
    page.on("console", lambda message: print("BROWSER_CONSOLE", message.type, message.text))
    page.on("pageerror", lambda error: print("BROWSER_ERROR", str(error)))
    page.on("requestfailed", lambda request: print("REQUEST_FAILED", request.url, request.failure))
    page.context.add_cookies([
        {"name": "socium_session", "value": os.environ["SOCIUM_TEST_SESSION"], "url": "http://localhost:3100", "httpOnly": True, "sameSite": "Lax"},
        {"name": "socium_refresh", "value": os.environ["SOCIUM_TEST_REFRESH"], "url": "http://localhost:3100", "httpOnly": True, "sameSite": "Lax"},
    ])
    page.goto("http://localhost:3100", wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    page.screenshot(path=output / "00-estado-inicial.png", full_page=True)
    print("PAGE", page.url, json.dumps(page.locator("button").all_inner_texts(), ensure_ascii=True))
    page.evaluate("localStorage.setItem('helians:nfse-tour-v1', 'done')")
    page.get_by_role("button", name="Emitir NFS-e", exact=False).click()
    page.get_by_role("heading", name="Visão geral", exact=True).wait_for()
    page.get_by_role("button", name="Representação", exact=True).click()
    page.get_by_text("Representações recentes", exact=True).wait_for()

    unconfirmed = page.request.post("http://localhost:3100/api/nfse/representations", data={
        "issuerId": "9d0f0454-d4ad-468c-b84d-339b57a377b3",
        "certificateId": "a7b5a56a-3663-481a-a003-9db77ca01022",
        "authorizationType": "electronic_power_of_attorney",
        "allowClientIssuance": True,
        "allowCancellation": True,
    })
    assert unconfirmed.status == 400, "The API must reject activation without official confirmation."

    recent = page.locator(".nfse-recent-representation").filter(has_text="FELICIO E ALMEIDA")
    recent.get_by_role("button").click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for()
    page.screenshot(path=output / "01-validacao-representacao.png", full_page=True)

    activation = dialog.get_by_role("button", name="Ativar representação")
    assert activation.is_disabled(), "Activation must remain disabled before the official confirmation."
    dialog.locator('input[type="checkbox"]').check()
    assert activation.is_enabled(), "Activation must be enabled only after confirmation."
    page.screenshot(path=output / "02-confirmacao-obrigatoria.png", full_page=True)
    dialog.get_by_role("button", name="Cancelar").click()

    page.reload(wait_until="domcontentloaded")
    page.get_by_role("button", name="Emitir NFS-e", exact=False).click()
    page.get_by_role("heading", name="Visão geral", exact=True).wait_for()
    page.get_by_role("button", name="Representação", exact=True).click()
    blocked = page.locator(".nfse-recent-representation.blocked").filter(has_text="FELICIO E ALMEIDA")
    blocked.wait_for()
    assert "Regularização necessária" in blocked.inner_text()
    assert "E0718" in blocked.inner_text()
    page.screenshot(path=output / "03-representacao-bloqueada-e0718.png", full_page=True)

    blocked.get_by_role("button").click()
    page.get_by_role("dialog").wait_for()
    page.screenshot(path=output / "04-reativacao-apos-regularizar.png", full_page=True)
    browser.close()

print("REPRESENTATION_FLOW_SCREENSHOTS_OK")
