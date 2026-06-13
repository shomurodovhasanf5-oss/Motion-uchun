/*
 * Reels Montaj AI - ovoz (loudness) yadrosi.
 * ffmpeg "loudnorm" ikki bosqichli usuli (EBU R128):
 *   1-bosqich: o'lchash (print_format=json)
 *   2-bosqich: o'lchangan qiymatlar bilan -14 LUFS ga keltirish
 * Reels/ijtimoiy tarmoq standarti: I=-14 LUFS, TP=-1.5 dBTP, LRA=11.
 */
"use strict";

var DEFAULT_TARGET = { I: -14, TP: -1.5, LRA: 11 };

/** 1-bosqich: o'lchash buyrug'i argumentlari (chiqish stderr'ga JSON) */
function buildMeasureArgs(input, target) {
  target = target || DEFAULT_TARGET;
  var filter = "loudnorm=I=" + target.I + ":TP=" + target.TP +
    ":LRA=" + target.LRA + ":print_format=json";
  return ["-hide_banner", "-i", input, "-af", filter, "-f", "null", "-"];
}

/**
 * ffmpeg chiqishidan loudnorm JSON blokini ajratadi.
 * Chiqishning oxirida { ... } ko'rinishida bo'ladi.
 */
function parseLoudnormJson(text) {
  var s = String(text);
  var start = s.lastIndexOf("{");
  var end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}


/**
 * 2-bosqich: o'lchangan qiymatlar bilan normallashtirish va faylga yozish.
 * stereo, 48kHz, AAC chiqaramiz (Premiere uchun qulay).
 */
function buildNormalizeArgs(input, measured, outPath, target) {
  target = target || DEFAULT_TARGET;
  var filter = "loudnorm=I=" + target.I + ":TP=" + target.TP + ":LRA=" + target.LRA +
    ":measured_I=" + measured.input_i +
    ":measured_TP=" + measured.input_tp +
    ":measured_LRA=" + measured.input_lra +
    ":measured_thresh=" + measured.input_thresh +
    ":offset=" + measured.target_offset +
    ":linear=true:print_format=summary";
  return [
    "-y", "-hide_banner", "-i", input,
    "-af", filter,
    "-ar", "48000", "-ac", "2", "-c:a", "aac", "-b:a", "256k",
    outPath,
  ];
}

/** O'lchov natijasini o'qiladigan xulosaga aylantiradi */
function summarize(measured, target) {
  target = target || DEFAULT_TARGET;
  return {
    before_LUFS: parseFloat(measured.input_i),
    before_TP: parseFloat(measured.input_tp),
    before_LRA: parseFloat(measured.input_lra),
    target_LUFS: target.I,
  };
}

module.exports = {
  DEFAULT_TARGET: DEFAULT_TARGET,
  buildMeasureArgs: buildMeasureArgs,
  parseLoudnormJson: parseLoudnormJson,
  buildNormalizeArgs: buildNormalizeArgs,
  summarize: summarize,
};
