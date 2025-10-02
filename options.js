// Options page の制御スクリプト
class OptionsController {
  constructor() {
    this.settings = {
      enabled: true,
      volumeThreshold: 0.01,
      silenceDuration: 3,
      showNotifications: false,
      notificationSound: false,
      monitoringInterval: 100,
      sensitivityMode: "normal",
    };

    this.init();
  }

  /**
   * Options pageを初期化
   */
  async init() {
    // DOM要素を取得
    this.elements = {
      enabled: document.getElementById("enabled"),
      volumeThreshold: document.getElementById("volumeThreshold"),
      thresholdValue: document.getElementById("thresholdValue"),
      silenceDuration: document.getElementById("silenceDuration"),
      durationValue: document.getElementById("durationValue"),
      showNotifications: document.getElementById("showNotifications"),
      notificationSound: document.getElementById("notificationSound"),
      monitoringInterval: document.getElementById("monitoringInterval"),
      intervalValue: document.getElementById("intervalValue"),
      sensitivityMode: document.getElementById("sensitivityMode"),
      muteCount: document.getElementById("muteCount"),
      unmuteCount: document.getElementById("unmuteCount"),
      lastActivity: document.getElementById("lastActivity"),
      resetStats: document.getElementById("resetStats"),
      exportStats: document.getElementById("exportStats"),
      saveButton: document.getElementById("saveButton"),
      resetButton: document.getElementById("resetButton"),
    };

    // イベントリスナーを設定
    this.setupEventListeners();

    // 設定と統計を読み込み
    await this.loadSettings();
    await this.loadStats();

    // UIを更新
    this.updateUI();
  }

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // 基本設定
    this.elements.enabled.addEventListener("change", (e) => {
      this.settings.enabled = e.target.checked;
    });

    this.elements.volumeThreshold.addEventListener("input", (e) => {
      this.settings.volumeThreshold = parseFloat(e.target.value);
      this.elements.thresholdValue.textContent = this.settings.volumeThreshold.toFixed(2);
    });

    this.elements.silenceDuration.addEventListener("input", (e) => {
      this.settings.silenceDuration = parseInt(e.target.value);
      this.elements.durationValue.textContent = this.settings.silenceDuration;
    });

    // 通知設定
    this.elements.showNotifications.addEventListener("change", (e) => {
      this.settings.showNotifications = e.target.checked;
    });

    this.elements.notificationSound.addEventListener("change", (e) => {
      this.settings.notificationSound = e.target.checked;
    });

    // 高度な設定
    this.elements.monitoringInterval.addEventListener("input", (e) => {
      this.settings.monitoringInterval = parseInt(e.target.value);
      this.elements.intervalValue.textContent = this.settings.monitoringInterval;
    });

    this.elements.sensitivityMode.addEventListener("change", (e) => {
      this.settings.sensitivityMode = e.target.value;
      this.applySensitivityMode();
    });

    // 統計関連
    this.elements.resetStats.addEventListener("click", () => {
      this.resetStats();
    });

    this.elements.exportStats.addEventListener("click", () => {
      this.exportStats();
    });

    // 保存・リセット
    this.elements.saveButton.addEventListener("click", () => {
      this.saveSettings();
    });

