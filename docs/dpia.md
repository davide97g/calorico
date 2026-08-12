# DPIA — diario alimentare e visione (art. 35 GDPR)

Valutazione d'impatto interna per il trattamento di dati sulla salute
(art. 9) e per l'invio di foto di pasti a un modello di visione. Non è
consulenza legale e non sostituisce una DPIA formale se il servizio
diventa un'attività di impresa su larga scala.

**Data:** 12 agosto 2026. **Titolare:** Davide Ghiotto.

## Perché c'è

Il GDPR richiede una DPIA quando un trattamento, in particolare con
categorie particolari (art. 9) o nuove tecnologie, può presentare un rischio
elevato. Calorico memorizza diario, peso e dati corporei, e può inviare una
foto del piatto a un LLM. È un progetto personale, non un trattamento su
larga scala, ma la natura dei dati giustifica comunque questa nota.

## Descrizione

- **Cosa:** diario calorico, peso, profilo, alimenti custom, scansioni;
  opzionalmente una foto di pasto analizzata e subito scartata.
- **Chi:** persone ≥ 16 anni che creano un account.
- **Dove:** Postgres su VPS in UE; foto solo in transito verso Mistral (UE)
  o OpenAI (possibile USA).
- **Perché:** erogare il diario, non profilazione, non pubblicità, non
  addestramento di modelli da parte del titolare.

## Rischi

| Rischio | Impatto | Probabilità | Mitigazione |
| --- | --- | --- | --- |
| Un account vede il diario di un altro | alto | bassa | `user_id` in ogni query; RLS `calorico_app`; test di isolamento |
| Alimento custom visibile ad altri | medio | era reale | filtro `source <> custom OR created_by = me` + RLS su `foods` |
| Foto pasto conservata o loggata | alto | bassa | mai su disco; Pino redige `req.body.image`; EXIF strippato in browser |
| Trasferimento USA (OpenAI) | medio | se il provider è OpenAI | SCC / DPF; alternativa Mistral in UE; funzione disattivabile |
| Token JWT in localStorage | medio | XSS | CSP stretta; `token_version`; logout ovunque |
| Backup che sopravvive alla cancellazione | medio | dipende dal VPS | rotazione ≤ 30 giorni, allineata all'informativa |
| Minore di 16 anni | alto | bassa | checkbox in registrazione; cancellazione su segnalazione |

## Necessità e proporzionalità

Si raccolgono solo i dati che il diario richiede. Le foto non si conservano.
Non c'è analytics di terze parti. Il consenso art. 9 è un atto affermativo
in registrazione, con versione dell'informativa stampata sul record. La
revoca è la cancellazione dell'account, immediata e a cascata. L'export
JSON è in-app (art. 20).

## Conclusione

Con le misure sopra il rischio residuo è accettabile per un diario personale
self-hosted. Rivalutare se si attivano pagamenti, analytics, o un volume
di utenti che faccia scattare l'art. 37 (DPO) o un trattamento su larga scala.
