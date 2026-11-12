"""桌面版后端入口：由 PyInstaller 打包成可执行文件，被 Electron 主进程启动。"""

import os
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.main import app  # noqa: E402  必须在 sys.path 调整后导入

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("SOCCERBOARD_PORT", "8123")))
