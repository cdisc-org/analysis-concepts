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
        "{endpoint} {parameter} {timepoint} {population} {grouping} {method} {method_qualifier} {covariate} will be assessed as {sentenceRole}."
    },

    fr: {
      name: "Français",
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} {grouping} {method} {method_qualifier} {covariate} sera évaluée comme {sentenceRole}.",
      phrases: {
        SP_CFB_ENDPOINT: "la variation de {parameter} par rapport à la valeur initiale",
        SP_PARAMETER: "pour {parameter}",
        SP_TIMEPOINT: "à la {visit}",
        SP_POPULATION: "dans la population {population}",
        SP_GROUPING: "en comparant les groupes de {treatment}",
        SP_METHOD_ANCOVA: "au moyen d'une {method}",
        SP_CONFIDENCE_LEVEL: "avec des intervalles de confiance à {conf_level} %",
        SP_COVARIATE_BASELINE: "avec ajustement sur la valeur initiale du score {parameter}",
        SP_COVARIATE_SITE: "avec ajustement sur le centre"
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
        "TRT.ALL": { label: "traitement" }
      },
      methods: {
        "M.ANCOVA": { name: "analyse de covariance" }
      },
      sentenceRoles: {
        "the primary analysis": "analyse principale",
        "a secondary analysis": "une analyse secondaire",
        "a supporting analysis": "une analyse complémentaire"
      }
    },

    de: {
      name: "Deutsch",
      /* Verb bracket: "wird … untersucht" — the method/qualifier/covariate
         phrases sit inside the bracket, the participle closes the sentence. */
      sentence_template:
        "{endpoint} {parameter} {timepoint} {population} wird {grouping} {method} {method_qualifier} {covariate} als {sentenceRole} untersucht.",
      phrases: {
        SP_CFB_ENDPOINT: "die Veränderung von {parameter} gegenüber dem Ausgangswert",
        SP_PARAMETER: "für {parameter}",
        SP_TIMEPOINT: "in {visit}",
        SP_POPULATION: "in der {population}",
        SP_GROUPING: "im Vergleich der {treatment}sgruppen",
        SP_METHOD_ANCOVA: "mittels {method}",
        SP_CONFIDENCE_LEVEL: "mit {conf_level}%-Konfidenzintervallen",
        SP_COVARIATE_BASELINE: "adjustiert für den Ausgangswert von {parameter}",
        SP_COVARIATE_SITE: "adjustiert für das Zentrum"
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
        "TRT.ALL": { label: "Behandlung" }
      },
      methods: {
        "M.ANCOVA": { name: "Kovarianzanalyse" }
      },
      sentenceRoles: {
        "the primary analysis": "primäre Analyse",
        "a secondary analysis": "sekundäre Analyse",
        "a supporting analysis": "unterstützende Analyse"
      }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
