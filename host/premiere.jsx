/*
 * Premiere Pro uchun host funksiyalari.
 * Keyingi bosqichlarda Auto-Cut, audio, A/B-Roll shu yerda to'ldiriladi.
 */

RM.ppro = RM.ppro || {};

/** Faol ketma-ketlik (sequence) haqida ma'lumot */
RM.ppro.activeSequenceInfo = function () {
  return RM.safe(function () {
    var seq = app.project.activeSequence;
    if (!seq) {
      return JSON.stringify({ ok: false, error: "Faol ketma-ketlik (sequence) yo'q" });
    }
    return JSON.stringify({
      ok: true,
      name: seq.name,
      videoTracks: seq.videoTracks.numTracks,
      audioTracks: seq.audioTracks.numTracks,
      timebase: seq.timebase,
    });
  });
};

/** Hozirgi tanlangan klipning fayl yo'li + timeline joylashuvini olish (Auto-Cut manbasi) */
RM.ppro.getSelectedClip = function () {
  return RM.safe(function () {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ ok: false, error: "Sequence yo'q" });
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var track = seq.videoTracks[t];
      for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        if (clip.isSelected()) {
          var path = clip.projectItem ? clip.projectItem.getMediaPath() : "";
          return JSON.stringify({
            ok: true,
            name: clip.name,
            path: path,
            trackIndex: t,                  // qaysi video trackda
            timelineStart: clip.start.seconds, // timeline'dagi boshlanishi (soniya)
            timelineEnd: clip.end.seconds,
            inPoint: clip.inPoint.seconds,     // manbadagi kirish nuqtasi
            outPoint: clip.outPoint.seconds,
          });
        }
      }
    }
    return JSON.stringify({ ok: false, error: "Tanlangan klip topilmadi. Timeline'da klipni belgilang." });
  });
};

/** Soniyani Premiere timecode satriga aylantiradi: "HH:MM:SS:FF" */
function RM_secToTimecode(sec, fps) {
  fps = fps || 30;
  if (sec < 0) sec = 0;
  var totalFrames = Math.round(sec * fps);
  var f = totalFrames % Math.round(fps);
  var totalSec = Math.floor(totalFrames / Math.round(fps));
  var s = totalSec % 60;
  var m = Math.floor(totalSec / 60) % 60;
  var h = Math.floor(totalSec / 3600);
  function p(n) { return (n < 10 ? "0" : "") + n; }
  return p(h) + ":" + p(m) + ":" + p(s) + ":" + p(f);
}


/** Loyiha ichida nomli bin (papka) topadi yoki yaratadi */
function RM_getOrCreateBin(name) {
  var root = app.project.rootItem;
  for (var i = 0; i < root.children.numItems; i++) {
    var it = root.children[i];
    if (it.name === name && it.type === ProjectItemType.BIN) return it;
  }
  return root.createBin(name);
}

/**
 * Auto-Cut'ni qo'llaydi: saqlanadigan bo'laklardan subkliplar yasab,
 * yangi sequence'ga ketma-ket joylaydi. Asl sequence tegilmaydi.
 * plan = { sourceName, keep: [{start,end}...] }  (start/end — manba fayl vaqti, soniya)
 */
RM.ppro.applyAutoCut = function (planJson) {
  return RM.safe(function () {
    var plan = JSON.parse(planJson);
    var keep = plan.keep || [];
    if (!keep.length) return JSON.stringify({ ok: false, error: "Saqlanadigan bo'lak yo'q" });

    // Tanlangan klipning manba projectItem'ini topamiz
    var src = RM_findSelectedProjectItem();
    if (!src) return JSON.stringify({ ok: false, error: "Tanlangan klip manbasi topilmadi" });

    app.beginUndoGroup("Reels Auto-Cut");
    RM_getOrCreateBin("RM-AutoCut");

    var subclips = [];
    for (var i = 0; i < keep.length; i++) {
      var k = keep[i];
      var nm = src.name.replace(/\.[^.]+$/, "") + "_" + (i + 1);
      // createSubClip(nomi, boshlanish, tugash, qattiqChegara, video, audio)
      var sub = src.createSubClip(nm, k.start, k.end, 1, 1, 1);
      if (sub) subclips.push(sub);
    }
    if (!subclips.length) {
      app.endUndoGroup();
      return JSON.stringify({ ok: false, error: "Subklip yaratilmadi" });
    }

    var result = RM_buildSequenceFromSubclips(subclips, plan.sourceName || src.name);
    app.endUndoGroup();
    return JSON.stringify({ ok: true, sequence: result.name, clips: subclips.length });
  });
};


