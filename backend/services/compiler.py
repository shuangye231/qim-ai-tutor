import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


MAX_SOURCE_LENGTH = 30_000
MAX_STDIN_LENGTH = 8_000
MAX_OUTPUT_LENGTH = 16_000
CPP_IMAGE = os.getenv("CPP_RUNNER_IMAGE", "gcc:14-bookworm")
PYTHON_IMAGE = os.getenv("PYTHON_RUNNER_IMAGE", "python:3.12-slim")


class CompilerUnavailable(RuntimeError):
    pass


def _run_local_python(source: str, stdin: str) -> dict:
    """Local-development fallback when Docker Desktop is unavailable."""
    with tempfile.TemporaryDirectory(prefix="qima-python-local-") as temp_dir:
        source_path = Path(temp_dir) / "main.py"
        source_path.write_text(source, encoding="utf-8")
        try:
            result = subprocess.run(
                [sys.executable, "-X", "utf8", "-I", str(source_path)],
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
                timeout=5,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            return {
                "stdout": (error.stdout or "")[-MAX_OUTPUT_LENGTH:],
                "stderr": "程序运行超过 5 秒，已自动停止。",
                "exit_code": 124,
                "timed_out": True,
            }
    return {
        "stdout": result.stdout[-MAX_OUTPUT_LENGTH:],
        "stderr": result.stderr[-MAX_OUTPUT_LENGTH:],
        "exit_code": result.returncode,
        "timed_out": result.returncode == 124,
    }


def run_python(source: str, stdin: str = "") -> dict:
    source = str(source or "")
    stdin = str(stdin or "")
    if not source.strip():
        raise ValueError("请先输入 Python 代码")
    if len(source) > MAX_SOURCE_LENGTH:
        raise ValueError("代码过长，请控制在 30000 个字符以内")
    if len(stdin) > MAX_STDIN_LENGTH:
        raise ValueError("程序输入过长，请控制在 8000 个字符以内")
    docker = shutil.which("docker")
    if not docker:
        return _run_local_python(source, stdin)

    # A local development machine may have Docker running without the Python
    # runner image (or without registry access). Avoid counting an image pull
    # against the five-second program limit in that case.
    image_check = subprocess.run(
        [docker, "image", "inspect", PYTHON_IMAGE],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=5,
        check=False,
    )
    if image_check.returncode != 0:
        return _run_local_python(source, stdin)

    with tempfile.TemporaryDirectory(prefix="qima-python-") as temp_dir:
        source_path = Path(temp_dir) / "main.py"
        source_path.write_text(source, encoding="utf-8")
        mount = f"{source_path.resolve()}:/workspace/main.py:ro"
        command = [
            docker, "run", "--rm", "--network", "none", "--memory", "128m",
            "--cpus", "0.5", "--pids-limit", "32", "--read-only",
            "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,nosuid,noexec,size=32m",
            "-v", mount, "-i", PYTHON_IMAGE, "python", "-I", "/workspace/main.py",
        ]
        try:
            result = subprocess.run(
                command,
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=5,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            return {"stdout": (error.stdout or "")[-MAX_OUTPUT_LENGTH:], "stderr": "程序运行超过 5 秒，已自动停止。", "exit_code": 124, "timed_out": True}
        except OSError as error:
            return _run_local_python(source, stdin)

    stderr = result.stderr[-MAX_OUTPUT_LENGTH:]
    docker_error = stderr.lower()
    if result.returncode == 125 or ("docker" in docker_error and "connect" in docker_error):
        return _run_local_python(source, stdin)
    return {
        "stdout": result.stdout[-MAX_OUTPUT_LENGTH:],
        "stderr": stderr,
        "exit_code": result.returncode,
        "timed_out": result.returncode == 124,
    }


def run_cpp(source: str, stdin: str = "") -> dict:
    source = str(source or "")
    stdin = str(stdin or "")
    if not source.strip():
        raise ValueError("请先输入 C++ 代码")
    if len(source) > MAX_SOURCE_LENGTH:
        raise ValueError("代码过长，请控制在 30000 个字符以内")
    if len(stdin) > MAX_STDIN_LENGTH:
        raise ValueError("程序输入过长，请控制在 8000 个字符以内")
    docker = shutil.which("docker")
    if not docker:
        raise CompilerUnavailable("未找到 Docker，请先安装并启动 Docker Desktop")

    with tempfile.TemporaryDirectory(prefix="qima-cpp-") as temp_dir:
        source_path = Path(temp_dir) / "main.cpp"
        source_path.write_text(source, encoding="utf-8")
        mount = f"{source_path.resolve()}:/workspace/main.cpp:ro"
        command = [
            docker, "run", "--rm", "--network", "none", "--memory", "192m",
            "--cpus", "0.75", "--pids-limit", "64", "--read-only",
            "--security-opt", "no-new-privileges", "--tmpfs", "/tmp:rw,nosuid,exec,size=64m",
            "-v", mount, "-i", CPP_IMAGE, "sh", "-lc",
            "g++ -std=c++17 -O2 -Wall -Wextra /workspace/main.cpp -o /tmp/main && timeout 3s /tmp/main",
        ]
        try:
            result = subprocess.run(
                command,
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=25,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            return {"stdout": (error.stdout or "")[-MAX_OUTPUT_LENGTH:], "stderr": "编译或运行超过 25 秒，已停止。首次使用时请确认编译镜像已下载。", "exit_code": 124, "timed_out": True}
        except OSError as error:
            raise CompilerUnavailable("Docker 启动失败，请确认 Docker Desktop 正在运行") from error

    stderr = result.stderr[-MAX_OUTPUT_LENGTH:]
    docker_unavailable = (
        result.returncode != 0
        and any(message in stderr.lower() for message in (
            "error response from daemon",
            "cannot connect to the docker daemon",
            "docker desktop is unable to start",
        ))
    )
    if result.returncode == 125 or docker_unavailable:
        stderr = "C++ 编译服务暂未就绪，请联系老师确认服务器的 Docker 编译环境已启动。"
    elif result.returncode == 124:
        stderr = (stderr + "\n程序运行超过 3 秒，已自动停止。").strip()
    return {
        "stdout": result.stdout[-MAX_OUTPUT_LENGTH:],
        "stderr": stderr,
        "exit_code": result.returncode,
        "timed_out": result.returncode == 124,
    }
