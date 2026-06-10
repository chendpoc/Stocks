/**
 * Daemon CLI 命令 — trader daemon start/stop/status
 */

import { daemon } from "../daemon/marketAgentDaemon.js";

export async function daemonCommand(action: string): Promise<void> {
  switch (action) {
    case "start": {
      console.log("[daemon] 启动中...");
      await daemon.start();
      // start() 触发首次 wake 后立即返回；主循环在后台通过 setTimeout 运行
      console.log("[daemon] 首次唤醒已完成，主循环已在后台运行");
      return;
    }
    case "stop": {
      await daemon.stop();
      console.log("[daemon] 已停止");
      return;
    }
    case "status": {
      const status = daemon.getStatus();
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    default: {
      throw new Error(
        `Unknown daemon action: ${action} (use start|stop|status)`,
      );
    }
  }
}