/** Tanlangan klipning manba projectItem'ini qaytaradi */
function RM_findSelectedProjectItem() {
  var seq = app.project.activeSequence;
  if (!seq) return null;
  for (var t = 0; t < seq.videoTracks.numTracks; t++) {
    var track = seq.videoTracks[t];
    for (var c = 0; c < track.clips.numItems; c++) {
      if (track.clips[c].isSelected()) return track.clips[c].projectItem;
    }
  }
  return null;
}

/**
 * Subkliplardan yangi sequence yasaydi va ularni ketma-ket (overwrite) joylaydi.
 * Har bir bo'lak alohida klip bo'lib qoladi — keyin erkin tahrirlash mumkin.
 */
function RM_buildSequenceFromSubclips(subclips, baseName) {
  // Birinchi subklipdan sequence yasaymiz (sozlamalari manbaga mos bo'ladi)
  var seqName = baseName.replace(/\.[^.]+$/, "") + " - AutoCut";
  var newSeq = app.project.createNewSequenceFromClips
    ? app.project.createNewSequenceFromClips(seqName, [subclips[0]])
    : app.project.createNewSequence(seqName, "");

  // Agar createNewSequenceFromClips birinchi klipni qo'ygan bo'lsa, qolganini ulaymiz
  var vTrack = newSeq.videoTracks[0];
  var cursor = 0;
  // Birinchi klip allaqachon 0 da bo'lishi mumkin — uni hisobga olib kursorni suramiz
  if (vTrack.clips.numItems > 0) {
    cursor = vTrack.clips[vTrack.clips.numItems - 1].end.seconds;
  }
  for (var i = (vTrack.clips.numItems > 0 ? 1 : 0); i < subclips.length; i++) {
    vTrack.overwriteClip(subclips[i], cursor);
    // Yangi qo'shilgan klip oxiriga kursorni suramiz
    cursor = vTrack.clips[vTrack.clips.numItems - 1].end.seconds;
  }
  newSeq.openInTimeline ? newSeq.openInTimeline() : null;
  return { name: newSeq.name };
}


/**
 * SRT faylni loyihaga import qiladi (RM-Subtitles bin ichiga).
 * So'ng foydalanuvchi uni caption trekiga tortib qo'yadi (yoki biz qo'yamiz).
 */
RM.ppro.importSrt = function (srtPath) {
  return RM.safe(function () {
    var f = new File(srtPath);
    if (!f.exists) return JSON.stringify({ ok: false, error: "SRT topilmadi: " + srtPath });
    RM_getOrCreateBin("RM-Subtitles");
    var ok = app.project.importFiles([srtPath], true,
      RM_getOrCreateBin("RM-Subtitles"), false);
    return JSON.stringify({
      ok: !!ok,
      path: srtPath,
      note: "SRT 'RM-Subtitles' binga import qilindi. Caption trekiga tortib qo'ying.",
    });
  });
};


/** QE DOM'ni yoqadi va qaytaradi (track qo'shish/nomlash uchun kerak) */
function RM_qe() {
  if (typeof qe === "undefined") app.enableQE();
  return qe;
}

