/*
 * After Effects uchun host funksiyalari.
 * Keyingi bosqichlarda Motion presetlar shu yerda to'ldiriladi.
 */

RM.aeft = RM.aeft || {};

/** Faol kompozitsiya haqida ma'lumot */
RM.aeft.activeCompInfo = function () {
  return RM.safe(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return JSON.stringify({ ok: false, error: "Faol kompozitsiya (comp) yo'q" });
    }
    return JSON.stringify({
      ok: true,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate,
      numLayers: comp.numLayers,
    });
  });
};

/** Reels uchun standart 1080x1920 vertikal comp yaratish */
RM.aeft.createReelsComp = function () {
  return RM.safe(function () {
    app.beginUndoGroup("Reels comp yaratish");
    var comp = app.project.items.addComp("Reels 1080x1920", 1080, 1920, 1, 15, 30);
    comp.openInViewer();
    app.endUndoGroup();
    return JSON.stringify({ ok: true, name: comp.name });
  });
};


/**
 * Subtitrlarni faol kompozitsiyaga alohida matn layerlari sifatida qo'shadi.
 * Har bir qator — mustaqil, tahrirlanadigan layer (in/out vaqti bilan).
 * segmentsJson = [{start,end,text}...] (soniya)
 * opts = { fontSize, bottomMargin }
 */
RM.aeft.createSubtitles = function (segmentsJson, optsJson) {
  return RM.safe(function () {
    var segs = JSON.parse(segmentsJson);
    var opts = optsJson ? JSON.parse(optsJson) : {};
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return JSON.stringify({ ok: false, error: "Faol kompozitsiya (comp) yo'q. Avval comp oching." });
    }
    var fontSize = opts.fontSize || Math.round(comp.height * 0.05);
    var bottomMargin = opts.bottomMargin || Math.round(comp.height * 0.12);

    app.beginUndoGroup("Reels subtitrlar");
    var made = 0;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (!s.text) continue;
      var layer = comp.layers.addText(s.text);
      layer.name = "Sub " + (i + 1);
      // Vaqt oralig'i
      layer.inPoint = s.start;
      layer.outPoint = s.end;
      // Stil
      RM_styleSubtitle(layer, fontSize);
      // Pastki markazga joylash
      layer.property("Transform").property("Position").setValue(
        [comp.width / 2, comp.height - bottomMargin]);
      made++;
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, layers: made, comp: comp.name });
  });
};

/** Subtitr matn layeriga oddiy o'qiladigan stil beradi (oq matn, qora kontur) */
function RM_styleSubtitle(layer, fontSize) {
  var textProp = layer.property("Source Text");
  var doc = textProp.value;
  doc.fontSize = fontSize;
  doc.fillColor = [1, 1, 1];
  doc.applyStroke = true;
  doc.strokeColor = [0, 0, 0];
  doc.strokeWidth = Math.max(2, Math.round(fontSize * 0.08));
  doc.strokeOverFill = false;
  doc.justification = ParagraphJustification.CENTER_JUSTIFY;
  textProp.setValue(doc);
}


/** Faol comp'dagi asosiy footage'ning fayl yo'lini qaytaradi (transkripsiya manbasi) */
RM.aeft.getActiveSourcePath = function () {
  return RM.safe(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return JSON.stringify({ ok: false, error: "Faol comp yo'q" });
    }
    // Avval tanlangan layerni, bo'lmasa birinchi footage layerni olamiz
    var layers = comp.selectedLayers && comp.selectedLayers.length
      ? comp.selectedLayers : null;
    function pathOf(layer) {
      if (layer && layer.source && layer.source instanceof FootageItem &&
          layer.source.mainSource && layer.source.mainSource.file) {
        return layer.source.mainSource.file.fsName;
      }
      return null;
    }
    if (layers) {
      for (var i = 0; i < layers.length; i++) {
        var p = pathOf(layers[i]);
        if (p) return JSON.stringify({ ok: true, path: p, name: layers[i].name });
      }
    }
    for (var j = 1; j <= comp.numLayers; j++) {
      var p2 = pathOf(comp.layer(j));
      if (p2) return JSON.stringify({ ok: true, path: p2, name: comp.layer(j).name });
    }
    return JSON.stringify({ ok: false, error: "Fayl manbali layer topilmadi" });
  });
};


// ===== 6-bosqich: Motion presetlari =====

/** Ikki keyframe orasiga silliq (ease) bezier interpolatsiya qo'yadi */
function RM_smoothKeys(prop, k1, k2, influence) {
  influence = influence || 80; // 0..100, kattaroq = silliqroq
  var easeOut = new KeyframeEase(0, influence);
  var easeIn = new KeyframeEase(0, influence);
  // Birinchi keyframe — chiqishda ease, ikkinchi — kirishda ease
  var dim = prop.value instanceof Array ? prop.value.length : 1;
  function arr(e) { var a = []; for (var i = 0; i < dim; i++) a.push(e); return a; }
  prop.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
  prop.setTemporalEaseAtKey(k1, arr(easeOut), arr(easeOut));
  prop.setTemporalEaseAtKey(k2, arr(easeIn), arr(easeIn));
}

