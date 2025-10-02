// バックグラウンドスクリプト - 拡張機能の状態管理と通知処理
class BackgroundService {
  constructor() {
    this.stats = {
      autoMuteCount: 0,
      autoUnmuteCount: 0,
      lastActivity: null,
    };

    this.init();
  }

  /**
   * バックグラウンドサービスを初期化
   */
  init() {
    // メッセージリスナーを設定
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // 拡張機能のインストール/更新時の処理
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstall(details);
    });

    // タブの更新を監視
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    console.log("Auto 3s Mute: バックグラウンドサービスが開始されました");
  }

  /**
   * メッセージを処理
   */
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case "AUTO_MUTED":
        this.handleAutoMuted(message, sender);
        break;
      case "AUTO_UNMUTED":
        this.handleAutoUnmuted(message, sender);
        break;
      case "GET_STATS":
        sendResponse(this.stats);
        break;
      case "RESET_STATS":
        this.resetStats();
        sendResponse({ success: true });
        break;
      default:
        console.log("Auto 3s Mute: 未知のメッセージタイプ:", message.type);
    }
  }

  /**
   * 自動ミュート処理
   */
  handleAutoMuted(message, sender) {
    this.stats.autoMuteCount++;
    this.stats.lastActivity = new Date().toISOString();

    console.log("Auto 3s Mute: 自動ミュートが実行されました");

    // 通知を表示（オプション）
    this.showNotification("自動ミュート", "音声が検出されなくなったため、自動的にミュートしました");
  }

  /**
   * 自動ミュート解除処理
   */
  handleAutoUnmuted(message, sender) {
    this.stats.autoUnmuteCount++;
    this.stats.lastActivity = new Date().toISOString();

    console.log("Auto 3s Mute: 自動ミュート解除が実行されました");

    // 通知を表示（オプション）
    this.showNotification("自動ミュート解除", "音声が検出されたため、自動的にミュートを解除しました");
  }

  /**
   * 通知を表示
   */
  showNotification(title, message) {
    // 通知の設定を確認
    chrome.storage.sync.get(["showNotifications"], (result) => {
      if (result.showNotifications !== false) {
        // 通知APIが利用可能かチェック
        if (chrome.notifications && chrome.notifications.create) {
          try {
            // 必要なプロパティをすべて含めて通知を作成
            chrome.notifications.create(
              {
                type: "basic",
                iconUrl: "icons/icon48.svg", // アイコンファイルを指定
                title: title,
                message: message,
              },
              (notificationId) => {
                if (chrome.runtime.lastError) {
                  console.log("Auto 3s Mute: 通知の作成に失敗しました:", chrome.runtime.lastError);
                  // アイコンなしで再試行
                  this.showNotificationWithoutIcon(title, message);
                } else {
                  console.log("Auto 3s Mute: 通知が表示されました:", notificationId);
                }
              }
            );
          } catch (error) {
            console.log("Auto 3s Mute: 通知の表示に失敗しました:", error);
            // 通知が利用できない場合はコンソールにログを出力
            console.log(`Auto 3s Mute: ${title} - ${message}`);
          }
        } else {
          // 通知APIが利用できない場合はコンソールにログを出力
          console.log(`Auto 3s Mute: ${title} - ${message}`);
        }
      }
    });
  }

  /**
   * アイコンなしで通知を表示（フォールバック）
   */
  showNotificationWithoutIcon(title, message) {
    try {
      chrome.notifications.create(
        {
          type: "basic",
          title: title,
          message: message,
        },
        (notificationId) => {
          if (chrome.runtime.lastError) {
            console.log("Auto 3s Mute: アイコンなし通知も失敗しました:", chrome.runtime.lastError);
            // 最終的にコンソールにログを出力
            console.log(`Auto 3s Mute: ${title} - ${message}`);
          } else {
            console.log("Auto 3s Mute: アイコンなし通知が表示されました:", notificationId);
          }
        }
      );
    } catch (error) {
      console.log("Auto 3s Mute: フォールバック通知も失敗しました:", error);
      console.log(`Auto 3s Mute: ${title} - ${message}`);
    }
  }

  /**
   * 統計をリセット
   */
  resetStats() {
    this.stats = {
      autoMuteCount: 0,
      autoUnmuteCount: 0,
      lastActivity: null,
    };
    console.log("Auto 3s Mute: 統計をリセットしました");
  }

  /**
   * インストール時の処理
   */
  handleInstall(details) {
    if (details.reason === "install") {
      // 初回インストール時のデフォルト設定
      chrome.storage.sync.set({
        volumeThreshold: 0.01,
        silenceDuration: 3,
        enabled: true,
        showNotifications: false, // デフォルトで通知を無効化
      });

      console.log("Auto 3s Mute: 拡張機能がインストールされました");
    } else if (details.reason === "update") {
      console.log("Auto 3s Mute: 拡張機能が更新されました");
    }
  }

  /**
   * タブ更新の処理
   */
  handleTabUpdate(tabId, changeInfo, tab) {
    // Google Meetページが読み込まれた場合
    if (changeInfo.status === "complete" && tab.url && tab.url.includes("meet.google.com")) {
      console.log("Auto 3s Mute: Google Meetページが検出されました");

      // 設定が有効かどうか確認
      chrome.storage.sync.get(["enabled"], (result) => {
        if (result.enabled) {
          // content scriptに設定を送信
          chrome.tabs
            .sendMessage(tabId, {
              type: "SETTINGS_UPDATE",
              settings: result,
            })
            .catch(() => {
              // content scriptがまだ読み込まれていない場合は無視
            });
        }
      });
    }
  }
}

// バックグラウンドサービスを開始
new BackgroundService();