/** Nomi bo'yicha audio trek topadi; bo'lmasa yangi qo'shib nomlaydi. Indeksni qaytaradi. */
function RM_ensureAudioTrack(seq, trackName) {
  for (var i = 0; i < seq.audioTracks.numTracks; i++) {
    if (seq.audioTracks[i].name === trackName) return i;
  }
  // QE orqali yangi audio trek qo'shamiz
  try {
    var q = RM_qe();
    var qseq = q.project.getActiveSequence();
    // addTracks(video, videoIndex, audio, audioIndex)
    qseq.addTracks(0, 0, 1, seq.audioTracks.numTracks);
    var newIdx = seq.audioTracks.numTracks - 1;
    var qTrack = q.project.getActiveSequence().getAudioTrackAt(newIdx);
    if (qTrack && qTrack.setName) qTrack.setName(trackName);
    return newIdx;
  } catch (e) {
    return seq.audioTracks.numTracks - 1; // bo'lmasa oxirgi trek
  }
}

/**
 * Normallashtirilgan audio faylni import qilib, nomli audio trekka joylaydi.
 * filePath - ffmpeg yasagan -14 LUFS fayl. trackName - "Voice" / "Music" / "SFX".
 * atTime - timeline joylashuvi (soniya).
 */
RM.ppro.placeNormalizedAudio = function (filePath, trackName, atTime) {
  return RM.safe(function () {
    var f = new File(filePath);
    if (!f.exists) return JSON.stringify({ ok: false, error: "Audio fayl yo'q: " + filePath });
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ ok: false, error: "Sequence yo'q" });

    app.beginUndoGroup("Reels ovoz tekislash");
    var bin = RM_getOrCreateBin("RM-Audio");
    app.project.importFiles([filePath], true, bin, false);
    // Import qilingan projectItem'ni topamiz (oxirgi qo'shilgan)
    var item = RM_lastImported(bin, f.name);
    if (!item) { app.endUndoGroup(); return JSON.stringify({ ok: false, error: "Import topilmadi" }); }

    var trackIdx = RM_ensureAudioTrack(seq, trackName || "Voice");
    seq.audioTracks[trackIdx].overwriteClip(item, (atTime || 0));
    app.endUndoGroup();
    return JSON.stringify({ ok: true, track: trackName || "Voice", trackIndex: trackIdx });
  });
};

/** Bin ichidan nomi bo'yicha (yoki oxirgi) projectItem'ni qaytaradi */
function RM_lastImported(bin, fileName) {
  var found = null;
  for (var i = 0; i < bin.children.numItems; i++) {
    var it = bin.children[i];
    if (it.name === fileName) found = it;
  }
  if (!found && bin.children.numItems > 0) found = bin.children[bin.children.numItems - 1];
  return found;
}


/** Timeline'da tanlangan barcha video kliplarni qaytaradi (A/B-Roll uchun) */
RM.ppro.getSelectedClips = function () {
  return RM.safe(function () {
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ ok: false, error: "Sequence yo'q" });
    var clips = [];
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
      var track = seq.videoTracks[t];
      for (var c = 0; c < track.clips.numItems; c++) {
        var clip = track.clips[c];
        if (clip.isSelected() && clip.projectItem) {
          clips.push({
            name: clip.name,
            path: clip.projectItem.getMediaPath(),
            duration: clip.duration ? clip.duration.seconds : 0,
          });
        }
      }
    }
    if (!clips.length) return JSON.stringify({ ok: false, error: "Tanlangan klip yo'q. Bir nechta klipni belgilang." });
    return JSON.stringify({ ok: true, clips: clips });
  });
};

/** Loyihadan media yo'li bo'yicha projectItem topadi (rekursiv) */
function RM_findItemByPath(item, targetPath) {
  item = item || app.project.rootItem;
  for (var i = 0; i < item.children.numItems; i++) {
    var ch = item.children[i];
    if (ch.type === ProjectItemType.BIN) {
      var found = RM_findItemByPath(ch, targetPath);
      if (found) return found;
    } else {
      try { if (ch.getMediaPath && ch.getMediaPath() === targetPath) return ch; } catch (e) {}
    }
  }
  return null;
}