    this.elements.resetButton.addEventListener("click", () => {
      this.resetToDefaults();
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
          notificationSound: false,
          monitoringInterval: 100,
          sensitivityMode: "normal",
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

          if (response.lastActivity) {
            const date = new Date(response.lastActivity);
            this.elements.lastActivity.textContent = date.toLocaleString("ja-JP");
          } else {
            this.elements.lastActivity.textContent = "-";
          }
        }
        resolve();
      });
    });
  }

  /**
   * UIを更新
   */
  updateUI() {
    // 基本設定
    this.elements.enabled.checked = this.settings.enabled;
    this.elements.volumeThreshold.value = this.settings.volumeThreshold;
    this.elements.thresholdValue.textContent = this.settings.volumeThreshold.toFixed(2);
    this.elements.silenceDuration.value = this.settings.silenceDuration;
    this.elements.durationValue.textContent = this.settings.silenceDuration;

    // 通知設定
    this.elements.showNotifications.checked = this.settings.showNotifications;
    this.elements.notificationSound.checked = this.settings.notificationSound;

    // 高度な設定
    this.elements.monitoringInterval.value = this.settings.monitoringInterval;
    this.elements.intervalValue.textContent = this.settings.monitoringInterval;
    this.elements.sensitivityMode.value = this.settings.sensitivityMode;
  }

  /**
   * 感度モードを適用
   */
  applySensitivityMode() {
    switch (this.settings.sensitivityMode) {
      case "high":
        this.settings.volumeThreshold = 0.05;
        this.settings.monitoringInterval = 50;
        break;
      case "low":
        this.settings.volumeThreshold = 0.2;
        this.settings.monitoringInterval = 200;
        break;
      case "normal":
        this.settings.volumeThreshold = 0.1;
        this.settings.monitoringInterval = 100;
        break;
      case "custom":
        // カスタムモードでは現在の設定を維持
        break;
    }

    // UIを更新
    this.elements.volumeThreshold.value = this.settings.volumeThreshold;
    this.elements.thresholdValue.textContent = this.settings.volumeThreshold.toFixed(2);
    this.elements.monitoringInterval.value = this.settings.monitoringInterval;
    this.elements.intervalValue.textContent = this.settings.monitoringInterval;
  }

  /**
   * 設定を保存
   */
  saveSettings() {
    chrome.storage.sync.set(this.settings, () => {
      console.log("Auto 3s Mute: 設定を保存しました", this.settings);

      // 保存完了の通知
      this.showNotification("設定を保存しました", "success");
    });
  }

  /**
   * 統計をリセット
   */
  resetStats() {
    if (confirm("統計情報をリセットしますか？この操作は元に戻せません。")) {
      chrome.runtime.sendMessage({ type: "RESET_STATS" }, (response) => {
        if (response && response.success) {
          this.elements.muteCount.textContent = "0";
          this.elements.unmuteCount.textContent = "0";
          this.elements.lastActivity.textContent = "-";
          this.showNotification("統計をリセットしました", "success");
        }
      });
    }
  }

  /**
   * 統計をエクスポート
   */
  exportStats() {
    chrome.runtime.sendMessage({ type: "GET_STATS" }, (response) => {
      if (response) {
        const statsData = {
          autoMuteCount: response.autoMuteCount || 0,
          autoUnmuteCount: response.autoUnmuteCount || 0,
          lastActivity: response.lastActivity || null,
          exportDate: new Date().toISOString(),
        };

        const dataStr = JSON.stringify(statsData, null, 2);
        const dataBlob = new Blob([dataStr], { type: "application/json" });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(dataBlob);
        link.download = `auto-3s-mute-stats-${new Date().toISOString().split("T")[0]}.json`;
        link.click();

        this.showNotification("統計をエクスポートしました", "success");
      }
    });
  }

  /**
   * デフォルトに戻す
   */
  resetToDefaults() {
    if (confirm("設定をデフォルトに戻しますか？")) {
      this.settings = {
        enabled: true,
        volumeThreshold: 0.1,
        silenceDuration: 3,
        showNotifications: true,
        notificationSound: false,
        monitoringInterval: 100,
        sensitivityMode: "normal",
      };

      this.updateUI();
      this.showNotification("設定をデフォルトに戻しました", "info");
    }
  }

  /**
   * 通知を表示
   */
  showNotification(message, type = "info") {
    // 簡単な通知表示（実際の実装ではより洗練された通知システムを使用）
    const notification = document.createElement("div");
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${type === "success" ? "#4caf50" : type === "error" ? "#f44336" : "#2196f3"};
      color: white;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 1000;
      font-size: 14px;
      font-weight: 500;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// Options pageが読み込まれたらコントローラーを開始
document.addEventListener("DOMContentLoaded", () => {
  new OptionsController();
});
