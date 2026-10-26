# Show de Prêmios — Atalhos e comandos

Guia rápido para quem opera o sistema no dia do evento. Endereço base das telas:
`https://pascomscjmarilia-creator.github.io/show-de-premios/`

---

## 1. Deixar a tela limpa (sem cabeçalho nem barras do navegador)

Use nas telas que ficam no telão: **datashow**, **patrocinadores**, **video** e **entrevista**.

| Ação | Como fazer |
|---|---|
| Tela cheia pelo sistema | Tecla **F** (clique antes na página, para ela receber o teclado) |
| Tela cheia pelo navegador | Tecla **F11** (funciona em qualquer tela) |
| Sair da tela cheia | **Esc** (ou **F11** de novo) |

Dica: abra a tela no computador do telão, aperte **F**, e deixe assim. As atualizações chegam sozinhas.

> O **Esc** também faz outra coisa nessas telas (ver seção 2). Se a tela cheia sair
> sem querer, aperte **F** novamente.

---

## 2. Teclas de cada tela

| Tela | Tecla | O que faz |
|---|---|---|
| **datashow.html** (telão) | **F** | Liga a tela cheia |
| | **Esc** | Esconde a cartela que está aberta na tela |
| **patrocinadores.html** | **F** | Liga a tela cheia |
| | **→** (seta direita) | Próximo patrocinador |
| | **←** (seta esquerda) | Patrocinador anterior |
| | **↑** (seta para cima) | Troca o fundo (se houver mais de um) |
| **video.html** | **F** | Liga a tela cheia |
| | **Esc** | Para o vídeo e volta à tela de espera |
| **entrevista.html** | **F** | Liga a tela cheia |
| | **Esc** | Encerra a entrevista (libera câmera e microfone) |

### Tecla Enter (confirmar)

| Onde | O que o Enter faz |
|---|---|
| Painel — login | Entra no painel |
| Painel — campo do globo físico | Confirma o número digitado |
| Painel — busca de vídeo do YouTube | Faz a busca |
| Verificador — pedra manual | Adiciona o número |
| Cadastro — campo do número da cartela | Busca a cartela |
| Admin — login | Entra na administração |

---

## 3. Painel do operador (`painel.html`)

Não há atalhos de teclado para sortear. Tudo é por botão:

| Botão | O que faz |
|---|---|
| **SORTEAR** (modo Automático) | Sorteia um número ao acaso |
| **Globo Físico** | Troca para digitar o número retirado do globo; o cursor já fica no campo |
| **CONFIRMAR** | Registra o número digitado |
| **Desfazer** | Tira o último número sorteado, em todas as telas |
| **Resetar** | Zera o jogo (pede confirmação) |
| **Abrir DataShow** | Abre o telão em outra aba |
| **?** (círculo amarelo, canto direito da barra superior) | Abre a ajuda com estes atalhos. A tecla **?** também abre, fora dos campos de digitação; **Esc** fecha |
| **Trocar tela em todos os aparelhos** | Botões *Sorteio*, *Patrocinadores*, *Vídeo* e *Entrevista*: mudam o que **todos** os telões mostram ao mesmo tempo |

Fluxo no globo físico: escolher **Globo Físico** → digitar o número → **Enter**. O campo esvazia e fica pronto para o próximo.
Se o número já saiu, o painel avisa.

---

## 4. Verificador (`verificador.html`)

| Ação | Como |
|---|---|
| Adicionar número à mão | Digitar no campo e **Enter** (ou botão *Adicionar*). O número também chega ao painel e ao telão |
| Resetar a rodada | Botão **Resetar rodada** (pede confirmação). Quando o reset vem do painel, o verificador zera sozinho |

---

## 5. Atalhos do navegador e do Windows que ajudam

Não são do sistema, mas servem no dia a dia.

| Atalho | Para quê |
|---|---|
| **F11** | Tela cheia do navegador |
| **Ctrl + F5** | Recarregar a página, ignorando o cache (use depois de uma atualização) |
| **F5** | Recarregar a página |
| **Ctrl + Tab** / **Ctrl + Shift + Tab** | Ir para a próxima / anterior aba |
| **Ctrl + 1 … 8** | Ir direto para a aba 1 a 8 |
| **Ctrl + T** | Nova aba |
| **Ctrl + W** | Fechar a aba |
| **Ctrl + Shift + N** | Janela anônima (útil para testar login) |
| **Ctrl + +** / **Ctrl + −** / **Ctrl + 0** | Aumentar, diminuir e voltar o zoom ao normal |
| **Windows + P** | Escolher como usar o projetor: *Estender* (telão separado) ou *Duplicar* |
| **Windows + Shift + ← / →** | Mover a janela para outro monitor |
| **Alt + Tab** | Alternar entre janelas |

---

## 6. Montagem típica do evento

| Aparelho | Tela | Observação |
|---|---|---|
| Computador do operador | `painel.html` | Só **uma** pessoa opera o painel por vez |
| Telão principal | `datashow.html`, tela cheia (**F**) | Não precisa mexer, atualiza sozinha |
| Telão da 2ª sala | A mesma tela do telão principal | Em outro aparelho com internet |
| Conferente de cartelas | `verificador.html` | Pode ser tablet ou celular |
| Equipe de cadastro | `cadastro.html` | Registra as cartelas vendidas |

---
---

## Mais de uma tela de vídeo (sem som duplicado)

Todas as telas de vídeo abertas tocam o mesmo vídeo ao mesmo tempo. Para o áudio não sair de dois lugares, deixe o som só na tela principal e abra as outras assim:

```
.../show-de-premios/video.html?mudo=1
```

A tela com `?mudo=1` toca a imagem, mas sem som. O computador do operador não precisa manter uma tela de vídeo aberta.

## 7. Se algo der errado

| Sintoma | O que tentar |
|---|---|
| Tela mostra versão antiga | **Ctrl + F5** |
| Telão não acompanha o painel | Conferir a internet do aparelho; recarregar a tela (**F5**) |
| Tecla **F** não faz nada | Clicar uma vez na página e apertar **F** de novo, ou usar **F11** |
| Câmera ou microfone presos | Na entrevista, apertar **Esc** para encerrar |
| Número errado sorteado | **Desfazer** no painel |
| Esqueceu a senha | Pedir ao administrador para redefinir na planilha de usuários |
