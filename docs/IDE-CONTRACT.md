<!-- Synced from samsong8610/developtools_hdc lite/docs/IDE-CONTRACT.md (ohjs/6.1-lite @df0e5c3). Do not fork semantics here; update upstream then re-sync. -->

# IDE ↔ 设备协议约定（normative）

面向全栈 / IDE（`ohos-lite-js-ide`）与 `developtools_hdc` lite qemu-ide / 上板联调。命令与路径保持英文原样。

## 1. 端口（勿混用）

| 角色                | 端口                                              | 说明                                                                       |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| **设备 hdcd TCP**   | **8710**                                          | 板上 / `run-qemu-hdcd.sh start` 默认监听。主机 `hdc tconn <ip>:8710`。     |
| **主机 hdc server** | **8711**（`OHOS_HDC_SERVER_PORT`）                | 与设备 8710 同机时必须错开（qemu-ide）。`hdc -s 127.0.0.1:8711 …`。        |
| **jsdebug 桥**      | **18710**（`HOST_PORT`）或 veth `10.200.1.2:8710` | **仅** `run-qemu-hdcd.sh jsdebug`。**禁止**用于普通 G2 deploy/launch/log。 |

```sh
# G2 正常联调
export OHOS_HDC_SERVER_PORT=8711
hdc -s 127.0.0.1:8711 tconn 127.0.0.1:8710

# jsdebug 专用（netns + fport 到 jerry :5001）
run-qemu-hdcd.sh jsdebug start
hdc -s 127.0.0.1:8711 tconn 10.200.1.2:8710   # 或 127.0.0.1:18710 别名
```

## 2. 路径

| 用途               | 路径                                                                     |
| ------------------ | ------------------------------------------------------------------------ |
| IDE / ACE 调试目录 | `/data/ohjs/`                                                            |
| 等待调试器标记     | `/data/ohjs/debug.<bundle>`（存在即 gate on；见 `JS-DEBUG.md` §E）       |
| HAP 推送           | `/tmp/ohjs/app.hap`（`tmpDir` + `/app.hap`）                             |
| hilog 捕获         | `/tmp/ohjs/hilog.cap` + `/tmp/ohjs/hilogcat.pid`（也可用 `/data/ohjs/`） |
| 临时目录           | `/tmp/ohjs/`（`mkdir -p` 后 `file send`）                                |

```sh
# 部署前清标记（防上次 debug 残留导致 aa start 卡 accept）
hdc shell 'rm -f /data/ohjs/debug.*'

# Debug 启动（IDE）：touch → aa start → fport → attach → rm
hdc shell "mkdir -p /data/ohjs && touch /data/ohjs/debug.com.example.app"
hdc fport tcp:19001 tcp:5001
hdc shell 'rm -f /data/ohjs/debug.com.example.app'
```

## 3. Shell / bm / aa / 日志

- **`hdc shell` 不回传真实 exit code**（上游设计）。普通命令必须：
  ```sh
  hdc shell '<cmd>; echo __RC=$?'
  ```
  解析最后一行 `__RC=<n>`。**不要**只信 hdc 进程退出码。
- **bm / aa 成功看 stdout 文本**（lite 上即使失败 `__RC` 常为 0）：
  - `bm install`：`resultMessage is install success !`
  - `bm uninstall`：`resultMessage is uninstall success !`
  - `bm set -s disable`：行内 `success`（debug 固件）
  - `aa start` 失败：`Failed to run the command.`
- **日志**：小型系统无 hilogd → 用 **`hilogcat`**。`hdc hilog` 在本 fork 会回退到 `hilogcat`（仅 `-h` 等有限透传）。推荐 IDE 侧 pid 文件生命周期：
  ```sh
  hdc shell 'mkdir -p /tmp/ohjs; hilogcat > /tmp/ohjs/hilog.cap 2>&1 & echo $! > /tmp/ohjs/hilogcat.pid'
  hdc shell 'kill $(cat /tmp/ohjs/hilogcat.pid); rm -f /tmp/ohjs/hilogcat.pid'
  ```
- **部署前**：`rm -f /data/ohjs/debug.*`（见上）。

## 4. 常用命令

```sh
# qemu-ide 环境
lite/test/qemu-ide/run-qemu-hdcd.sh start|stop|status
lite/test/qemu-ide/run-qemu-hdcd.sh jsdebug start|stop   # 仅调试协议

# 主机
export OHOS_HDC_SERVER_PORT=8711
hdc -s 127.0.0.1:8711 tconn 127.0.0.1:8710
hdc -s 127.0.0.1:8711 tconn 127.0.0.1:8710 -remove      # 断开
hdc -s 127.0.0.1:8711 -t 127.0.0.1:8710 shell 'echo ok; echo __RC=$?'
hdc -s 127.0.0.1:8711 -t 127.0.0.1:8710 file send ./app.hap /tmp/ohjs/app.hap

# 验收脚本
lite/test/qemu-ide/verify.sh                 # G2 bm/aa/hilogcat/__RC
lite/test/qemu-ide/verify-jsdebug.sh         # jerry 经 fport
lite/test/qemu-ide/verify-acedbg-gate.sh     # ACE gate
lite/test/qemu-ide/verify-jsdebug-marker.sh  # /data/ohjs/debug.<bundle>
lite/test/qemu-ide/smoke-stability.sh        # 重连 / 连续 file send / 并行 shell
lite/test/qemu-ide/verify-contract.sh        # 端口/路径/标记 residual 回归（负例必须失败）
```

## 5. 禁止事项（摘要）

- 用 **18710** 做普通 deploy（G2）。
- 依赖 `hdc shell` 的进程退出码而不带 `__RC`。
- 依赖 `hdc hilog` 而不准备 `hilogcat`。
- 留下 `/data/ohjs/debug.*` 过完 debug 会话（下次 `aa start` 会阻塞）。

## 6. 验收 / 回归（verification）

```sh
# 独立跑合同回归（G2 start 模式；会 stop jsdebug 别名以便负例成立）
lite/test/qemu-ide/verify-contract.sh

# 挂到既有入口
SKIP_CONTRACT=0 lite/test/qemu-ide/smoke-stability.sh   # 默认会调 verify-contract
CONTRACT=1 lite/test/qemu-ide/verify.sh                  # 可选
```

`verify-contract.sh` 断言：

| 项                                                                 | 期望                                            |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| 主机 `hdc -v`                                                      | `Ver: 3.2.0c`                                   |
| `tconn 127.0.0.1:8710` + shell                                     | **PASS**                                        |
| `tconn 127.0.0.1:18710`（仅 `start`、无 jsdebug）                  | **FAIL**（负例；若意外 Connect OK → 脚本 FAIL） |
| `test -d /data/ohjs`（及 `/tmp/ohjs`）                             | **PASS**                                        |
| 种植 `/data/ohjs/debug.<bundle>` 后执行 `rm -f /data/ohjs/debug.*` | 标记清除；残留 → **FAIL / REFUSE**              |

日志：`lite/test/qemu-ide-contract.log`。
