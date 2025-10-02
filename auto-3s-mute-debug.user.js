// ==UserScript==
// @name         Auto 3s Mute for Google Meet (Debug)
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  マイクの音声レベルが一定以下になったら3秒後に自動でミュートする（デバッグ版）
// @author       You
// @match        https://meet.google.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_log
// ==/UserScript==

(function () {
  "use strict";

  // デバッグログ関数
  function debugLog(message, data = null) {
    console.log(`[Auto 3s Mute] ${message}`, data || '');
    GM_log(`[Auto 3s Mute] ${message}`);
  }

  debugLog("スクリプトが読み込まれました");

  // 設定のデフォルト値
  const DEFAULT_SETTINGS = {
    enabled: true,
    volumeThreshold: 0.01,
    silenceDuration: 3,
    showNotifications: true,
    debugMode: true, // デバッグ版ではデフォルトでON
  };

  // 音声レベル監視クラス
  class AudioLevelMonitor {
    constructor() {
      debugLog("AudioLevelMonitor コンストラクタが呼ばれました");
      
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
      try {
        const settings = GM_getValue("autoMuteSettings", DEFAULT_SETTINGS);
        this.volumeThreshold = settings.volumeThreshold || DEFAULT_SETTINGS.volumeThreshold;
        this.maxSilenceDuration = settings.silenceDuration || DEFAULT_SETTINGS.silenceDuration;
        this.debugMode = settings.debugMode !== undefined ? settings.debugMode : DEFAULT_SETTINGS.debugMode;
        debugLog("設定を読み込みました", settings);
      } catch (error) {
        debugLog("設定の読み込みに失敗しました", error);
      }
    }

    // 設定を保存
    saveSettings() {
      try {
        const settings = {
          enabled: true,
          volumeThreshold: this.volumeThreshold,
          silenceDuration: this.maxSilenceDuration,
          showNotifications: true,
          debugMode: this.debugMode,
        };
        GM_setValue("autoMuteSettings", settings);
        debugLog("設定を保存しました", settings);
      } catch (error) {
        debugLog("設定の保存に失敗しました", error);
      }
    }

    // 初期化
    async init() {
      debugLog("初期化を開始します");
      
      if (!DEFAULT_SETTINGS.enabled) {
        debugLog("機能が無効化されています");
        return;
      }

      try {
        debugLog("マイクアクセスを要求します");
        // マイクアクセスを要求
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        debugLog("マイクアクセスが成功しました", stream);
        
        this.setupAudioContext(stream);
        this.startMonitoring();
        
        debugLog("音声レベル監視を開始しました");
      } catch (error) {
        debugLog("マイクアクセスに失敗しました", error);
        this.showError("マイクアクセスに失敗しました。マイクの許可を確認してください。");
      }
    }

    // AudioContextを設定
    setupAudioContext(stream) {
      try {
        debugLog("AudioContextを設定します");
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.microphone = this.audioContext.createMediaStreamSource(stream);
        this.analyser = this.audioContext.createAnalyser();

        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);

        this.microphone.connect(this.analyser);
        debugLog("AudioContextの設定が完了しました");
      } catch (error) {
        debugLog("AudioContextの設定に失敗しました", error);
      }
    }

    // 音声レベル監視を開始
    startMonitoring() {
      if (this.isMonitoring) {
        debugLog("既に監視中です");
        return;
      }

      debugLog("音声レベル監視を開始します");
      this.isMonitoring = true;
      this.monitorAudioLevel();
    }

    // 音声レベルを監視
    monitorAudioLevel() {
      if (!this.isMonitoring) {
        debugLog("監視が停止されています");
        return;
      }

      try {
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
            debugLog(`自動ミュートを実行します (無音時間: ${this.silenceDuration.toFixed(1)}s)`);
            this.autoMute();
          }
        } else {
          // 音声が検出された
          if (this.silenceDuration > 0) {
            debugLog(`音声が検出されました (音量: ${averageVolume.toFixed(4)})`);
          }
          this.silenceDuration = 0;
          if (this.isMuted && this.originalMuteState === false) {
            debugLog("自動ミュート解除を実行します");
            this.autoUnmute();
          }
        }

        setTimeout(() => this.monitorAudioLevel(), 100);
      } catch (error) {
        debugLog("音声レベル監視中にエラーが発生しました", error);
      }
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
      const muteButton = document.querySelector('[data-is-muted="true"]') || 
                        document.querySelector('[aria-label*="ミュート"]') ||
                        document.querySelector('[aria-label*="Mute"]');

      const wasMuted = this.isMuted;
      this.isMuted = muteButton !== null;
      
      if (wasMuted !== this.isMuted) {
        debugLog(`ミュート状態が変更されました: ${this.isMuted ? 'ON' : 'OFF'}`);
      }
    }

    // 自動ミュートを実行
    autoMute() {
      const muteButton = document.querySelector('[data-is-muted="false"]') ||
                        document.querySelector('[aria-label*="ミュート解除"]') ||
                        document.querySelector('[aria-label*="Unmute"]') ||
                        document.querySelector('[jsname="BOHaEe"]') ||
                        document.querySelector('[data-tooltip*="ミュート"]') ||
                        document.querySelector('[data-tooltip*="Mute"]');

      debugLog("ミュートボタンを検索中", muteButton);

      if (muteButton && !this.isMuted) {
        this.originalMuteState = this.isMuted;
        muteButton.click();
        debugLog("自動ミュートを実行しました");

        if (DEFAULT_SETTINGS.showNotifications) {
          try {
            GM_notification("自動ミュート", "音声が検出されなくなったため、自動的にミュートしました");
          } catch (error) {
            debugLog("通知の送信に失敗しました", error);
          }
        }
      } else {
        debugLog("ミュートボタンが見つからないか、既にミュート状態です");
      }
    }

    // 自動ミュート解除を実行
    autoUnmute() {
      const unmuteButton = document.querySelector('[data-is-muted="true"]') ||
                          document.querySelector('[aria-label*="ミュート解除"]') ||
                          document.querySelector('[aria-label*="Unmute"]');

      debugLog("ミュート解除ボタンを検索中", unmuteButton);

      if (unmuteButton && this.isMuted) {
        unmuteButton.click();
        debugLog("自動ミュート解除を実行しました");

        if (DEFAULT_SETTINGS.showNotifications) {
          try {
            GM_notification("自動ミュート解除", "音声が検出されたため、自動的にミュートを解除しました");
          } catch (error) {
            debugLog("通知の送信に失敗しました", error);
          }
        }
      } else {
        debugLog("ミュート解除ボタンが見つからないか、既にミュート解除状態です");
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
      debugLog("デバッグ表示を作成しました");
    }

    // エラー表示
    showError(message) {
      const errorDiv = document.createElement("div");
      errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ff4444;
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 14px;
        max-width: 400px;
        text-align: center;
      `;
      errorDiv.textContent = message;
      document.body.appendChild(errorDiv);
      
      setTimeout(() => {
        errorDiv.remove();
      }, 5000);
    }

    // デバッグモードを切り替え
    toggleDebugMode() {
      this.debugMode = !this.debugMode;
      this.saveSettings();
      if (!this.debugMode && this.debugDisplay) {
        this.debugDisplay.remove();
        this.debugDisplay = null;
      }
      debugLog("デバッグモード", this.debugMode ? "ON" : "OFF");
    }

    // 音量閾値を調整
    adjustVolumeThreshold(newThreshold) {
      this.volumeThreshold = newThreshold;
      this.saveSettings();
      debugLog("音量閾値を変更しました", newThreshold);
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
      debugLog("監視を停止しました");
    }
  }

  // 監視インスタンスを作成
  let audioMonitor = null;

  // ページ読み込み完了後に監視を開始
  debugLog("ページの状態を確認します", document.readyState);
  
  if (document.readyState === "loading") {
    debugLog("DOMContentLoadedイベントを待機します");
    document.addEventListener("DOMContentLoaded", () => {
      debugLog("DOMContentLoadedイベントが発生しました");
      audioMonitor = new AudioLevelMonitor();
    });
  } else {
    debugLog("ページは既に読み込み完了しています");
    audioMonitor = new AudioLevelMonitor();
  }

  // デバッグ用のグローバル関数
  window.autoMuteDebug = {
    toggle: () => {
      debugLog("デバッグモードを切り替えます");
      audioMonitor?.toggleDebugMode();
    },
    setThreshold: (value) => {
      debugLog("音量閾値を設定します", value);
      audioMonitor?.adjustVolumeThreshold(value);
    },
    getInfo: () => {
      if (audioMonitor) {
        const info = {
          volumeThreshold: audioMonitor.volumeThreshold,
          silenceDuration: audioMonitor.silenceDuration,
          maxSilenceDuration: audioMonitor.maxSilenceDuration,
          isMuted: audioMonitor.isMuted,
          isMonitoring: audioMonitor.isMonitoring,
        };
        debugLog("現在の情報を取得しました", info);
        return info;
      }
      debugLog("audioMonitorが存在しません");
      return null;
    },
    restart: () => {
      debugLog("監視を再起動します");
      audioMonitor?.stopMonitoring();
      audioMonitor = new AudioLevelMonitor();
    }
  };

  // 設定UIを追加
  function createSettingsUI() {
    debugLog("設定UIを作成します");
    
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
        <button id="restartButton" style="background: #2196f3; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">再起動</button>
        <button id="closeSettings" style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">閉じる</button>
      </div>
    `;

    document.body.appendChild(settingsPanel);

    // イベントリスナーを設定
    document.getElementById("debugMode").addEventListener("change", (e) => {
      debugLog("デバッグモードを切り替えます");
      audioMonitor?.toggleDebugMode();
    });

    document.getElementById("volumeThreshold").addEventListener("input", (e) => {
      const value = parseFloat(e.target.value);
      debugLog("音量閾値を変更します", value);
      audioMonitor?.adjustVolumeThreshold(value);
      document.getElementById("thresholdValue").textContent = value.toFixed(3);
    });

    document.getElementById("silenceDuration").addEventListener("input", (e) => {
      const value = parseInt(e.target.value);
      debugLog("無音時間を変更します", value);
      audioMonitor.maxSilenceDuration = value;
      audioMonitor.saveSettings();
      document.getElementById("durationValue").textContent = value;
    });

    document.getElementById("restartButton").addEventListener("click", () => {
      debugLog("監視を再起動します");
      audioMonitor?.stopMonitoring();
      audioMonitor = new AudioLevelMonitor();
      settingsPanel.remove();
    });

    document.getElementById("closeSettings").addEventListener("click", () => {
      settingsPanel.remove();
    });
  }

  // 設定ボタンを追加
  function addSettingsButton() {
    debugLog("設定ボタンを追加します");
    
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
    debugLog("設定ボタンを追加しました");
  }

  // 設定ボタンを追加（少し遅延して）
  setTimeout(() => {
    debugLog("設定ボタンの追加を試行します");
    addSettingsButton();
  }, 2000);

  debugLog("スクリプトの初期化が完了しました");

})();

