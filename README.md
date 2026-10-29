# show-de-premios
Sistema do Show de Prêmios - Quermesse Paróquia Sagrado Coração de Jesus

## Testes automáticos
Conferem as regras de quina (linha, coluna, diagonal, 4 cantos), cartela cheia e o gerador de cartelas:

```
node --test tests/*.test.js
```
A lógica de conferência fica em `logica.js` (usada pelo Verificador e pelos testes).
