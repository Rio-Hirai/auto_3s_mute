// Google Meetページでマイクの音声レベルを監視するcontent script
class AudioLevelMonitor {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.dataArray = null;
    this.isMonitoring = false;
    this.volumeThreshold = 0.01; // デフォルトの音量閾値（より敏感に）
    this.silenceDuration = 0; // 無音状態の継続時間（秒）
    this.maxSilenceDuration = 3; // 自動ミュートまでの時間（秒）
    this.isMuted = false;
    this.originalMuteState = false;
    this.debugMode = false; // デバッグモード
    this.debugDisplay = null; // デバッグ表示要素
    this.lastUnmuteTime = 0; // 最後にミュート解除した時刻
    this.unmuteCooldown = 2; // ミュート解除後のクールダウン時間（秒）
    this.lastMuteState = false; // 前回のミュート状態（変化検知用）

    this.init();
  }

  /**
   * 音声レベル監視を初期化
   */
  async init() {
    try {
      // 設定をストレージから読み込み
      const settings = await this.getSettings();
      this.volumeThreshold = settings.volumeThreshold || 0.01;
      this.maxSilenceDuration = settings.silenceDuration || 3;
      this.enabled = settings.enabled !== false;

      console.log("Auto 3s Mute: 設定を読み込みました", {
        volumeThreshold: this.volumeThreshold,
        silenceDuration: this.maxSilenceDuration,
        enabled: this.enabled,
      });

      // 拡張機能が有効でない場合は監視を開始しない
      if (!this.enabled) {
        console.log("Auto 3s Mute: 拡張機能が無効のため監視を開始しません");
        return;
      }

      // 既に監視中の場合は再初期化をスキップ
      if (this.isMonitoring && this.audioContext && this.analyser) {
        console.log("Auto 3s Mute: 既に監視中のため再初期化をスキップします");
        return;
      }

      // マイクアクセスを要求
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      this.setupAudioContext(stream);

      // 監視開始
      this.startMonitoring();

      // Google Meetの状態変化を監視
      this.setupMeetStateWatcher();

      console.log("Auto 3s Mute: 音声レベル監視を開始しました");
    } catch (error) {
      console.error("Auto 3s Mute: マイクアクセスに失敗しました:", error);
    }
  }

  /**
   * AudioContextを設定
   */
  setupAudioContext(stream) {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.microphone = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();

    this.analyser.fftSize = 256;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    this.microphone.connect(this.analyser);
  }

  /**
   * 音声レベル監視を開始
   */
  startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.monitorAudioLevel();
  }

  /**
   * 音声レベルを監視
   */
  monitorAudioLevel() {
    if (!this.isMonitoring || !this.enabled) return;

    try {
      // AudioContextとanalyserの存在を確認
      if (!this.analyser || !this.dataArray) {
        console.log("Auto 3s Mute: AudioContextまたはanalyserが存在しません。監視を再開します。");
        this.restartMonitoring();
        return;
      }

      this.analyser.getByteFrequencyData(this.dataArray);

      // 音量レベルを計算
      const averageVolume = this.calculateAverageVolume();

      // 現在のミュート状態を確認
      this.checkMuteState();

      // デバッグ情報を表示
      if (this.debugMode) {
        this.updateDebugDisplay(averageVolume);
      }

      // 音声レベルに基づいてミュート/ミュート解除を判断
      if (averageVolume < this.volumeThreshold) {
        // 無音状態
        this.silenceDuration += 0.1; // 100ms間隔でチェック

        // ミュート解除後のクールダウン期間中は自動ミュートを実行しない
        const timeSinceLastUnmute = (Date.now() - this.lastUnmuteTime) / 1000;
        const isInCooldown = timeSinceLastUnmute < this.unmuteCooldown;

        if (this.silenceDuration >= this.maxSilenceDuration && !this.isMuted && !isInCooldown) {
          console.log(`Auto 3s Mute: 無音状態が${this.maxSilenceDuration}秒続いたため自動ミュートを実行します`);
          this.autoMute();
        } else if (isInCooldown) {
          console.log(`Auto 3s Mute: ミュート解除後のクールダウン期間中 (残り${(this.unmuteCooldown - timeSinceLastUnmute).toFixed(1)}秒)`);
        }
      } else {
        // 音声が検出された
        this.silenceDuration = 0;
        // キーボードショートカット版では、音声が検出されたら常にミュート解除を試行
        if (this.isMuted) {
          console.log("Auto 3s Mute: 音声が検出されたため自動ミュート解除を実行します");
          this.autoUnmute();
        }
      }

      // 100ms後に再チェック
      setTimeout(() => this.monitorAudioLevel(), 100);
    } catch (error) {
      console.error("Auto 3s Mute: 音声レベル監視中にエラーが発生しました:", error);
      // エラーが発生した場合は監視を再開
      console.log("Auto 3s Mute: エラーにより監視を再開します");
      this.restartMonitoring();
    }
  }

  /**
   * 平均音量を計算
   */
  calculateAverageVolume() {
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    return sum / this.dataArray.length / 255; // 0-1の範囲に正規化
  }

  /**
   * 現在のミュート状態を確認
   */
  checkMuteState() {
    try {
      // Google Meetのミュートボタンの状態を監視
      const muteButton = this.findMuteButton();
      if (muteButton) {
        const isActuallyMuted = this.isButtonMuted(muteButton);

        // 実際のミュート状態と内部状態が異なる場合は同期
        if (isActuallyMuted !== this.isMuted) {
          console.log(`Auto 3s Mute: ミュート状態が変更されました (実際: ${isActuallyMuted}, 内部: ${this.isMuted})`);

          // 手動でミュート解除された場合はクールダウン時間を記録
          if (!isActuallyMuted && this.isMuted) {
            console.log("Auto 3s Mute: 手動でミュート解除が検出されました。クールダウン時間を記録します。");
            this.lastUnmuteTime = Date.now();
          }

          this.isMuted = isActuallyMuted;

          // 手動でミュートが変更された場合は、自動ミュートの状態をリセット
          if (this.originalMuteState !== undefined) {
            this.originalMuteState = isActuallyMuted;
          }
        }

        // 前回の状態と比較して変化を検知
        if (isActuallyMuted !== this.lastMuteState) {
          console.log(`Auto 3s Mute: ミュート状態が変化しました (前回: ${this.lastMuteState}, 現在: ${isActuallyMuted})`);

          // 手動でミュート解除された場合（ミュート → 非ミュート）
          if (!isActuallyMuted && this.lastMuteState) {
            console.log("Auto 3s Mute: 手動でミュート解除が検出されました。クールダウン時間を記録します。");
            this.lastUnmuteTime = Date.now();
          }

          this.lastMuteState = isActuallyMuted;
        }
      }
    } catch (error) {
      console.error("Auto 3s Mute: ミュート状態の確認に失敗しました:", error);
    }
  }

  /**
   * ミュートボタンを検索
   */
  findMuteButton() {
    // Google Meetのマイクボタンのセレクタ（カメラボタンと区別）
    const selectors = [
      // マイクボタンのjsnameを直接指定
      '[jsname="hw0c9"]', // マイクボタンのjsname
      // aria-labelでマイクボタンを特定
      'button[aria-label*="マイク"]',
      'button[aria-label*="Mic"]',
      'button[aria-label*="オフ"]',
      'button[aria-label*="オン"]',
      // data-is-muted属性を持つマイクボタン
      'button[data-is-muted][aria-label*="マイク"]',
      'button[data-is-muted][aria-label*="Mic"]',
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        // マイクボタンかどうかを確認
        const ariaLabel = element.getAttribute("aria-label") || "";
        const isMicrophoneButton = ariaLabel.includes("マイク") || ariaLabel.includes("Mic") || ariaLabel.includes("オフ") || ariaLabel.includes("オン");

        if (isMicrophoneButton) {
          console.log(`Auto 3s Mute: マイクボタンを発見しました (${selector})`);
          console.log(`Auto 3s Mute: aria-label: ${ariaLabel}`);
          return element;
        }
      }
    }

    // フォールバック: より広範囲で検索
    const fallbackSelectors = ["button[data-is-muted]", '[data-is-muted="true"]', '[data-is-muted="false"]'];

    for (const selector of fallbackSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const ariaLabel = element.getAttribute("aria-label") || "";
        const isMicrophoneButton = ariaLabel.includes("マイク") || ariaLabel.includes("Mic") || ariaLabel.includes("オフ") || ariaLabel.includes("オン");

        if (isMicrophoneButton) {
          console.log(`Auto 3s Mute: マイクボタンを発見しました (フォールバック: ${selector})`);
          console.log(`Auto 3s Mute: aria-label: ${ariaLabel}`);
          return element;
        }
      }
    }

    console.log("Auto 3s Mute: マイクボタンが見つかりませんでした");
    return null;
  }

  /**
   * ボタンがミュート状態かどうかを判定
   */
  isButtonMuted(button) {
    try {
      // データ属性で判定（最優先）
      if (button.hasAttribute("data-is-muted")) {
        const isMuted = button.getAttribute("data-is-muted") === "true";
        console.log(`Auto 3s Mute: data-is-muted属性で判定: ${isMuted}`);
        return isMuted;
      }

      // aria-labelで判定
      const ariaLabel = button.getAttribute("aria-label") || "";
      console.log(`Auto 3s Mute: aria-label: ${ariaLabel}`);

      // マイクボタンのaria-labelパターン
      if (ariaLabel.includes("マイクをオフ") || ariaLabel.includes("Mic off")) {
        return false; // マイクがオフの状態 = ミュートされていない
      }
      if (ariaLabel.includes("マイクをオン") || ariaLabel.includes("Mic on")) {
        return true; // マイクがオンの状態 = ミュートされている
      }

      // 一般的なミュートパターン
      if (ariaLabel.includes("ミュート") || ariaLabel.includes("Mute")) {
        return true;
      }
      if (ariaLabel.includes("ミュート解除") || ariaLabel.includes("Unmute")) {
        return false;
      }

      // クラス名で判定
      const classList = Array.from(button.classList);
      if (classList.some((cls) => cls.includes("muted") || cls.includes("mute"))) {
        return true;
      }

      // デフォルトは非ミュート状態
      console.log("Auto 3s Mute: 判定できず、デフォルト（非ミュート）を返します");
      return false;
    } catch (error) {
      console.error("Auto 3s Mute: ミュート状態の判定に失敗しました:", error);
      return false;
    }
  }

  /**
   * 自動ミュートを実行（キーボードショートカット版）
   */
  autoMute() {
    if (!this.isMuted) {
      this.originalMuteState = this.isMuted;
      this.simulateMuteKey();
      this.isMuted = true; // 内部状態を更新
      console.log("Auto 3s Mute: 自動ミュートを実行しました（キーボードショートカット）");

      // バックグラウンドスクリプトに通知
      chrome.runtime.sendMessage({
        type: "AUTO_MUTED",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 自動ミュート解除を実行（キーボードショートカット版）
   */
  autoUnmute() {
    if (this.isMuted) {
      this.simulateMuteKey();
      this.isMuted = false; // 内部状態を更新
      this.lastUnmuteTime = Date.now(); // ミュート解除時刻を記録
      console.log("Auto 3s Mute: 自動ミュート解除を実行しました（キーボードショートカット）");

      // バックグラウンドスクリプトに通知
      chrome.runtime.sendMessage({
        type: "AUTO_UNMUTED",
        timestamp: Date.now(),
      });
    }
  }

  /**
   * ミュートキーをシミュレート（Ctrl+D / Cmd+D）
   */
  simulateMuteKey() {
    try {
      // より確実なキーボードイベントの作成
      const isMac = navigator.platform.indexOf("Mac") > -1;

      // keydownイベント
      const keyDownEvent = new KeyboardEvent("keydown", {
        key: "d",
        code: "KeyD",
        keyCode: 68,
        which: 68,
        charCode: 0,
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: false,
        altKey: false,
        bubbles: true,
        cancelable: true,
        composed: true,
      });

      // keypressイベント
      const keyPressEvent = new KeyboardEvent("keypress", {
        key: "d",
        code: "KeyD",
        keyCode: 68,
        which: 68,
        charCode: 100,
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: false,
        altKey: false,
        bubbles: true,
        cancelable: true,
        composed: true,
      });

      // keyupイベント
      const keyUpEvent = new KeyboardEvent("keyup", {
        key: "d",
        code: "KeyD",
        keyCode: 68,
        which: 68,
        charCode: 0,
        ctrlKey: !isMac,
        metaKey: isMac,
        shiftKey: false,
        altKey: false,
        bubbles: true,
        cancelable: true,
        composed: true,
      });

      // イベントを順番に発火（より確実な方法）
      document.dispatchEvent(keyDownEvent);

      // 少し遅延してkeypressとkeyupを発火
      setTimeout(() => {
        document.dispatchEvent(keyPressEvent);
        setTimeout(() => {
          document.dispatchEvent(keyUpEvent);
        }, 50);
      }, 50);

      console.log("Auto 3s Mute: ミュートキーをシミュレートしました (Ctrl+D / Cmd+D)");
    } catch (error) {
      console.error("Auto 3s Mute: キーボードシミュレーションに失敗しました:", error);

      // フォールバック: より簡単な方法を試す
      this.simulateMuteKeyFallback();
    }
  }

  /**
   * フォールバック: より簡単なキーボードシミュレーション
   */
  simulateMuteKeyFallback() {
    try {
      const isMac = navigator.platform.indexOf("Mac") > -1;

      // より基本的なキーボードイベント
      const keyDownEvent = new KeyboardEvent("keydown", {
        key: "d",
        keyCode: 68,
        which: 68,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
      });

      const keyUpEvent = new KeyboardEvent("keyup", {
        key: "d",
        keyCode: 68,
        which: 68,
        ctrlKey: !isMac,
        metaKey: isMac,
        bubbles: true,
        cancelable: true,
      });

      document.dispatchEvent(keyDownEvent);
      setTimeout(() => {
        document.dispatchEvent(keyUpEvent);
      }, 100);

      console.log("Auto 3s Mute: フォールバック方法でミュートキーをシミュレートしました");
    } catch (error) {
      console.error("Auto 3s Mute: フォールバック方法も失敗しました:", error);
    }
  }

  /**
   * 設定を取得
   */
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          volumeThreshold: 0.01,
          silenceDuration: 3,
          enabled: true,
          showNotifications: false,
        },
        (result) => {
          // 設定を安全に更新（ページリロードを防ぐ）
          this.volumeThreshold = parseFloat(result.volumeThreshold) || 0.01;
          this.maxSilenceDuration = parseInt(result.silenceDuration) || 3;
          this.enabled = Boolean(result.enabled);
          this.showNotifications = Boolean(result.showNotifications);

          console.log("Auto 3s Mute: 設定を読み込みました", {
            volumeThreshold: this.volumeThreshold,
            silenceDuration: this.maxSilenceDuration,
            enabled: this.enabled,
            showNotifications: this.showNotifications,
          });

          resolve(result);
        }
      );
    });
  }

  /**
   * デバッグ表示を更新
   */
  updateDebugDisplay(averageVolume) {
    if (!this.debugDisplay) {
      this.createDebugDisplay();
    }

    if (this.debugDisplay) {
      const timeSinceLastUnmute = (Date.now() - this.lastUnmuteTime) / 1000;
      const isInCooldown = timeSinceLastUnmute < this.unmuteCooldown;
      const cooldownRemaining = Math.max(0, this.unmuteCooldown - timeSinceLastUnmute);

      this.debugDisplay.innerHTML = `
          <div style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-family: monospace; font-size: 12px; z-index: 10000;">
            <div style="color: #4CAF50; font-weight: bold;">Auto 3s Mute (キーボードショートカット版)</div>
            <div>音量レベル: ${averageVolume.toFixed(4)}</div>
            <div>閾値: ${this.volumeThreshold.toFixed(4)}</div>
            <div>無音時間: ${this.silenceDuration.toFixed(1)}s / ${this.maxSilenceDuration}s</div>
            <div>ミュート状態: ${this.isMuted ? "ON" : "OFF"}</div>
            <div>監視状態: ${this.isMonitoring ? "ON" : "OFF"}</div>
            <div style="color: ${isInCooldown ? "#FFA500" : "#4CAF50"};">クールダウン: ${isInCooldown ? `${cooldownRemaining.toFixed(1)}s` : "完了"}</div>
            <div style="font-size: 10px; color: #ccc;">Ctrl+D / Cmd+D でミュート切り替え</div>
          </div>
        `;
    }
  }

  /**
   * デバッグ表示を作成
   */
  createDebugDisplay() {
    this.debugDisplay = document.createElement("div");
    document.body.appendChild(this.debugDisplay);
  }

  /**
   * デバッグモードを切り替え
   */
  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    if (!this.debugMode && this.debugDisplay) {
      this.debugDisplay.remove();
      this.debugDisplay = null;
    }
    console.log("Auto 3s Mute: デバッグモード", this.debugMode ? "ON" : "OFF");
  }

  /**
   * 音量閾値を動的に調整
   */
  adjustVolumeThreshold(newThreshold) {
    this.volumeThreshold = newThreshold;
    console.log("Auto 3s Mute: 音量閾値を", newThreshold, "に変更しました");
  }

  /**
   * Google Meetの状態変化を監視
   */
  setupMeetStateWatcher() {
    // ページの可視性変化を監視
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && this.enabled) {
        console.log("Auto 3s Mute: ページが可視状態になりました");
        this.ensureMonitoring();
      }
    });

    // URL変化を監視（SPAの遷移に対応）
    let currentUrl = window.location.href;
    const urlWatcher = setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        console.log("Auto 3s Mute: URLが変更されました:", currentUrl);
        if (currentUrl.includes("meet.google.com") && this.enabled) {
          setTimeout(() => this.ensureMonitoring(), 1000);
        }
      }
    }, 1000);

    // ページ離脱時にクリーンアップ
    window.addEventListener("beforeunload", () => {
      clearInterval(urlWatcher);
    });
  }

  /**
   * 監視が確実に動作しているかチェック
   */
  ensureMonitoring() {
    if (!this.enabled) return;

    // 監視が停止している場合は再開
    if (!this.isMonitoring || !this.analyser) {
      console.log("Auto 3s Mute: 監視が停止しているため再開します");
      this.restartMonitoring();
    }
  }

  /**
   * 監視を再開
   */
  async restartMonitoring() {
    try {
      // 既存の監視を停止
      this.stopMonitoring();

      // 少し待ってから再初期化
      setTimeout(async () => {
        await this.init();
      }, 500);
    } catch (error) {
      console.error("Auto 3s Mute: 監視の再開に失敗しました:", error);
    }
  }

  /**
   * 監視を停止
   */
  stopMonitoring() {
    this.isMonitoring = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    if (this.analyser) {
      this.analyser = null;
    }
    if (this.microphone) {
      this.microphone = null;
    }
    if (this.debugDisplay) {
      this.debugDisplay.remove();
      this.debugDisplay = null;
    }
  }
}

