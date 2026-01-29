    # CRMOlifant (CRM clínico WhatsApp)

    Monorepo com:

    - `apps/web`: HUD web (Next.js)
    - `apps/api`: API REST + webhook Meta WhatsApp Cloud API (Fastify)
    - `apps/worker`: worker assíncrono (jobs/outbox, SLA, mídia)
    - `packages/shared`: tipos e validações compartilhadas

    ## Requisitos

    - Node.js >= 22

    ## Dev

    ```bash
    npm install
    npm run dev
    ```

    ## Variáveis de ambiente

    Crie os arquivos `.env` em cada app com as variáveis necessárias:

    - `apps/api/.env`
    - `apps/worker/.env`
    - `apps/web/.env.local`

    Consulte `docs/deploy-vps.md` para detalhes sobre as variáveis necessárias.


