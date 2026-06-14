/*
 * Reels Montaj AI - tarjima yordamchilari.
 * Online: LLM/tarjima API (istalgan tilga: uz, ru, en, ...).
 * Offline: whisper.cpp faqat inglizchaga tarjima qiladi (-tr bayrog'i).
 * Bu yerda matn tayyorlash va segmentlarni qayta yig'ish (vaqtni saqlab).
 */
"use strict";

var LANG_NAMES = {
  uz: "o'zbek", ru: "rus", en: "ingliz", tr: "turk",
  kk: "qozoq", ar: "arab", de: "nemis", fr: "fransuz", es: "ispan",
};

/** Til kodidan o'qiladigan nom */
function langName(code) {
  return LANG_NAMES[code] || code;
}

/**
 * LLM uchun tarjima so'rovi. Segment matnlarini raqamlab beradi,
 * javob ham xuddi shunday raqamlangan bo'lishi shart (vaqt belgilari saqlanadi).
 */
function buildTranslatePrompt(segments, targetCode) {
  var target = langName(targetCode);
  var numbered = segments.map(function (s, i) {
    return (i + 1) + ". " + String(s.text).replace(/\n/g, " ");
  }).join("\n");
  var instruction =
    "Quyidagi raqamlangan subtitr qatorlarini " + target + " tiliga tarjima qil. " +
    "Faqat tarjimani qaytar, har bir qatorni xuddi shu raqam bilan, " +
    "qatorlar sonini o'zgartirmasdan. Tabiiy va og'zaki uslubda tarjima qil.\n\n";
  return instruction + numbered;
}


/**
 * LLM javobidan ("1. matn\n2. matn") tarjima qatorlarini ajratadi.
 * Segmentlar soniga moslab massiv qaytaradi.
 */
function parseNumbered(text, count) {
  var map = {};
  var lines = String(text).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var m = /^\s*(\d+)[.\)]\s*(.*)$/.exec(lines[i]);
    if (m) map[parseInt(m[1], 10)] = m[2].trim();
  }
  var out = [];
  for (var n = 1; n <= count; n++) out.push(map[n] != null ? map[n] : "");
  return out;
}

/** Asl segment vaqtlarini saqlab, matnni tarjima bilan almashtiradi */
function mergeTranslations(segments, translatedTexts) {
  return segments.map(function (s, i) {
    return {
      start: s.start,
      end: s.end,
      text: translatedTexts[i] && translatedTexts[i].length ? translatedTexts[i] : s.text,
    };
  });
}

/** Online LLM chat so'rovi ma'lumotlari (OpenAI mosligida) */
function buildChatRequestInfo(opts) {
  return {
    url: opts.baseUrl || "https://api.openai.com/v1/chat/completions",
    model: opts.model || "gpt-4o-mini",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + (opts.apiKey || ""),
    },
  };
}

module.exports = {
  langName: langName,
  buildTranslatePrompt: buildTranslatePrompt,
  parseNumbered: parseNumbered,
  mergeTranslations: mergeTranslations,
  buildChatRequestInfo: buildChatRequestInfo,
};
