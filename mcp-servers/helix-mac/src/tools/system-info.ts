import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as os from "node:os";

const execFileAsync = promisify(execFile);

async function shellExec(cmd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("bash", ["-c", cmd], {
      timeout: 10000,
    });
    return stdout.trim();
  } catch {
    return "unavailable";
  }
}

export const systemInfoTools = {
  mac_system_info: {
    description:
      "Get system information: CPU usage, memory usage, disk space, battery status, and uptime",
    schema: z.object({
      category: z
        .enum(["all", "cpu", "memory", "disk", "battery", "uptime"])
        .default("all")
        .describe("Category of system info to retrieve"),
    }),
    handler: async ({ category }: { category: string }) => {
      const sections: string[] = [];

      if (category === "all" || category === "cpu") {
        const cpuInfo = await shellExec(
          "top -l 1 -n 0 | grep 'CPU usage'"
        );
        const cpuModel = os.cpus()[0]?.model || "unknown";
        const cpuCount = os.cpus().length;
        sections.push(
          `CPU:\n  Model: ${cpuModel}\n  Cores: ${cpuCount}\n  ${cpuInfo}`
        );
      }

      if (category === "all" || category === "memory") {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(1);
        const usedGB = (usedMem / 1024 / 1024 / 1024).toFixed(1);
        const freeGB = (freeMem / 1024 / 1024 / 1024).toFixed(1);
        const pct = ((usedMem / totalMem) * 100).toFixed(1);
        // Get memory pressure from macOS
        const pressure = await shellExec(
          "memory_pressure 2>/dev/null | head -1 || echo 'unavailable'"
        );
        sections.push(
          `Memory:\n  Total: ${totalGB} GB\n  Used: ${usedGB} GB (${pct}%)\n  Free: ${freeGB} GB\n  Pressure: ${pressure}`
        );
      }

      if (category === "all" || category === "disk") {
        const diskInfo = await shellExec(
          "df -h / | tail -1 | awk '{print \"Total: \" $2 \"  Used: \" $3 \" (\" $5 \")  Available: \" $4}'"
        );
        sections.push(`Disk (/):\n  ${diskInfo}`);
      }

      if (category === "all" || category === "battery") {
        const batteryInfo = await shellExec(
          "pmset -g batt 2>/dev/null | tail -1 || echo 'No battery (desktop)'"
        );
        sections.push(`Battery:\n  ${batteryInfo}`);
      }

      if (category === "all" || category === "uptime") {
        const uptime = await shellExec("uptime");
        sections.push(`Uptime:\n  ${uptime}`);
      }

      return {
        content: [
          {
            type: "text" as const,
            text: sections.join("\n\n"),
          },
        ],
      };
    },
  },
};
