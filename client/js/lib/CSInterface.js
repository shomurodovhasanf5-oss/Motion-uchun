/*
 * CSInterface - Adobe CEP uchun ixcham, ishlaydigan ko'prik.
 * Bu panel ehtiyojlari uchun yetarli: evalScript, system path, host env, event.
 * To'liq rasmiy versiya: https://github.com/Adobe-CEP/CEP-Resources
 */

/* global window */

function SystemPath() {}
SystemPath.USER_DATA = "userData";
SystemPath.COMMON_FILES = "commonFiles";
SystemPath.MY_DOCUMENTS = "myDocuments";
SystemPath.APPLICATION = "application";
SystemPath.EXTENSION = "extension";
SystemPath.HOST_APPLICATION = "hostApplication";

function CSEvent(type, scope, appId, extensionId) {
  this.type = type;
  this.scope = scope || "APPLICATION";
  this.appId = appId;
  this.extensionId = extensionId;
  this.data = "";
}

function HostEnvironment(hostEnv) {
  this.appName = hostEnv.appName;
  this.appVersion = hostEnv.appVersion;
  this.appLocale = hostEnv.appLocale;
  this.appUILocale = hostEnv.appUILocale;
  this.appId = hostEnv.appId;
  this.isAppOnline = hostEnv.isAppOnline;
  this.appSkinInfo = hostEnv.appSkinInfo;
}

function CSInterface() {}

CSInterface.THEME_COLOR_CHANGED_EVENT = "com.adobe.csxs.events.ThemeColorChanged";

/** ExtendScript (.jsx) kodini host (Premiere/AE) ichida bajaradi */
CSInterface.prototype.evalScript = function (script, callback) {
  if (callback === null || callback === undefined) {
    callback = function () {};
  }
  window.__adobe_cep__.evalScript(script, callback);
};

/** Hozirgi host dasturi haqida ma'lumot (PPRO yoki AEFT, versiya, til) */
CSInterface.prototype.getHostEnvironment = function () {
  var hostEnv = JSON.parse(window.__adobe_cep__.getHostEnvironment());
  return new HostEnvironment(hostEnv);
};

/** Operatsion tizim haqida (Windows/Mac) */
CSInterface.prototype.getOSInformation = function () {
  var userAgent = navigator.userAgent;
  if (navigator.platform === "Win32" || navigator.platform === "Windows") {
    var winVersion = "Windows";
    var winBit = "32";
    if (userAgent.indexOf("WOW64") > -1 || userAgent.indexOf("Win64") > -1) {
      winBit = "64";
    }
    return winVersion + " " + winBit + "-bit";
  }
  return navigator.platform;
};

/** Tizim yo'llari (extension papkasi, userData va h.k.) */
CSInterface.prototype.getSystemPath = function (pathType) {
  var path = decodeURIComponent(window.__adobe_cep__.getSystemPath(pathType));
  var OSVersion = this.getOSInformation();
  if (OSVersion.indexOf("Windows") >= 0) {
    path = path.replace("file:///", "");
  } else if (OSVersion.indexOf("Mac") >= 0) {
    path = path.replace("file://", "");
  }
  return path;
};

/** Host'dan kelgan eventlarga obuna bo'lish */
CSInterface.prototype.addEventListener = function (type, listener, obj) {
  window.__adobe_cep__.addEventListener(type, listener, obj);
};

CSInterface.prototype.removeEventListener = function (type, listener, obj) {
  window.__adobe_cep__.removeEventListener(type, listener, obj);
};

/** Host'ga event yuborish */
CSInterface.prototype.dispatchEvent = function (event) {
  if (typeof event.data === "object") {
    event.data = JSON.stringify(event.data);
  }
  window.__adobe_cep__.dispatchEvent(event);
};

CSInterface.prototype.requestOpenExtension = function (extensionId, params) {
  window.__adobe_cep__.requestOpenExtension(extensionId, params);
};

CSInterface.prototype.getExtensionID = function () {
  return window.__adobe_cep__.getExtensionId();
};

/** Tashqi URL'ni brauzerda ochish */
CSInterface.prototype.openURLInDefaultBrowser = function (url) {
  return window.cep.util.openURLInDefaultBrowser(url);
};

/** Panel mavzu rangini olish (qorong'i/yorug') */
CSInterface.prototype.getHostEnvironmentSkinInfo = function () {
  try {
    return JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo;
  } catch (e) {
    return null;
  }
};

CSInterface.prototype.getApplicationID = function () {
  return this.getHostEnvironment().appId;
};

// Brauzerda (test rejimi) qulab tushmasligi uchun himoya
if (typeof window !== "undefined" && !window.__adobe_cep__) {
  console.warn("[CSInterface] __adobe_cep__ topilmadi — brauzer test rejimi.");
}
