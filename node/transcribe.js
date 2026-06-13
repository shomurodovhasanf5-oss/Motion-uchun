/*
 * Reels Montaj AI - transkripsiya yordamchilari.
 * Offline: whisper.cpp (kompyuterda).  Online: API (tezroq, aniqroq).
 * Bu yerda asosan buyruq/argument quruvchilar — sinashga oson.
 */
"use strict";

var fs = require("fs");
var path = require("path");

/** whisper.cpp ijro faylini topadi (bin/win ichida) */
function findWhisper(extensionRoot) {
  var names = ["whisper-cli.exe", "main.exe", "whisper-cli", "main"];
  for (var i = 0; i < names.length; i++) {
    var p = path.join(extensionRoot, "bin", "win", names[i]);
    if (fs.existsSync(p)) return p;
    var p2 = path.join(extensionRoot, "bin", names[i]);
    if (fs.existsSync(p2)) return p2;
  }
  return null;
}

/** Model faylini topadi (models/ggml-*.bin). modelName bo'lmasa birinchisini oladi. */
function findModel(extensionRoot, modelName) {
  var dir = path.join(extensionRoot, "models");
  if (!fs.existsSync(dir)) return null;
  if (modelName) {
    var direct = path.join(dir, modelName);
    if (fs.existsSync(direct)) return direct;
  }
  var files = fs.readdirSync(dir).filter(function (f) { return /\.bin$/.test(f); });
  return files.length ? path.join(dir, files[0]) : null;
}

/** ffmpeg orqali 16kHz mono WAV ajratish argumentlari (whisper.cpp shuni xohlaydi) */
function buildWavExtractArgs(input, outWav) {
  return ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", outWav];
}


/**
 * whisper.cpp argumentlari. JSON chiqishi: <outBase>.json
 * language: "uz" | "ru" | "en" | "auto"
 */
function buildWhisperArgs(model, wav, language, outBase) {
  var args = ["-m", model, "-f", wav, "-oj", "-of", outBase];
  if (language && language !== "auto") args.push("-l", language);
  else args.push("-l", "auto");
  return args;
}

/**
 * Online API uchun so'rov ma'lumotlari (OpenAI Whisper mosligida).
 * Haqiqiy yuborish processor.js ichida (multipart) amalga oshiriladi.
 */
function buildApiRequestInfo(opts) {
  return {
    url: opts.baseUrl || "https://api.openai.com/v1/audio/transcriptions",
    model: opts.model || "whisper-1",
    language: opts.language && opts.language !== "auto" ? opts.language : undefined,
    responseFormat: "verbose_json", // segmentlar (vaqt belgilari) uchun
    headers: { Authorization: "Bearer " + (opts.apiKey || "") },
  };
}

module.exports = {
  findWhisper: findWhisper,
  findModel: findModel,
  buildWavExtractArgs: buildWavExtractArgs,
  buildWhisperArgs: buildWhisperArgs,
  buildApiRequestInfo: buildApiRequestInfo,
};
