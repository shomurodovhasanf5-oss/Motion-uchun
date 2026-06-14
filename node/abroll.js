/*
 * Reels Montaj AI - A-Roll / B-Roll ajratish va joylash yadrosi.
 * A-Roll = asosiy (gapiruvchi) kadr — nutq ko'p.
 * B-Roll = qoplama/illyustrativ kadr — nutq kam yoki yo'q.
 * Toza funksiyalar — sinashga oson.
 */
"use strict";

/**
 * Kliplarni A-Roll yoki B-Roll ga ajratadi.
 * clips: [{ name, duration, speechRatio }]  (speechRatio: 0..1)
 * opts: { speechThreshold, minAroll }
 * Fayl nomidagi belgilar ustun turadi (broll / aroll / cam).
 */
function classifyClips(clips, opts) {
  opts = opts || {};
  var speechThreshold = opts.speechThreshold != null ? opts.speechThreshold : 0.35;
  var minAroll = opts.minAroll != null ? opts.minAroll : 1.5;

  return clips.map(function (c) {
    var nameHint = hintFromName(c.name);
    var role;
    if (nameHint) role = nameHint;
    else if ((c.speechRatio || 0) >= speechThreshold && (c.duration || 0) >= minAroll) role = "A";
    else role = "B";
    return { name: c.name, duration: c.duration, speechRatio: c.speechRatio, role: role };
  });
}

/** Fayl nomidan rolni taxmin qiladi (bo'lmasa null) */
function hintFromName(name) {
  var n = String(name || "").toLowerCase();
  if (/\bb[-_ ]?roll\b|broll|overlay|cutaway/.test(n)) return "B";
  if (/\ba[-_ ]?roll\b|aroll|talk|cam\d|interview|selfie/.test(n)) return "A";
  return null;
}


/**
 * B-Roll bo'laklarini A-Roll davomiyligi bo'ylab teng taqsimlaydi (offline).
 * arollDuration: A-Roll umumiy uzunligi (soniya)
 * brollClips: [{name, duration}]
 * opts: { maxBrollDur, edgePad } — har B-Roll ko'rinish uzunligi va chetlardan zaxira
 * Qaytadi: [{ name, at, dur }]  at = timeline'dagi boshlanish (soniya)
 */
function distributeBroll(arollDuration, brollClips, opts) {
  opts = opts || {};
  var maxDur = opts.maxBrollDur != null ? opts.maxBrollDur : 3.0;
  var edgePad = opts.edgePad != null ? opts.edgePad : 1.0;
  var n = brollClips.length;
  if (!n || arollDuration <= 0) return [];

  var usable = Math.max(0, arollDuration - edgePad * 2);
  var slot = usable / n; // har B-Roll uchun ajratilgan oraliq
  var out = [];
  for (var i = 0; i < n; i++) {
    var b = brollClips[i];
    var dur = Math.min(maxDur, b.duration || maxDur);
    // Har slotning markaziga joylaymiz
    var center = edgePad + slot * i + slot / 2;
    var at = Math.max(0, center - dur / 2);
    if (at + dur > arollDuration) at = Math.max(0, arollDuration - dur);
    out.push({ name: b.name, at: round2(at), dur: round2(dur) });
  }
  return out;
}

function round2(x) { return Math.round(x * 100) / 100; }

/** Online aqlli joylash uchun LLM so'rovi (transkript + B-Roll nomlari) */
function buildBrollPrompt(segments, brollNames) {
  var script = segments.map(function (s, i) {
    return s.start.toFixed(1) + "s: " + s.text;
  }).join("\n");
  var list = brollNames.map(function (nm, i) { return (i + 1) + ". " + nm; }).join("\n");
  return "Quyida video transkripti (vaqt bilan) va B-Roll fayllar ro'yxati bor. " +
    "Har bir B-Roll uchun mazmunan eng mos vaqtni (soniyada) tanla. " +
    "Faqat JSON massiv qaytar: [{\"name\":\"...\",\"at\":12.5}].\n\n" +
    "TRANSKRIPT:\n" + script + "\n\nB-ROLL:\n" + list;
}

/** LLM javobidan JSON joylashuv rejasini ajratadi */
function parseBrollPlan(text, brollClips) {
  var s = String(text);
  var a = s.indexOf("["), b = s.lastIndexOf("]");
  var plan = [];
  try { plan = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  var byName = {};
  brollClips.forEach(function (c) { byName[c.name] = c; });
  return plan.map(function (p) {
    var c = byName[p.name] || {};
    return { name: p.name, at: round2(+p.at || 0), dur: round2(Math.min(3, c.duration || 3)) };
  });
}

module.exports = {
  classifyClips: classifyClips, hintFromName: hintFromName,
  distributeBroll: distributeBroll, buildBrollPrompt: buildBrollPrompt,
  parseBrollPlan: parseBrollPlan,
};
