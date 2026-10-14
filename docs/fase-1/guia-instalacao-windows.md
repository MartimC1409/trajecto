# Guia de instalação no Windows (Fase 1)

Este guia parte do zero. Cada passo diz o que fazer, o que deves ver e o que fazer se algo correr mal.
Tempo estimado: 20 a 30 minutos.

Vais usar o **PowerShell**: abre o menu Iniciar, escreve "PowerShell" e escolhe "Windows PowerShell".

---

## 1. Instalar o Git

O Git descarrega o código e guarda o histórico de alterações.

1. Vai a https://git-scm.com/download/win e descarrega o instalador de 64 bits.
2. Instala com as opções por omissão (carrega sempre em "Next").
3. **Fecha e volta a abrir o PowerShell** e escreve:

   ```powershell
   git --version
   ```

   Deves ver algo como `git version 2.x.x`.

## 2. Instalar o Node.js 24.21.0 (LTS)

O Node.js corre as ferramentas de desenvolvimento.

1. Descarrega o instalador: https://nodejs.org/dist/v24.21.0/node-v24.21.0-x64.msi
2. Instala com as opções por omissão. Não precisas de marcar "Tools for Native Modules".
3. Fecha e volta a abrir o PowerShell e escreve:

   ```powershell
   node -v
   ```

   Deves ver `v24.21.0`.

## 3. Instalar o pnpm 12.11.2

O pnpm instala as bibliotecas do projeto.

```powershell
npm install -g pnpm@12.11.2
pnpm -v
```

Deves ver `12.11.2`.

**Se aparecer o erro "a execução de scripts está desativada neste sistema":** o Windows bloqueia
scripts do PowerShell por omissão. Para permitir scripts locais apenas na tua conta, corre:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Responde `S` (Sim) e tenta outra vez `pnpm -v`.

## 4. Descarregar o projeto

```powershell
cd $HOME\Documents
git clone https://github.com/MartimC1409/trajecto.git
cd trajecto
git checkout claude/fase-0-planeamento
```

> O último comando muda para o ramo onde está o trabalho das Fases 0 e 1. Depois de integrado
> no ramo `main`, este passo deixa de ser necessário.

## 5. Instalar as dependências

```powershell
pnpm install
```

Demora um ou dois minutos na primeira vez. No fim deve aparecer `Done in …`.

## 6. Arrancar a aplicação

```powershell
pnpm dev
```

1. Abre http://localhost:5173 no Chrome ou no Edge.
2. Deves ver o mapa de Lisboa e a caixa "Pesquisar em Portugal".
3. Para parar o servidor, carrega em `Ctrl + C` no PowerShell.

### O que experimentar

- Pesquisa "Rua Augusta" e escolhe um resultado com as setas e Enter.
- Clica em **Casa** no painel do local. Recarrega a página: o favorito continua lá.
- Clica num ponto do mapa para ver a morada.
- Abre o menu (☰): favoritos, recentes, tema escuro, língua e "Apagar todos os meus dados".
- Inclina o mapa (botão direito do rato + arrastar) e aproxima-te para ver os edifícios em 3D.

## 7. Ver no telemóvel (mesma rede Wi-Fi)

```powershell
pnpm dev:lan
```

1. O PowerShell mostra uma linha `Network: http://192.168.x.y:5173`. Abre esse endereço no
   Safari do iPhone ou no Chrome do Android.
2. Se o Windows perguntar se permite o acesso do Node.js à rede, escolhe **só "Redes privadas"**.
3. Para instalar como aplicação:
   - **iPhone (Safari):** botão Partilhar → "Adicionar ao ecrã principal".
   - **Android (Chrome):** menu ⋮ → "Adicionar ao ecrã principal" ou "Instalar aplicação".

**Limitações nesta fase:**

- O botão "Mostrar a minha localização" só funciona no computador (em `localhost`). No telemóvel
  precisa de HTTPS, que chega na Fase 3.
- Com o computador desligado, a app no telemóvel não funciona, porque é o computador que a serve.

## 8. Correr os testes

**Verificação completa** (lint, formatação, tipos, testes unitários com cobertura e build):

```powershell
pnpm check
```

**Testes ponta a ponta.** Instala primeiro os browsers do Playwright, uma só vez (algumas centenas de MB):

```powershell
pnpm --filter @trajecto/web exec playwright install chromium webkit
pnpm test:e2e
```

Para incluir também o Safari de iPhone (WebKit):

```powershell
$env:E2E_WEBKIT = "1"; pnpm test:e2e; Remove-Item Env:E2E_WEBKIT
```

Resultado esperado: todos os testes com ✓.

## Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `pnpm` não é reconhecido | O terminal foi aberto antes da instalação | Fecha e volta a abrir o PowerShell |
| `Port 5173 is already in use` | Já há um `pnpm dev` a correr | Fecha a outra janela ou carrega em `Ctrl + C` nela |
| Mapa em branco com a mensagem sobre WebGL | Aceleração gráfica desligada | No Chrome, abre `chrome://settings/system` e ativa a opção de aceleração gráfica (aceleração de hardware) |
| "Demasiadas pesquisas seguidas" | Limite do servidor público do Photon | Aguarda alguns segundos |
| "Serviço de pesquisa indisponível" | O Photon público está em baixo | Tenta mais tarde. Na Fase 2 vamos poder usar uma instância própria |
| O mapa não carrega mas a pesquisa funciona | O OpenFreeMap está em baixo ou bloqueado pela rede | Tenta mais tarde ou noutra rede |
