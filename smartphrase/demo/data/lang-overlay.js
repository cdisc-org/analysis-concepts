/*
 * Language packs for the smartphrase demo — ILLUSTRATIVE translations.
 *
 * This is the localisation seam the design reserves for the renderer:
 *  - `sentence_template` owns word order per language (role tokens +
 *    literal frame text). This replaces concatenation-in-role-order and is
 *    the one genuinely linguistic cost of the smartphrase layer: German
 *    needs the verb bracket (wird … untersucht), which no amount of
 *    fragment concatenation can produce.
 *  - `phrases` are per-language phrase templates keyed by smartphrase oid
 *    (only the phrases valid for T.CFB_ANCOVA are translated here; anything
 *    untranslated falls back to the library's English template).
 *  - `concepts` / `methods` carry language-tagged display labels — in
 *    production much of this is inherited from CDISC/NCIt terminology
 *    translations, not translated per document.
 *  - `sentenceRoles` localise the study-layer sentence-role strings (PoC:
 *    keyed by the canonical English value).
 *
 * The analysis instance itself is language-neutral: switching language
 * re-renders the SAME object — the tag source, constructed model instance
 * and graph identifiers do not change.
 *
 * FR/DE copy is illustrative, not validated translation.
 */
(function (g) {
  g.LANG_OVERLAY = {

    en: {
      name: "English",
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} {grouping}[, {ice_handling},] {method} {method_qualifier} {covariate}[, {summary_measure},] will be assessed as {sentenceRole}.",
      /* Repeating roles joined by a conjunction rather than a bare space. Only
         roles listed here get one, so `covariate` is unaffected. */
      role_conjunctions: { ice_handling: " and " },
      /*
       * SAP-facing wording for output classes. The library's own labels are
       * analyst-facing ("Median survival", "T-based contrasts") and read badly
       * mid-sentence, so document prose needs a different register. The
       * language pack is the right seam for that — English is a pack like any
       * other — and the upstream label stays visible in the inspect panel. See
       * DESIGN.md D14.
       */
      outputClasses: {
        median_survival: { name: "the median time to event" },
        contrasts_t: { name: "the difference in least-squares means" }
      }
    },

    fr: {
      name: "Français",
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} {grouping}[, {ice_handling},] {method} {method_qualifier} {covariate}[, {summary_measure},] sera évaluée comme {sentenceRole}.",
      role_conjunctions: { ice_handling: " et " },
      outputClasses: {
        median_survival: { name: "le délai médian jusqu'à l'événement" },
        contrasts_t: { name: "la différence des moyennes des moindres carrés" }
      },
      phrases: {
        SP_CFB_ENDPOINT: "la variation de {parameter} par rapport à la valeur initiale",
        SP_PARAMETER: "pour {parameter}",
        SP_TIMEPOINT: "à la {visit}",
        SP_POPULATION: "dans la population {population}",
        SP_GROUPING: "en comparant les groupes de {treatment}",
        SP_METHOD_ANCOVA: "au moyen d'une {method}",
        SP_CONFIDENCE_LEVEL: "avec des intervalles de confiance à {conf_level} %",
        SP_COVARIATE_BASELINE: "avec ajustement sur la valeur initiale du score {parameter}",
        SP_COVARIATE_SITE: "avec ajustement sur le centre",
        /* time-to-event phrases (PrE0102) */
        SP_TTE_ENDPOINT: "le délai jusqu'à {event}",
        SP_METHOD_KM: "au moyen de l'estimation de {method}",
        SP_STRATIFICATION: "stratifié selon {strata}",
        /* estimand phrases (issue #11) */
        SP_ICE_TREATMENT_POLICY: "indépendamment de {ice}",
        SP_ICE_HYPOTHETICAL: "comme si {ice} ne s'était pas produit",
        SP_ICE_COMPOSITE: "avec {ice} considéré comme {outcome}",
        SP_ICE_WHILE_ON_TREATMENT: "en utilisant les mesures recueillies avant {ice}",
        SP_ICE_PRINCIPAL_STRATUM: "dans la strate des participants chez qui {ice} ne se produirait pas",
        SP_SUMMARY_MEASURE: "résumé par {summary}"
      },
      concepts: {
        "PARAM.ADASCOG11": { name: "l'échelle d'évaluation de la maladie d'Alzheimer – sous-échelle cognitive (11 items)" },
        "PARAM.NPIX": { name: "l'inventaire neuropsychiatrique révisé, score total moyen des domaines" },
        "VISIT.WK24": { label: "semaine 24", name: "semaine 24 (fin de la période de traitement en double aveugle)" },
        "VISIT.WK16": { label: "semaine 16", name: "semaine 16" },
        "VISIT.WK8": { label: "semaine 8", name: "semaine 8" },
        "VISIT.BASELINE": { label: "valeur initiale", name: "valeur initiale (semaine 0)" },
        "POP.EFFICACY": { name: "d'efficacité (intention de traiter)" },
        "POP.PP": { name: "per protocole" },
        "POP.SAFETY": { name: "de tolérance" },
        "TRT.ALL": { label: "traitement" },
        /* PrE0102 study layer */
        "EVENT.PFS": { label: "SSP", name: "la progression de la maladie ou le décès" },
        "EVENT.OS": { label: "SG", name: "le décès, toutes causes confondues" },
        "EVENT.TTP": { label: "DJP", name: "la progression de la maladie" },
        "POP.EVAL_EFFICACY": { label: "EFF", name: "éligible et traitée" },
        "POP.ITT": { label: "ITT", name: "en intention de traiter" },
        "TRT.PRE0102": { label: "traitement" },
        /* intercurrent events */
        "ICE.TOX_DISCONT": { label: "arrêt de l'évérolimus",
                             name: "l'arrêt de l'évérolimus pour toxicité suspectée" },
        "ICE.TRT_DISCONT": { label: "arrêt du traitement",
                             name: "l'arrêt du traitement à l'étude" },
        "ICE.CONMED": { label: "médicaments concomitants",
                        name: "l'utilisation de médicaments concomitants contre la maladie d'Alzheimer" }
      },
      methods: {
        "M.ANCOVA": { name: "analyse de covariance" },
        "M.KaplanMeier": { label: "Kaplan-Meier", name: "Kaplan-Meier" }
      },
      sentenceRoles: {
        "the primary analysis": "analyse principale",
        "a secondary analysis": "une analyse secondaire",
        "a supporting analysis": "une analyse complémentaire",
        "a sensitivity analysis": "une analyse de sensibilité"
      }
    },

    de: {
      name: "Deutsch",
      /* Verb bracket: "wird … untersucht" — the method/qualifier/covariate
         phrases sit inside the bracket, the participle closes the sentence. */
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} wird {grouping}[, {ice_handling},] {method} {method_qualifier} {covariate}[, {summary_measure},] als {sentenceRole} untersucht.",
      role_conjunctions: { ice_handling: " und " },
      outputClasses: {
        median_survival: { name: "die mediane Zeit bis zum Ereignis" },
        contrasts_t: { name: "die Differenz der Kleinste-Quadrate-Mittelwerte" }
      },
      phrases: {
        SP_CFB_ENDPOINT: "die Veränderung von {parameter} gegenüber dem Ausgangswert",
        SP_PARAMETER: "für {parameter}",
        SP_TIMEPOINT: "in {visit}",
        SP_POPULATION: "in der {population}",
        SP_GROUPING: "im Vergleich der {treatment}sgruppen",
        SP_METHOD_ANCOVA: "mittels {method}",
        SP_CONFIDENCE_LEVEL: "mit {conf_level}%-Konfidenzintervallen",
        SP_COVARIATE_BASELINE: "adjustiert für den Ausgangswert von {parameter}",
        SP_COVARIATE_SITE: "adjustiert für das Zentrum",
        /* time-to-event phrases (PrE0102) */
        SP_TTE_ENDPOINT: "die Zeit bis {event}",
        SP_METHOD_KM: "mittels {method}-Schätzung",
        SP_STRATIFICATION: "stratifiziert nach {strata}",
        /*
         * Estimand phrases (issue #11). The hypothetical strategy wants
         * Konjunktiv II — "als ob … nicht aufgetreten wäre" — and it must sit
         * INSIDE the wird … untersucht bracket. This is the case per-language
         * phrase templates (D7) exist for: no amount of fragment concatenation
         * produces it.
         *
         * FINDING, and a real limit of the current model: German assigns a CASE
         * to the ICE noun phrase, and the case differs by strategy. The natural
         * "unabhängig von {ice}" and "vor {ice}" both demand the dative, while
         * "als ob {ice} … wäre" demands the nominative — and one concept `name`
         * cannot be both. Per-language phrase templates cannot fix that; it
         * needs per-case declined forms, which the registry does not carry.
         * Resolved here by choosing nominative-compatible constructions for all
         * five strategies, so a single nominative name serves every one. Worth
         * putting to the working group: a language with richer case marking than
         * German would strain this further.
         */
        SP_ICE_TREATMENT_POLICY: "unabhängig davon, ob {ice} vorlag",
        SP_ICE_HYPOTHETICAL: "als ob {ice} nicht aufgetreten wäre",
        SP_ICE_COMPOSITE: "wobei {ice} als {outcome} gewertet wird",
        SP_ICE_WHILE_ON_TREATMENT: "sofern {ice} zum Zeitpunkt der Messung noch nicht vorlag",
        SP_ICE_PRINCIPAL_STRATUM: "in der Schicht der Teilnehmenden, bei denen {ice} nicht aufträte",
        SP_SUMMARY_MEASURE: "zusammengefasst als {summary}"
      },
      concepts: {
        "PARAM.ADASCOG11": { name: "Alzheimer's Disease Assessment Scale – kognitive Subskala (11 Items)" },
        "PARAM.NPIX": { name: "Neuropsychiatrisches Inventar – revidiert, mittlerer Domänen-Gesamtscore" },
        "VISIT.WK24": { label: "Woche 24", name: "Woche 24 (Ende der doppelblinden Behandlungsphase)" },
        "VISIT.WK16": { label: "Woche 16", name: "Woche 16" },
        "VISIT.WK8": { label: "Woche 8", name: "Woche 8" },
        "VISIT.BASELINE": { label: "Ausgangswert", name: "Ausgangswert (Woche 0)" },
        "POP.EFFICACY": { name: "Wirksamkeitspopulation (Intention-to-Treat)" },
        "POP.PP": { name: "Per-Protocol-Population" },
        "POP.SAFETY": { name: "Sicherheitspopulation" },
        "TRT.ALL": { label: "Behandlung" },
        /* PrE0102 study layer. Event names are in the dative, to follow
           "die Zeit bis" in the SP_TTE_ENDPOINT template. */
        "EVENT.PFS": { label: "PFS", name: "zur Krankheitsprogression oder zum Tod" },
        "EVENT.OS": { label: "OS", name: "zum Tod jeglicher Ursache" },
        "EVENT.TTP": { label: "TTP", name: "zur Krankheitsprogression" },
        "POP.EVAL_EFFICACY": { label: "EFF", name: "auswertbaren, behandelten Population" },
        "POP.ITT": { label: "ITT", name: "Intention-to-Treat-Population" },
        "TRT.PRE0102": { label: "Behandlung" },
        /* Intercurrent events, in the NOMINATIVE — see the note on the strategy
           phrases above for why every strategy template is built to take it. */
        "ICE.TOX_DISCONT": { label: "Everolimus-Absetzen",
                             name: "das Absetzen von Everolimus bei Verdacht auf Toxizität" },
        "ICE.TRT_DISCONT": { label: "Behandlungsabbruch",
                             name: "das Absetzen der Studienbehandlung" },
        "ICE.CONMED": { label: "Begleitmedikation",
                        name: "die Anwendung von Begleitmedikation gegen Alzheimer" }
      },
      methods: {
        "M.ANCOVA": { name: "Kovarianzanalyse" },
        "M.KaplanMeier": { label: "Kaplan-Meier", name: "Kaplan-Meier" }
      },
      sentenceRoles: {
        "the primary analysis": "primäre Analyse",
        "a secondary analysis": "sekundäre Analyse",
        "a supporting analysis": "unterstützende Analyse",
        "a sensitivity analysis": "Sensitivitätsanalyse"
      }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
