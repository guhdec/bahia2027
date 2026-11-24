# Cardápio da Viagem — votação

Página de votação com contagem automática dos votos.

## Publicar na Vercel (uns 5 minutos)

1. Crie uma conta grátis em https://vercel.com (pode entrar com o GitHub ou o e-mail).
2. **Add New → Project**. Suba esta pasta de um destes jeitos:
   - pelo GitHub: crie um repositório com estes arquivos e importe-o; ou
   - pelo terminal: `npm i -g vercel` e depois `vercel` dentro desta pasta.
   Não precisa mudar nenhuma configuração (Framework Preset: **Other**).
3. Para guardar os votos, no projeto da Vercel vá em **Storage → Create Database → Upstash (Redis)**
   (plano grátis), e conecte ao projeto. A integração cria sozinha as variáveis
   `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
4. Em **Deployments**, clique em **Redeploy** para o site enxergar o banco.
5. Mande o link no grupo. O resultado fica em `seu-link.vercel.app/#resultado`.

## Como funciona
- Cada pessoa marca Não / Gosto / Amo e envia. Votar de novo com o mesmo nome substitui o voto anterior.
- Pontuação: Amo = 2, Gosto = 1, Não = −1.
- Na aba Resultado você define quantos itens de cada categoria entram e copia o cardápio final para a chef.
- Se o banco estiver fora do ar, a página gera uma mensagem com código `#CARD1` para mandar no WhatsApp; cole essas mensagens na aba Resultado e elas entram na conta.

## Arquivos
- `index.html` — a página
- `api/votos.js` — API que grava e lê os votos (Upstash Redis)
