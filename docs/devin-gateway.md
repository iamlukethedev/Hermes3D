# Hermes3D + Devin AI — Integração

Este documento descreve a integração real entre o Hermes3D Studio e o Devin AI
através do **Hermes3D Devin Gateway** (`server/devin-gateway-adapter.js`).

## Arquitetura

```
Hermes3D Studio (Next.js)
  → Proxy WebSocket same-origin (server/index.js, /api/gateway)
  → Devin Gateway (ws://127.0.0.1:18790, server/devin-gateway-adapter.js)
  → Devin API v3 (https://api.devin.ai/v3, REST)
  → Sessões reais do Devin AI
```

O gateway fala exatamente o mesmo protocolo WebSocket do Demo Gateway
(`req`/`res`/`event`, `connect.challenge`, `hello-ok`), então o Studio trata o
Devin como um backend de primeira classe — sem mudar o protocolo nem criar rotas
HTTP novas.

Principais responsabilidades do gateway:

- Manter a `DEVIN_API_KEY` **somente no processo do gateway** (nunca no browser,
  nunca em `NEXT_PUBLIC_*`).
- Traduzir métodos do protocolo Hermes3D (`chat.send`, `chat.abort`,
  `sessions.list`, ...) em chamadas REST para a API v3 do Devin.
- Sincronizar sessões via polling configurável (`DEVIN_SYNC_INTERVAL_MS`) e
  publicar eventos `devin`, `chat` e `presence` para o Studio.
- Persistir perfis de agentes, vínculos agente↔sessão, histórico de mensagens e
  cursores de sincronização em `~/.hermes/devin-gateway/state.json` (JSON local;
  **nenhuma credencial é gravada** nesse arquivo).

## Pré-requisitos

- Node.js 20+ e npm 10+
- Uma credencial de service user do Devin (`cog_...`) — gerada em
  `https://app.devin.ai` → Settings → Devin API → New Service User. Personal
  access tokens também funcionam na v3, mas service users são o recomendado.
- O ID da organização (`org-...`), visível na mesma página de Settings.

## Configuração

Variáveis de ambiente do gateway (copie de `.env.example`):

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DEVIN_API_KEY` | sim (Devin Mode) | — | Credencial `cog_...` (service user) |
| `DEVIN_ORG_ID` | sim | — | `org-...` da sua organização |
| `DEVIN_API_BASE_URL` | não | `https://api.devin.ai/v3` | Base da API |
| `DEVIN_GATEWAY_HOST` | não | `127.0.0.1` | Host do WebSocket |
| `DEVIN_GATEWAY_PORT` | não | `18790` | Porta do WebSocket |
| `DEVIN_SYNC_INTERVAL_MS` | não | `10000` | Intervalo de polling das sessões |
| `DEVIN_REQUEST_TIMEOUT_MS` | não | `20000` | Timeout por requisição à API |
| `DEVIN_ALLOWED_REPOS` | não | — | Allowlist `owner/repo` separada por vírgula; quando definida, sessões só podem usar esses repositórios |
| `DEVIN_DEFAULT_REPOS` | não | — | Repositórios anexados a novas sessões quando a UI não escolhe nenhum |
| `DEVIN_DEFAULT_MODE` | não | — | `devin_mode` para novas sessões (ex.: `lite`) |
| `DEVIN_MAX_ACU_LIMIT` | não | — | Teto de ACUs por sessão |
| `HERMES_STATE_DIR` | não | `~/.hermes` | Diretório do `state.json` |

## Executando localmente

### Windows PowerShell

```powershell
cd Hermes3D
copy .env.example .env   # e preencha DEVIN_API_KEY / DEVIN_ORG_ID
$env:DEVIN_API_KEY="cog_..."
$env:DEVIN_ORG_ID="org-..."
npm run devin-gateway    # ws://127.0.0.1:18790

# em outro terminal:
npm run dev              # http://localhost:3000
```

### Linux / macOS

```bash
cd Hermes3D
export DEVIN_API_KEY="cog_..."
export DEVIN_ORG_ID="org-..."
npm run devin-gateway &  # ws://127.0.0.1:18790
npm run dev              # http://localhost:3000
```

### Docker

```bash
# somente o gateway
docker build -f Dockerfile.devin-gateway -t hermes3d-devin-gateway .
docker run --rm -p 18790:18790 \
  -e DEVIN_API_KEY=cog_... -e DEVIN_ORG_ID=org-... \
  -v hermes3d-devin-state:/state \
  hermes3d-devin-gateway

# studio + gateway juntos
DEVIN_API_KEY=cog_... DEVIN_ORG_ID=org-... \
  docker compose -f docker-compose.devin.yml up --build
```

## Conectando o Studio

1. Abra `http://localhost:3000`.
2. Na tela de conexão (ou em Settings → Gateway), selecione o backend **Devin**.
3. A URL padrão é `ws://localhost:18790` — em execução normal o Studio usa o
   proxy same-origin (`/api/gateway?target=...`), então funciona mesmo quando o
   gateway roda em outra porta ou host.
4. Conecte. O Studio lista os perfis de agentes Devin
   (Devin Backend/Frontend/QA/DevOps Engineer, Code Reviewer, Orchestrator).

