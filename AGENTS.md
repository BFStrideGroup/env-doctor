# Continuità tra agenti AI

- Leggere questo file per intero all’inizio di ogni sessione sul progetto.
- Dopo modifiche significative, aggiornare solo `## Stato lavoro / Handoff`, sostituendo lo stato precedente con poche righe aggiornate.
- Conservare le altre sezioni e non registrare segreti, valori `.env` o dati sensibili.

## Stato lavoro / Handoff

2026-08-28 — Codex: audit e hardening production-oriented di Env Doctor. Corretti scanner/config monorepo, falsi positivi per fallback e variabili runtime, secret scanning di config ed env Git-tracciati, sicurezza di report/generatore, severità e UX VS Code/CLI. Aggiunti toolchain ESLint/Prettier/esbuild, packaging VSIX compresso e test di regressione. Prossimo passo suggerito: eseguire smoke test manuale del VSIX su un vero Extension Host e sostituire publisher, URL e screenshot placeholder prima della pubblicazione.
