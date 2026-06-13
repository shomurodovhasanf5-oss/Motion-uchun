/*
 * Reels Montaj AI - subtitr (SRT) yadrosi.
 * Segment formati: { start: <soniya>, end: <soniya>, text: <string> }
 * Toza funksiyalar — sinashga oson.
 */
"use strict";

/** Soniyani SRT vaqtiga aylantiradi: "HH:MM:SS,mmm" */
function secToSrt(sec) {
  if (sec < 0) sec = 0;
  var ms = Math.round(sec * 1000);
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  var milli = ms % 1000;
  function p(n, w) { n = String(n); while (n.length < w) n = "0" + n; return n; }
  return p(h, 2) + ":" + p(m, 2) + ":" + p(s, 2) + "," + p(milli, 3);
}

/** SRT vaqtini soniyaga aylantiradi */
function srtToSec(tc) {
  var m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(String(tc));
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
}

/** Segmentlardan SRT matnini quradi */
function buildSrt(segments) {
  var out = [];
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    out.push(String(i + 1));
    out.push(secToSrt(seg.start) + " --> " + secToSrt(seg.end));
    out.push(String(seg.text).replace(/\s+/g, " ").trim());
    out.push("");
  }
  return out.join("\n");
}


/** SRT matnini segmentlarga ajratadi */
function parseSrt(text) {
  var blocks = String(text).replace(/\r/g, "").split(/\n\n+/);
  var segs = [];
  for (var i = 0; i < blocks.length; i++) {
    var lines = blocks[i].split("\n").filter(function (l) { return l.length; });
    if (lines.length < 2) continue;
    // 1-qator raqam bo'lishi mumkin, vaqt qatorini topamiz
    var timeIdx = /-->/.test(lines[0]) ? 0 : 1;
    var tm = /(.+?)\s*-->\s*(.+)/.exec(lines[timeIdx]);
    if (!tm) continue;
    var textLines = lines.slice(timeIdx + 1);
    segs.push({
      start: srtToSec(tm[1]),
      end: srtToSec(tm[2]),
      text: textLines.join(" ").trim(),
    });
  }
  return segs;
}

/** whisper.cpp JSON ("transcription" massivi) → segmentlar */
function fromWhisperCppJson(json) {
  var obj = typeof json === "string" ? JSON.parse(json) : json;
  var arr = obj.transcription || [];
  return arr.map(function (t) {
    return {
      start: (t.offsets ? t.offsets.from : 0) / 1000,
      end: (t.offsets ? t.offsets.to : 0) / 1000,
      text: String(t.text || "").trim(),
    };
  });
}

/** OpenAI/Whisper API verbose_json ("segments") → segmentlar */
function fromApiSegments(json) {
  var obj = typeof json === "string" ? JSON.parse(json) : json;
  var arr = obj.segments || [];
  return arr.map(function (s) {
    return { start: s.start, end: s.end, text: String(s.text || "").trim() };
  });
}

module.exports = {
  secToSrt: secToSrt, srtToSec: srtToSec, buildSrt: buildSrt, parseSrt: parseSrt,
  fromWhisperCppJson: fromWhisperCppJson, fromApiSegments: fromApiSegments,
};
