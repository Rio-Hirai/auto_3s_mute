// Popup UI の制御スクリプト
class PopupController {
  constructor() {
    this.settings = {
      enabled: true,
      volumeThreshold: 0.01,
      silenceDuration: 3,
      showNotifications: false,
    };

    this.init();
  }

  /**
   * Popupを初期化
   */
  async init() {
    // DOM要素を取得
    this.elements = {
      statusIndicator: document.getElementById("statusIndicator"),
      statusDot: document.querySelector(".status-dot"),
      statusText: document.querySelector(".status-text"),
      enabledToggle: document.getElementById("enabledToggle"),
      settingsSection: document.getElementById("settingsSection"),
      volumeThreshold: document.getElementById("volumeThreshold"),
      thresholdValue: document.getElementById("thresholdValue"),
      silenceDuration: document.getElementById("silenceDuration"),
      durationValue: document.getElementById("durationValue"),
      muteCount: document.getElementById("muteCount"),
      unmuteCount: document.getElementById("unmuteCount"),
      resetStats: document.getElementById("resetStats"),
      optionsButton: document.getElementById("optionsButton"),
      helpButton: document.getElementById("helpButton"),
    };

    // イベントリスナーを設定
    this.setupEventListeners();

    // 設定と統計を読み込み
    await this.loadSettings();
    await this.loadStats();

    // 状態を更新
    this.updateUI();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // 有効/無効トグル
    this.elements.enabledToggle.addEventListener("change", (e) => {
      this.settings.enabled = e.target.checked;
      this.saveSettings();
      this.updateUI();
    });

    // 音量閾値スライダー
    this.elements.volumeThreshold.addEventListener("input", (e) => {
      this.settings.volumeThreshold = parseFloat(e.target.value);
      this.elements.thresholdValue.textContent = this.settings.volumeThreshold.toFixed(2);
      this.saveSettings();
    });

    // 無音時間スライダー
    this.elements.silenceDuration.addEventListener("input", (e) => {
      this.settings.silenceDuration = parseInt(e.target.value);
      this.elements.durationValue.textContent = this.settings.silenceDuration;
      this.saveSettings();
    });

    // 統計リセット
    this.elements.resetStats.addEventListener("click", () => {
      this.resetStats();
    });

    // 詳細設定ボタン
    this.elements.optionsButton.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });

    // ヘルプボタン
    this.elements.helpButton.addEventListener("click", () => {
      this.showHelp();
    });
  }

  /**
   * 設定を読み込み
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          enabled: true,
          volumeThreshold: 0.01,
          silenceDuration: 3,
          showNotifications: false,
        },
        (result) => {
          this.settings = result;
          resolve();
        }
      );
    });
  }

  /**
   * 統計を読み込み
   */
  async loadStats() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
        if (response) {
          this.elements.muteCount.textContent = response.autoMuteCount || 0;
          this.elements.unmuteCount.textContent = response.autoUnmuteCount || 0;
        }
        resolve();
      });
    });
  }

  /**
   * 設定を保存
   */
  saveSettings() {
    chrome.storage.sync.set(this.settings, () => {
      console.log("Auto 3s Mute: 設定を保存しました", this.settings);
    });
  }

  /**
   * UIを更新
   */
  updateUI() {
    // 有効/無効状態を更新
    this.elements.enabledToggle.checked = this.settings.enabled;
    this.elements.settingsSection.style.display = this.settings.enabled ? "block" : "none";

    // スライダーの値を更新
    this.elements.volumeThreshold.value = this.settings.volumeThreshold;
    this.elements.thresholdValue.textContent = this.settings.volumeThreshold.toFixed(2);
    this.elements.silenceDuration.value = this.settings.silenceDuration;
    this.elements.durationValue.textContent = this.settings.silenceDuration;

    // ステータス表示を更新
    this.updateStatus();
  }

  /**
   * ステータス表示を更新
   */
  updateStatus() {
    if (this.settings.enabled) {
      this.elements.statusDot.classList.remove("inactive");
      this.elements.statusText.textContent = "有効";
    } else {
      this.elements.statusDot.classList.add("inactive");
      this.elements.statusText.textContent = "無効";
    }
  }

  /**
   * 統計をリセット
   */
  resetStats() {
    chrome.runtime.sendMessage({ type: "RESET_STATS" }, (response) => {
      if (response && response.success) {
        this.elements.muteCount.textContent = "0";
        this.elements.unmuteCount.textContent = "0";
        console.log("Auto 3s Mute: 統計をリセットしました");
      }
    });
  }

  /**
   * ヘルプを表示
   */
  showHelp() {
    const helpText = `
Auto 3s Mute の使い方

1. Google Meetに参加してください
2. マイクのアクセス許可を与えてください
3. 音量閾値を調整してください（低いほど敏感）
4. 無音時間を設定してください（3秒が推奨）

機能:
- マイクの音量が閾値を下回ると自動でミュート
- 音声が検出されると自動でミュート解除
- 統計情報で使用状況を確認可能

注意:
- Google Meetページでのみ動作します
- 初回使用時にマイクアクセス許可が必要です
    `;

    alert(helpText);
  }
}

// Popupが読み込まれたらコントローラーを開始
document.addEventListener("DOMContentLoaded", () => {
  new PopupController();
});
