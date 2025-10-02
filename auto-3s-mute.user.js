// ==UserScript==
// @name         Auto 3s Mute for Google Meet
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  マイクの音声レベルが一定以下になったら3秒後に自動でミュートする
// @author       You
// @match        https://meet.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  // 設定のデフォルト値
  const DEFAULT_SETTINGS = {
    enabled: true,
    volumeThreshold: 0.01,
    silenceDuration: 3,
    showNotifications: true,
    debugMode: false,
  };

  // 音声レベル監視クラス
  class AudioLevelMonitor {
    constructor() {
      this.audioContext = null;
      this.analyser = null;
      this.microphone = null;
      this.dataArray = null;
      this.isMonitoring = false;
      this.volumeThreshold = DEFAULT_SETTINGS.volumeThreshold;
      this.silenceDuration = 0;
      this.maxSilenceDuration = DEFAULT_SETTINGS.silenceDuration;
      this.isMuted = false;
      this.originalMuteState = false;
      this.debugMode = DEFAULT_SETTINGS.debugMode;
      this.debugDisplay = null;

      this.loadSettings();
      this.init();
    }

    // 設定を読み込み
    loadSettings() {
      const settings = GM_getValue("autoMuteSettings", DEFAULT_SETTINGS);
      this.volumeThreshold = settings.volumeThreshold || DEFAULT_SETTINGS.volumeThreshold;
      this.maxSilenceDuration = settings.silenceDuration || DEFAULT_SETTINGS.silenceDuration;
      this.debugMode = settings.debugMode || DEFAULT_SETTINGS.debugMode;
    }

    // 設定を保存
    saveSettings() {
      const settings = {
        enabled: true,
        volumeThreshold: this.volumeThreshold,
        silenceDuration: this.maxSilenceDuration,
        showNotifications: true,
        debugMode: this.debugMode,
      };
      GM_setValue("autoMuteSettings", settings);
    }

    // 初期化
    async init() {
      if (!DEFAULT_SETTINGS.enabled) return;

      try {
        // マイクアクセスを要求
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.setupAudioContext(stream);
        this.startMonitoring();

        console.log("Auto 3s Mute: 音声レベル監視を開始しました");
      } catch (error) {
        console.error("Auto 3s Mute: マイクアクセスに失敗しました:", error);
      }
    }

    // AudioContextを設定
    setupAudioContext(stream) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();

      this.analyser.fftSize = 256;
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);

      this.microphone.connect(this.analyser);
    }

    // 音声レベル監視を開始
    startMonitoring() {
      if (this.isMonitoring) return;

      this.isMonitoring = true;
      this.monitorAudioLevel();
    }

    // 音声レベルを監視
    monitorAudioLevel() {
      if (!this.isMonitoring) return;

      this.analyser.getByteFrequencyData(this.dataArray);
      const averageVolume = this.calculateAverageVolume();
      this.checkMuteState();

      // デバッグ表示
      if (this.debugMode) {
        this.updateDebugDisplay(averageVolume);
      }

      if (averageVolume < this.volumeThreshold) {
        // 無音状態
        this.silenceDuration += 0.1;

        if (this.silenceDuration >= this.maxSilenceDuration && !this.isMuted) {
          this.autoMute();
        }
      } else {
        // 音声が検出された
        this.silenceDuration = 0;
        if (this.isMuted && this.originalMuteState === false) {
          this.autoUnmute();
        }
      }

      setTimeout(() => this.monitorAudioLevel(), 100);
    }

    // 平均音量を計算
    calculateAverageVolume() {
      let sum = 0;
      for (let i = 0; i < this.dataArray.length; i++) {
        sum += this.dataArray[i];
      }
      return sum / this.dataArray.length / 255;
    }

    // 現在のミュート状態を確認
    checkMuteState() {
      const muteButton = document.querySelector('[data-is-muted="true"]') || document.querySelector('[aria-label*="ミュート"]') || document.querySelector('[aria-label*="Mute"]');

      this.isMuted = muteButton !== null;
    }

    // 自動ミュートを実行
    autoMute() {
      const muteButton = document.querySelector('[data-is-muted="false"]') || document.querySelector('[aria-label*="ミュート解除"]') || document.querySelector('[aria-label*="Unmute"]') || document.querySelector('[jsname="BOHaEe"]') || document.querySelector('[data-tooltip*="ミュート"]') || document.querySelector('[data-tooltip*="Mute"]');

      if (muteButton && !this.isMuted) {
        this.originalMuteState = this.isMuted;
        muteButton.click();
        console.log("Auto 3s Mute: 自動ミュートを実行しました");

        if (DEFAULT_SETTINGS.showNotifications) {
          GM_notification("自動ミュート", "音声が検出されなくなったため、自動的にミュートしました");
        }
      }
    }

    // 自動ミュート解除を実行
    autoUnmute() {
      const unmuteButton = document.querySelector('[data-is-muted="true"]') || document.querySelector('[aria-label*="ミュート解除"]') || document.querySelector('[aria-label*="Unmute"]');

      if (unmuteButton && this.isMuted) {
        unmuteButton.click();
        console.log("Auto 3s Mute: 自動ミュート解除を実行しました");

        if (DEFAULT_SETTINGS.showNotifications) {
          GM_notification("自動ミュート解除", "音声が検出されたため、自動的にミュートを解除しました");
        }
      }
    }

    // デバッグ表示を更新
    updateDebugDisplay(averageVolume) {
      if (!this.debugDisplay) {
        this.createDebugDisplay();
      }

      if (this.debugDisplay) {
        this.debugDisplay.innerHTML = `
                    <div style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 10000;">
                        <div>音量レベル: ${averageVolume.toFixed(4)}</div>
                        <div>閾値: ${this.volumeThreshold.toFixed(4)}</div>
                        <div>無音時間: ${this.silenceDuration.toFixed(1)}s / ${this.maxSilenceDuration}s</div>
                        <div>ミュート状態: ${this.isMuted ? "ON" : "OFF"}</div>
                        <div>監視状態: ${this.isMonitoring ? "ON" : "OFF"}</div>
                    </div>
                `;
      }
    }

    // デバッグ表示を作成
    createDebugDisplay() {
      this.debugDisplay = document.createElement("div");
      document.body.appendChild(this.debugDisplay);
    }

    // デバッグモードを切り替え
    toggleDebugMode() {
      this.debugMode = !this.debugMode;
      this.saveSettings();
      if (!this.debugMode && this.debugDisplay) {
        this.debugDisplay.remove();
        this.debugDisplay = null;
      }
      console.log("Auto 3s Mute: デバッグモード", this.debugMode ? "ON" : "OFF");
    }

    // 音量閾値を調整
    adjustVolumeThreshold(newThreshold) {
      this.volumeThreshold = newThreshold;
      this.saveSettings();
      console.log("Auto 3s Mute: 音量閾値を", newThreshold, "に変更しました");
    }

    // 監視を停止
    stopMonitoring() {
      this.isMonitoring = false;
      if (this.audioContext) {
        this.audioContext.close();
      }
      if (this.debugDisplay) {
        this.debugDisplay.remove();
        this.debugDisplay = null;
      }
    }
  }

  // 監視インスタンスを作成
  let audioMonitor = null;

  // ページ読み込み完了後に監視を開始
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      audioMonitor = new AudioLevelMonitor();
    });
  } else {
    audioMonitor = new AudioLevelMonitor();
  }

  // デバッグ用のグローバル関数
  window.autoMuteDebug = {
    toggle: () => audioMonitor?.toggleDebugMode(),
    setThreshold: (value) => audioMonitor?.adjustVolumeThreshold(value),
    getInfo: () => {
      if (audioMonitor) {
        return {
          volumeThreshold: audioMonitor.volumeThreshold,
          silenceDuration: audioMonitor.silenceDuration,
          maxSilenceDuration: audioMonitor.maxSilenceDuration,
          isMuted: audioMonitor.isMuted,
          isMonitoring: audioMonitor.isMonitoring,
        };
      }
      return null;
    },
  };

  // 設定UIを追加
  function createSettingsUI() {
    const settingsPanel = document.createElement("div");
    settingsPanel.id = "autoMuteSettings";
    settingsPanel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            min-width: 250px;
        `;

    settingsPanel.innerHTML = `
            <h3 style="margin: 0 0 10px 0; color: #333;">Auto 3s Mute 設定</h3>
            <div style="margin-bottom: 10px;">
                <label>
                    <input type="checkbox" id="debugMode" ${audioMonitor?.debugMode ? "checked" : ""}>
                    デバッグモード
                </label>
            </div>
            <div style="margin-bottom: 10px;">
                <label>
                    音量閾値: <span id="thresholdValue">${audioMonitor?.volumeThreshold || 0.01}</span>
                </label>
                <input type="range" id="volumeThreshold" min="0.001" max="0.1" step="0.001" 
                       value="${audioMonitor?.volumeThreshold || 0.01}" style="width: 100%;">
            </div>
            <div style="margin-bottom: 10px;">
                <label>
                    無音時間: <span id="durationValue">${audioMonitor?.maxSilenceDuration || 3}</span>秒
                </label>
                <input type="range" id="silenceDuration" min="1" max="10" step="1" 
                       value="${audioMonitor?.maxSilenceDuration || 3}" style="width: 100%;">
            </div>
            <div style="text-align: right;">
                <button id="closeSettings" style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">閉じる</button>
            </div>
        `;

    document.body.appendChild(settingsPanel);

    // イベントリスナーを設定
    document.getElementById("debugMode").addEventListener("change", (e) => {
      audioMonitor?.toggleDebugMode();
    });

    document.getElementById("volumeThreshold").addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      audioMonitor?.adjustVolumeThreshold(value);
      document.getElementById("thresholdValue").textContent = value.toFixed(3);
    });

    document.getElementById("silenceDuration").addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      audioMonitor.maxSilenceDuration = value;
      audioMonitor.saveSettings();
      document.getElementById("durationValue").textContent = value;
    });

    document.getElementById("closeSettings").addEventListener("click", () => {
      settingsPanel.remove();
    });
  }

  // 設定ボタンを追加
  function addSettingsButton() {
    const settingsButton = document.createElement("button");
    settingsButton.innerHTML = "🎤 Auto Mute";
    settingsButton.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            z-index: 9999;
            font-size: 12px;
        `;

    settingsButton.addEventListener("click", createSettingsUI);
    document.body.appendChild(settingsButton);
  }

  // 設定ボタンを追加（少し遅延して）
  setTimeout(addSettingsButton, 2000);
})();
