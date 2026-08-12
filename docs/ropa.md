# Registro dei trattamenti (art. 30 GDPR)

Documento interno. Non è consulenza legale. Aggiornarlo nello stesso commit
che cambia finalità, destinatari o tempi di conservazione.

**Titolare:** Davide Ghiotto, persona fisica. Contatto:
privacy@calorico.davideghiotto.it / ghiotto.davidenko@gmail.com.

**DPO:** non nominato (art. 37 non ricorrente).

**Ultimo aggiornamento:** 12 agosto 2026.

## Trattamenti

| Finalità | Categorie di dati | Categorie di interessati | Destinatari | Conservazione | Base giuridica |
| --- | --- | --- | --- | --- | --- |
| Account e autenticazione | email, nome, hash scrypt, token_version | utenti registrati | VPS (art. 28) | fino a cancellazione account | art. 6(1)(b) |
| Diario, peso, profilo, obiettivi | dati sulla salute (art. 9) | utenti registrati | VPS | fino a cancellazione | art. 9(2)(a) consenso esplicito |
| Analisi foto pasto | immagine transitoria; etichette e quantità | utenti che usano la funzione | fornitore visione (Mistral e/o OpenAI, art. 28) | foto: mai; etichette: fino a cancellazione | art. 9(2)(a) |
| Promemoria push | endpoint, chiavi di cifratura, user-agent, orari | utenti che abilitano le notifiche | FCM / APNs / Mozilla (scelta del browser) | fino a revoca o endpoint morto | art. 6(1)(a) |
| Catalogo alimenti | prodotti OFF e tabelle di composizione | n/a (non personali) | Open Food Facts come destinatario delle query | indefinita (catalogo) | n/a |
| Sicurezza, rate limit, errori | IP, log di richiesta, stack (Sentry se attivo) | visitatori e utenti | VPS; Sentry EU se DSN impostato | log ≤ 30 giorni; Sentry ~90 giorni | art. 6(1)(f) |
| Famiglia (spesa e scansioni) | nome, lista, etichette scansioni | membri del gruppo | altri membri; VPS | fino a uscita / cancellazione | art. 6(1)(b) + consenso all'invito |

Stripe / fatturazione: fuori da questo registro finché i pagamenti non sono attivi.

## Responsabili (art. 28)

| Soggetto | Ruolo | Dati | Trasferimento extra-UE |
| --- | --- | --- | --- |
| Fornitore VPS (Dokploy sul server del titolare) | responsabile | tutti i dati a riposo | no, se il VPS è in UE — firmare il DPA del fornitore |
| Mistral AI SAS (se `VISION_PROVIDER=mistral`) | responsabile | foto pasto, una richiesta | no |
| OpenAI Ireland / OpenAI L.L.C. (se `VISION_PROVIDER=openai`) | responsabile | foto pasto, una richiesta | sì, SCC + DPF |
| Functional Software, Inc. (Sentry, se DSN) | responsabile | errori tecnici, IP | no se regione EU (`ingest.de.sentry.io`) |

Open Food Facts: destinatario / titolare autonomo, non responsabile art. 28.
Servizi push del browser: destinatari determinati dal browser dell'utente.

## Operativo (allineare all'informativa §7)

Il titolare deve impostare sul VPS / in Dokploy:

- rotazione dei log del container API **entro 30 giorni**;
- rotazione dei backup di Postgres **entro 30 giorni**;
- DPA art. 28 con il fornitore del VPS, e nome di quel fornitore in
  `privacy.html` §5 quando è noto (oggi: VPS in UE orchestrato con Dokploy).

Se la rotazione reale è più lunga, si aggiorna l'informativa, non il contrario.

## Misure di sicurezza (sintesi)

Password scrypt; JWT con `token_version`; RLS Postgres (`calorico_app` +
`FORCE ROW LEVEL SECURITY`); foto pasto mai scritte su disco; Postgres solo
sulla rete interna dei container; CSP / HSTS; log senza password né token.
