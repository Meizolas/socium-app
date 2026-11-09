# -*- coding: utf-8 -*-
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True);page=browser.new_page(accept_downloads=True);page.goto('http://127.0.0.1:3100')
 page.get_by_placeholder('E-mail').fill('nfse.local@example.test');page.get_by_placeholder('Senha').fill('Local-Nfse-2026!');page.get_by_role('button',name='Entrar').click();page.get_by_text('SIMULA',exact=False).first.wait_for()
 page.get_by_text('Cadastrar empresa emissora',exact=True).click();page.get_by_placeholder('CNPJ',exact=True).fill('11222333000181');page.get_by_placeholder('Razão social',exact=True).fill('Empresa Sintética Socium Ltda');page.get_by_placeholder('Município IBGE').fill('3550308');page.get_by_placeholder('Regime tributário').fill('Simples Nacional');page.get_by_role('button',name='Cadastrar emitente').click()
 page.get_by_placeholder('Nome do serviço').fill('Serviço sintético');page.get_by_placeholder('Código nacional').fill('010101');page.get_by_placeholder('Descrição fiscal').fill('Serviço sintético exclusivo para teste local');page.get_by_role('button',name='Cadastrar serviço').click()
 page.get_by_placeholder('CNPJ do tomador').fill('99888777000166');page.get_by_placeholder('Razão social',exact=True).last.fill('Tomador Sintético Ltda');page.get_by_placeholder('E-mail').fill('tomador@example.test');page.get_by_role('button',name='Cadastrar tomador').click()
 page.get_by_role('button',name='Configurações').click();page.locator('input[type=file]').set_input_files(root/'.local-data/fixtures/synthetic.pfx');page.get_by_placeholder('Senha do certificado').fill('Synthetic-2026!');page.get_by_role('button',name='Adicionar certificado').click();page.get_by_text('Certificado ativo').wait_for()
 page.get_by_role('button',name='Emitir NFS-e').click();page.locator('.nfse-wizard select').select_option(index=1);page.get_by_role('button',name='Continuar').click();page.locator('.nfse-form-grid select').select_option(index=1);page.locator('.nfse-form-grid textarea').fill('Prestação sintética para integração local');page.get_by_role('button',name='Continuar').click();page.get_by_role('button',name='Emitir em simulação').click()
 for _ in range(30):
  page.wait_for_timeout(500)
  if page.get_by_role('link',name='Baixar XML').count():break
  page.get_by_role('button',name='Atualizar resultado').click()
 assert page.get_by_role('link',name='Baixar XML').count()==1
 with page.expect_download() as download:page.get_by_role('link',name='Baixar XML').click()
 assert download.value.suggested_filename.startswith('nfse-');print('UI_WIZARD_OK',download.value.suggested_filename);browser.close()
