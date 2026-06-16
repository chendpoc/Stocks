import { serverStatusForCli, startServer, stopServer } from "../services/server.js";
import { user } from "../log/index.js";

export async function server(action: string) {
  switch (action) {
    case "start":
      startServer();
      user.say("后端启动中（端口 8000），请用 trader server status 确认");
      return;
    case "stop":
      await stopServer();
      user.say("已尝试停止端口 8000 上的监听进程");
      return;
    case "status":
      return serverStatusForCli();
    default:
      throw new Error(`Unknown server action: ${action} (use start|stop|status)`);
  }
}