## Usando

- **Aba "Devin" na sidebar**: dashboard (ativas/atenção/concluídas/falhas),
  formulário de nova tarefa (agente + repositório + prompt) e lista de sessões
  com estado, links de PR e ações "Open in Devin"/"Terminate" (com confirmação).
- **Chat de um agente**: enviar mensagem para um agente Devin cria uma sessão
  real (`POST /organizations/{org}/sessions`) na primeira mensagem; as próximas
  mensagens viram follow-ups (`POST .../sessions/{id}/messages`). Stop aborta a
  sessão (`DELETE`).
- **Escritório 3D**: eventos `presence` refletem o estado da sessão — o agente
  aparece trabalhando enquanto a sessão está `running`, e o painel sinaliza
  "Needs input"/"Needs approval" quando o Devin está `waiting_for_user` ou
  `waiting_for_approval`.
- **Sincronização**: o gateway faz polling a cada `DEVIN_SYNC_INTERVAL_MS`,
  deduplica mensagens por `event_id` e reidrata o estado ao
  reiniciar a partir do `state.json`. O endpoint de mensagens do Devin aceita
  `after` apenas como `end_cursor` opaco de página — por isso o sync percorre
  as páginas desde o início (limite de 10 × 200 mensagens) e confia na
  deduplicação por `event_id`, em vez de persistir cursores. A mensagem do
  usuário ecoada pela API é mesclada à entrada local, sem duplicar.

## Mapeamento de estados

| Devin `status` / `status_detail` | Estado no Hermes3D |
|---|---|
| `new`, `claimed`, `resuming` | Starting |
| `running` / `working` (ou sem detail) | Running |
| `running` / `waiting_for_user` | Waiting for input |
| `running` / `waiting_for_approval` | Needs approval |
| `running` / `finished`, `exit` | Completed |
| `error` | Failed |
| `suspended` | Suspended |
| sessão inacessível (404) | Unreachable |
| `DELETE` solicitado pelo usuário | Cancelled |

Distinções como `out_of_credits`/`usage_limit_exceeded` são reportadas no
`statusDetail` exibido no painel, mas não geram estados visuais novos — o
mapeamento acima é o que a API garante.

## Métodos Devin no protocolo do gateway

Além dos métodos padrão (`agents.*`, `sessions.*`, `chat.*`, `status`), o
adapter expõe:

- `devin.health` — credenciais configuradas + health da API (nome do service user).
- `devin.sessions.list` — sessões rastreadas com vínculo agente↔sessão.
- `devin.session.get` `{ devinSessionId }` — detalhe completo da sessão.
- `devin.session.terminate` `{ devinSessionId | sessionKey, archive? }` — DELETE.
- `devin.session.archive` `{ devinSessionId }` — POST archive.
- `devin.agent.bind` `{ agentId, devinSessionId }` — vincula sessão existente.
- `devin.repos.list` — allowlist/defaults de repositórios.
- `devin.sync` — força sincronização imediata.

Eventos: `devin` (mudança de sessão), `chat` (delta/final/error do run),
`presence` (estado do agente no escritório), `heartbeat`.

## Segurança

- A `DEVIN_API_KEY` vive apenas no processo do gateway; mensagens de erro e logs
  passam por `redact`/`sanitize` que removem o token e headers `Authorization`.
- `DEVIN_ALLOWED_REPOS` restringe quais repositórios podem ser alvo de sessões —
  recomendado definir explicitamente.
- `sessions.reset` apenas desfaz o vínculo local; não destrói a sessão remota.
- `Terminate` exige confirmação na UI antes de chamar `DELETE`.
- Sem sessões pagas são criadas sem ação explícita do usuário.

## Limitações conhecidas

- **Polling, não webhooks**: a API pública v3 não expõe webhooks de sessão, então
  o gateway sincroniza via polling no intervalo configurado.
- **`connect` sem token**: como o Demo Gateway, o adapter aceita qualquer
  cliente WebSocket local. Não exponha a porta `18790` publicamente sem um proxy
  com autenticação.
- **Snapshots/playgrounds**: os endpoints de playground e snapshots da v3 não
  são usados.
- **Cancelamento**: "Cancel" mapeia para `DELETE` (terminate) — o Devin não tem
  um "pause" exposto via API pública.
- **State local**: `~/.hermes/devin-gateway/state.json` é JSON simples
  (suficiente para single-user local); SQLite não foi necessário.
- O estado `suspended` é exposto como "Suspended" (não existe estado visual
  dedicado de "pausado" no escritório; o agente aparece como ocioso).

## Testes

```bash
npm run test -- --run devinGatewayAdapter   # 30 testes do adapter/cliente
npm run typecheck
npm run lint
```

Os testes cobrem: mapeamento de estados, erros HTTP (401/403/404/429/5xx),
retry com backoff, allowlist de repositórios, criação/vínculo/abort de sessões,
deduplicação de mensagens, persistência e o modo não-configurado.

A validação com credenciais reais foi feita via leitura (`whoami`/listagem de
sessões). Criação de sessões pagas reais requer autorização explícita.