// グローバル変数として監視インスタンスを保存
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
      const timeSinceLastUnmute = (Date.now() - audioMonitor.lastUnmuteTime) / 1000;
      const isInCooldown = timeSinceLastUnmute < audioMonitor.unmuteCooldown;
      const cooldownRemaining = Math.max(0, audioMonitor.unmuteCooldown - timeSinceLastUnmute);

      return {
        volumeThreshold: audioMonitor.volumeThreshold,
        silenceDuration: audioMonitor.silenceDuration,
        maxSilenceDuration: audioMonitor.maxSilenceDuration,
        isMuted: audioMonitor.isMuted,
        isMonitoring: audioMonitor.isMonitoring,
        enabled: audioMonitor.enabled,
        audioContext: audioMonitor.audioContext ? "OK" : "NG",
        analyser: audioMonitor.analyser ? "OK" : "NG",
        microphone: audioMonitor.microphone ? "OK" : "NG",
        lastUnmuteTime: audioMonitor.lastUnmuteTime,
        unmuteCooldown: audioMonitor.unmuteCooldown,
        isInCooldown: isInCooldown,
        cooldownRemaining: cooldownRemaining,
      };
    }
    return null;
  },
  // キーボードショートカットのテスト
  testMuteKey: () => {
    if (audioMonitor) {
      console.log("Auto 3s Mute: キーボードショートカットをテストします");
      audioMonitor.simulateMuteKey();
    }
  },
  // 手動でミュート状態を切り替え
  toggleMute: () => {
    if (audioMonitor) {
      if (audioMonitor.isMuted) {
        audioMonitor.autoUnmute();
      } else {
        audioMonitor.autoMute();
      }
    }
  },
  // 音声レベル監視の再開
  restart: () => {
    if (audioMonitor) {
      console.log("Auto 3s Mute: 音声レベル監視を再開します");
      audioMonitor.restartMonitoring();
    }
  },
  // 監視状態の確認
  checkStatus: () => {
    if (audioMonitor) {
      const status = {
        isMonitoring: audioMonitor.isMonitoring,
        enabled: audioMonitor.enabled,
        audioContext: audioMonitor.audioContext ? "OK" : "NG",
        analyser: audioMonitor.analyser ? "OK" : "NG",
        microphone: audioMonitor.microphone ? "OK" : "NG",
        dataArray: audioMonitor.dataArray ? "OK" : "NG",
      };
      console.log("Auto 3s Mute: 監視状態:", status);
      return status;
    }
    return null;
  },
  // 現在の音声レベルを取得
  getCurrentVolume: () => {
    if (audioMonitor && audioMonitor.analyser && audioMonitor.dataArray) {
      audioMonitor.analyser.getByteFrequencyData(audioMonitor.dataArray);
      const averageVolume = audioMonitor.calculateAverageVolume();
      console.log(`Auto 3s Mute: 現在の音声レベル: ${averageVolume.toFixed(4)}`);
      return averageVolume;
    }
    return null;
  },
  // マイクボタンの検索
  findMuteButton: () => {
    if (audioMonitor) {
      const button = audioMonitor.findMuteButton();
      if (button) {
        console.log("Auto 3s Mute: マイクボタンを発見しました:", button);
        console.log("Auto 3s Mute: ボタンの属性:", {
          "data-is-muted": button.getAttribute("data-is-muted"),
          "aria-label": button.getAttribute("aria-label"),
          class: button.className,
          jsname: button.getAttribute("jsname"),
        });
        return button;
      } else {
        console.log("Auto 3s Mute: マイクボタンが見つかりませんでした");
        return null;
      }
    }
    return null;
  },
  // カメラボタンも検索して比較
  findCameraButton: () => {
    if (audioMonitor) {
      const cameraButton = document.querySelector('[jsname="psRWwc"]');
      if (cameraButton) {
        console.log("Auto 3s Mute: カメラボタンを発見しました:", cameraButton);
        console.log("Auto 3s Mute: カメラボタンの属性:", {
          "data-is-muted": cameraButton.getAttribute("data-is-muted"),
          "aria-label": cameraButton.getAttribute("aria-label"),
          class: cameraButton.className,
          jsname: cameraButton.getAttribute("jsname"),
        });
        return cameraButton;
      } else {
        console.log("Auto 3s Mute: カメラボタンが見つかりませんでした");
        return null;
      }
    }
    return null;
  },
  // 実際のミュート状態を確認
  getActualMuteState: () => {
    if (audioMonitor) {
      const button = audioMonitor.findMuteButton();
      if (button) {
        const isMuted = audioMonitor.isButtonMuted(button);
        console.log(`Auto 3s Mute: 実際のミュート状態: ${isMuted}`);
        return isMuted;
      } else {
        console.log("Auto 3s Mute: ミュートボタンが見つからないため状態を確認できません");
        return null;
      }
    }
    return null;
  },
  // 手動ミュート変更のテスト
  testManualMuteChange: () => {
    if (audioMonitor) {
      console.log("Auto 3s Mute: 手動ミュート変更のテストを開始します");
      console.log("Auto 3s Mute: 現在の内部状態:", audioMonitor.isMuted);
      console.log("Auto 3s Mute: 前回の状態:", audioMonitor.lastMuteState);
      console.log("Auto 3s Mute: 最後のミュート解除時刻:", new Date(audioMonitor.lastUnmuteTime));

      // 手動でミュート状態を変更してテスト
      audioMonitor.checkMuteState();

      console.log("Auto 3s Mute: テスト後の内部状態:", audioMonitor.isMuted);
      console.log("Auto 3s Mute: テスト後の前回の状態:", audioMonitor.lastMuteState);
    }
    return null;
  },
};

// 設定変更の監視
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "sync" && audioMonitor) {
    console.log("Auto 3s Mute: 設定が変更されました", changes);

    // 各設定の変更を処理（ページリロードなし）
    if (changes.volumeThreshold) {
      audioMonitor.volumeThreshold = parseFloat(changes.volumeThreshold.newValue) || 0.01;
      console.log("Auto 3s Mute: 音量閾値を更新しました:", audioMonitor.volumeThreshold);
    }

    if (changes.silenceDuration) {
      audioMonitor.maxSilenceDuration = parseInt(changes.silenceDuration.newValue) || 3;
      console.log("Auto 3s Mute: 無音時間を更新しました:", audioMonitor.maxSilenceDuration);
    }

    if (changes.enabled) {
      audioMonitor.enabled = Boolean(changes.enabled.newValue);
      console.log("Auto 3s Mute: 有効/無効を更新しました:", audioMonitor.enabled);
    }

    if (changes.showNotifications) {
      audioMonitor.showNotifications = Boolean(changes.showNotifications.newValue);
      console.log("Auto 3s Mute: 通知設定を更新しました:", audioMonitor.showNotifications);
    }
  }
});