/** V2 (ustki video) trek mavjudligini ta'minlaydi, indeksini qaytaradi */
function RM_ensureOverlayTrack(seq) {
  if (seq.videoTracks.numTracks >= 2) return 1;
  try {
    var q = RM_qe();
    var qseq = q.project.getActiveSequence();
    qseq.addTracks(1, seq.videoTracks.numTracks, 0, 0);
    return seq.videoTracks.numTracks - 1;
  } catch (e) { return 0; }
}

/**
 * A/B-Roll sequence quradi: A-Roll → V1 ketma-ket, B-Roll → V2 ustki qatlam.
 * plan = { aroll:[{name,path,duration}], placements:[{name,path,at,dur}] }
 * Asl montaj tegilmaydi (yangi sequence). Har klip alohida — tahrirlanadi.
 */
RM.ppro.buildABSequence = function (planJson) {
  return RM.safe(function () {
    var plan = JSON.parse(planJson);
    if (!plan.aroll || !plan.aroll.length) {
      return JSON.stringify({ ok: false, error: "A-Roll topilmadi" });
    }
    app.beginUndoGroup("Reels A/B-Roll");

    // Birinchi A-Roll'dan sequence yasaymiz
    var firstItem = RM_findItemByPath(null, plan.aroll[0].path);
    if (!firstItem) { app.endUndoGroup(); return JSON.stringify({ ok: false, error: "A-Roll manbasi topilmadi" }); }
    var seqName = "Reels A-B - " + (new Date().getTime());
    var newSeq = app.project.createNewSequenceFromClips(seqName, [firstItem]);

    var v1 = newSeq.videoTracks[0];
    var cursor = v1.clips.numItems ? v1.clips[v1.clips.numItems - 1].end.seconds : 0;
    for (var i = 1; i < plan.aroll.length; i++) {
      var it = RM_findItemByPath(null, plan.aroll[i].path);
      if (it) { v1.overwriteClip(it, cursor); cursor = v1.clips[v1.clips.numItems - 1].end.seconds; }
    }

    // B-Roll'ni V2 ga joylash (har biri dur uzunlikda)
    var overIdx = RM_ensureOverlayTrack(newSeq);
    var placed = 0;
    var places = plan.placements || [];
    for (var j = 0; j < places.length; j++) {
      var p = places[j];
      var src = RM_findItemByPath(null, p.path);
      if (!src) continue;
      var sub = src.createSubClip(p.name + "_b" + (j + 1), 0, p.dur || 3, 1, 1, 1);
      if (sub) { newSeq.videoTracks[overIdx].overwriteClip(sub, p.at || 0); placed++; }
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, sequence: newSeq.name, aroll: plan.aroll.length, broll: placed });
  });
};


/**
 * AI yaratgan B-Roll fayllarni import qilib, faol sequence'ning V2 (ustki) trekiga joylaydi.
 * itemsJson = [{ at, path }]  at = timeline vaqti (soniya)
 */
RM.ppro.importAndPlaceBroll = function (itemsJson) {
  return RM.safe(function () {
    var items = JSON.parse(itemsJson);
    if (!items || !items.length) return JSON.stringify({ ok: false, error: "Fayl yo'q" });
    var seq = app.project.activeSequence;
    if (!seq) return JSON.stringify({ ok: false, error: "Faol sequence yo'q" });

    app.beginUndoGroup("AI B-Roll joylash");
    var bin = RM_getOrCreateBin("RM-Broll");
    var overIdx = RM_ensureOverlayTrack(seq);
    var placed = 0;
    for (var i = 0; i < items.length; i++) {
      var f = new File(items[i].path);
      if (!f.exists) continue;
      app.project.importFiles([items[i].path], true, bin, false);
      var pItem = RM_lastImported(bin, f.name);
      if (pItem) {
        seq.videoTracks[overIdx].overwriteClip(pItem, items[i].at || 0);
        placed++;
      }
    }
    app.endUndoGroup();
    return JSON.stringify({ ok: true, placed: placed, track: "V" + (overIdx + 1) });
  });
};
