"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petBridge", {
  chat: (payload) => ipcRenderer.invoke("api:chat", payload),
  choosePetDirectory: () => ipcRenderer.invoke("pet:choose-directory"),
  getInitialState: () => ipcRenderer.invoke("app:get-state"),
  movePetBy: (delta) => ipcRenderer.send("pet:move-by", delta),
  openConsole: () => ipcRenderer.send("console:show"),
  resizePet: (scale) => ipcRenderer.send("pet:resize", scale),
  setMouseIgnore: (ignore) => ipcRenderer.send("pet:mouse-ignore", ignore),
  setPet: (pet) => ipcRenderer.send("pet:set", pet),
  setSpeech: (payload) => ipcRenderer.send("pet:speech", payload),
  setState: (payload) => ipcRenderer.send("pet:state", payload),
  tts: (payload) => ipcRenderer.invoke("api:tts", payload),
  onPetChanged: (callback) => ipcRenderer.on("pet:changed", (_event, payload) => callback(payload)),
  onPetState: (callback) => ipcRenderer.on("pet:state", (_event, payload) => callback(payload)),
  onPetSpeech: (callback) => ipcRenderer.on("pet:speech", (_event, payload) => callback(payload)),
  onPetScale: (callback) => ipcRenderer.on("pet:scale", (_event, payload) => callback(payload)),
});
