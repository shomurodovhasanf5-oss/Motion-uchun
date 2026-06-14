/*
 * Reels Montaj AI - jim qismlarni aniqlash mantiqi (Auto-Cut yadrosi).
 * ffmpeg "silencedetect" chiqishini tahlil qiladi va kesish rejasini tuzadi.
 * Toza (sof) funksiyalar — sinashga oson.
 */
"use strict";

/**
 * "Duration: 00:00:10.50" qatoridan umumiy davomiylikni soniyada oladi.
 */
function parseDuration(text) {
  var m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
}

/**
 * silencedetect chiqishidan jim oraliqlarni ajratadi.
 * Qatorlar: "silence_start: 1.23" va "silence_end: 2.34 | silence_duration: 1.11"
 */
function parseSilences(text) {
  var silences = [];
  var lines = String(text).split(/\r?\n/);
  var open = null;
  for (var i = 0; i < lines.length; i++) {
    var s = /silence_start:\s*(-?\d+(?:\.\d+)?)/.exec(lines[i]);
    var e = /silence_end:\s*(-?\d+(?:\.\d+)?)/.exec(lines[i]);
    if (s) open = Math.max(0, parseFloat(s[1]));
    else if (e && open !== null) {
      silences.push({ start: open, end: parseFloat(e[1]) });
      open = null;
    }
  }
  return silences;
}


/**
 * Jim oraliqlardan "saqlanadigan" (nutq) bo'laklarni hisoblaydi.
 * opts:
 *   padding   - har bir nutq bo'lagi atrofiga qo'shiladigan zaxira (soniya), nafasni kesmaslik uchun
 *   minKeep   - bundan qisqa nutq bo'laklari tashlanadi (soniya)
 *   minSilence- bundan qisqa jimliklar e'tiborga olinmaydi (soniya)
 */
function computeKeep(silences, duration, opts) {
  opts = opts || {};
  var padding = opts.padding != null ? opts.padding : 0.08;
  var minKeep = opts.minKeep != null ? opts.minKeep : 0.25;
  var minSilence = opts.minSilence != null ? opts.minSilence : 0.4;

  // Juda qisqa jimliklarni o'tkazib yuboramiz
  var sil = silences.filter(function (s) { return s.end - s.start >= minSilence; });

  // Nutq = umumiy oraliq minus jimliklar
  var keep = [];
  var cursor = 0;
  for (var i = 0; i < sil.length; i++) {
    var s = sil[i];
    if (s.start > cursor) keep.push({ start: cursor, end: s.start });
    cursor = s.end;
  }
  if (duration && cursor < duration) keep.push({ start: cursor, end: duration });

  // Padding qo'shamiz va minKeep'dan qisqalarini tashlaymiz
  var out = [];
  for (var j = 0; j < keep.length; j++) {
    var k = keep[j];
    var start = Math.max(0, k.start - padding);
    var end = duration ? Math.min(duration, k.end + padding) : k.end + padding;
    if (end - start >= minKeep) out.push({ start: start, end: end });
  }
  return mergeOverlaps(out);
}

/** Padding tufayli ustma-ust tushgan bo'laklarni birlashtiradi */
function mergeOverlaps(segs) {
  if (!segs.length) return [];
  segs.sort(function (a, b) { return a.start - b.start; });
  var res = [segs[0]];
  for (var i = 1; i < segs.length; i++) {
    var last = res[res.length - 1];
    if (segs[i].start <= last.end) last.end = Math.max(last.end, segs[i].end);
    else res.push(segs[i]);
  }
  return res;
}

module.exports = { parseDuration: parseDuration, parseSilences: parseSilences, computeKeep: computeKeep, mergeOverlaps: mergeOverlaps };