/** Property'ga ikki vaqtli qiymat qo'yadi va silliq ease beradi. Key indekslarni qaytaradi. */
function RM_animProp(prop, t1, v1, t2, v2, influence) {
  prop.setValueAtTime(t1, v1);
  prop.setValueAtTime(t2, v2);
  var k1 = prop.nearestKeyIndex(t1);
  var k2 = prop.nearestKeyIndex(t2);
  RM_smoothKeys(prop, k1, k2, influence);
  return [k1, k2];
}


/** Mavjud motion presetlar ro'yxati (panel shu ro'yxatni ko'rsatadi) */
RM.aeft.listMotionPresets = function () {
  return JSON.stringify({ ok: true, presets: [
    { id: "fadeIn",     name: "Fade In",        desc: "Silliq paydo bo'lish" },
    { id: "popIn",      name: "Pop In",         desc: "Kichikdan kattaga (scale)" },
    { id: "slideLeft",  name: "Slide ← ",       desc: "Chapdan kirish" },
    { id: "slideRight", name: "Slide → ",       desc: "O'ngdan kirish" },
    { id: "slideUp",    name: "Slide ↑",        desc: "Pastdan ko'tarilish" },
    { id: "smoothZoom", name: "Smooth Zoom",    desc: "Sekin yaqinlashish (Ken Burns)" },
    { id: "fadeOut",    name: "Fade Out",       desc: "Oxirida yo'qolish" },
  ] });
};

/**
 * Tanlangan layer(lar)ga motion presetini qo'llaydi (silliq keyframelar bilan).
 * opts = { dur } — animatsiya uzunligi (soniya, default 0.7)
 */
RM.aeft.applyMotion = function (presetId, optsJson) {
  return RM.safe(function () {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) {
      return JSON.stringify({ ok: false, error: "Faol comp yo'q" });
    }
    var layers = comp.selectedLayers;
    if (!layers || !layers.length) {
      return JSON.stringify({ ok: false, error: "Layer tanlanmagan. AE'da layer belgilang." });
    }
    var opts = optsJson ? JSON.parse(optsJson) : {};
    var dur = opts.dur || 0.7;

    app.beginUndoGroup("Reels motion: " + presetId);
    for (var i = 0; i < layers.length; i++) {
      RM_applyOne(comp, layers[i], presetId, dur);
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, applied: layers.length, preset: presetId });
  });
};


/** Bitta layerga presetni qo'llaydi */
function RM_applyOne(comp, layer, presetId, dur) {
  var tr = layer.property("Transform");
  var pos = tr.property("Position");
  var scale = tr.property("Scale");
  var opacity = tr.property("Opacity");
  var t0 = layer.inPoint;
  var t1 = t0 + dur;
  var W = comp.width, H = comp.height;
  var p = pos.value;        // asl pozitsiya
  var s = scale.value;      // asl o'lcham

  if (presetId === "fadeIn") {
    RM_animProp(opacity, t0, 0, t1, 100);
  } else if (presetId === "fadeOut") {
    var te = layer.outPoint;
    RM_animProp(opacity, te - dur, 100, te, 0);
  } else if (presetId === "popIn") {
    RM_animProp(scale, t0, [0, 0], t1, [s[0], s[1]], 85);
    RM_animProp(opacity, t0, 0, t0 + dur * 0.6, 100);
  } else if (presetId === "slideLeft") {
    RM_animProp(pos, t0, [p[0] + W * 0.5, p[1]], t1, [p[0], p[1]], 80);
    RM_animProp(opacity, t0, 0, t0 + dur * 0.5, 100);
  } else if (presetId === "slideRight") {
    RM_animProp(pos, t0, [p[0] - W * 0.5, p[1]], t1, [p[0], p[1]], 80);
    RM_animProp(opacity, t0, 0, t0 + dur * 0.5, 100);
  } else if (presetId === "slideUp") {
    RM_animProp(pos, t0, [p[0], p[1] + H * 0.4], t1, [p[0], p[1]], 80);
    RM_animProp(opacity, t0, 0, t0 + dur * 0.5, 100);
  } else if (presetId === "smoothZoom") {
    // Butun layer davomida sekin yaqinlashish
    var tEnd = layer.outPoint;
    RM_animProp(scale, t0, [s[0], s[1]], tEnd, [s[0] * 1.12, s[1] * 1.12], 50);
  }
}
